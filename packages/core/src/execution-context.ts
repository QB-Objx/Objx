import { createInternalId } from './utils.js';
import { AsyncLocalStorageExecutionContextStore } from './execution-context-node.js';

export interface TransactionScope<TTransaction = unknown> {
  readonly id: string;
  readonly raw: TTransaction;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExecutionContext {
  readonly id: string;
  readonly parentId?: string;
  readonly values: ReadonlyMap<string, unknown>;
  readonly transaction?: TransactionScope;
}

export interface ExecutionContextInit {
  readonly values?: Readonly<Record<string, unknown>>;
  readonly transaction?: TransactionScope;
  readonly parent?: ExecutionContext;
}

export interface ExecutionContextStore<TContext> {
  get(): TContext | undefined;
  run<TResult>(context: TContext, callback: () => TResult): TResult;
}

export class InMemoryExecutionContextStore<TContext>
  implements ExecutionContextStore<TContext>
{
  #current: TContext | undefined;

  get(): TContext | undefined {
    return this.#current;
  }

  run<TResult>(context: TContext, callback: () => TResult): TResult {
    const previous = this.#current;
    this.#current = context;

    try {
      return callback();
    } finally {
      this.#current = previous;
    }
  }
}

function isExecutionContext(value: ExecutionContext | ExecutionContextInit): value is ExecutionContext {
  return 'id' in value && 'values' in value;
}

const EMPTY_CONTEXT_VALUES = new Map<string, unknown>();

export class ExecutionContextManager {
  readonly #store: ExecutionContextStore<ExecutionContext>;

  constructor(
    store: ExecutionContextStore<ExecutionContext> = new AsyncLocalStorageExecutionContextStore(),
  ) {
    this.#store = store;
  }

  current(): ExecutionContext | undefined {
    return this.#store.get();
  }

  create(init: ExecutionContextInit = {}): ExecutionContext {
    const parent = init.parent ?? this.current();
    const baseValues = parent?.values ?? EMPTY_CONTEXT_VALUES;
    let values: ReadonlyMap<string, unknown> | Map<string, unknown> = baseValues;

    if (init.values) {
      values = new Map<string, unknown>(baseValues);

      for (const [key, value] of Object.entries(init.values)) {
        (values as Map<string, unknown>).set(key, value);
      }
    }

    const context: {
      id: string;
      parentId?: string;
      values: ReadonlyMap<string, unknown>;
      transaction?: TransactionScope;
    } = {
      id: createInternalId('ctx'),
      values,
    };

    if (parent) {
      context.parentId = parent.id;
    }

    const transaction = init.transaction ?? parent?.transaction;

    if (transaction) {
      context.transaction = transaction;
    }

    return context;
  }

  run<TResult>(contextOrInit: ExecutionContext | ExecutionContextInit, callback: () => TResult): TResult {
    const context = isExecutionContext(contextOrInit) ? contextOrInit : this.create(contextOrInit);
    return this.#store.run(context, callback);
  }

  getValue<TValue = unknown>(key: string): TValue | undefined {
    return this.current()?.values.get(key) as TValue | undefined;
  }
}

export function createTransactionScope<TTransaction>(
  raw: TTransaction,
  metadata?: Readonly<Record<string, unknown>>,
): TransactionScope<TTransaction> {
  const scope: {
    id: string;
    raw: TTransaction;
    metadata?: Readonly<Record<string, unknown>>;
  } = {
    id: createInternalId('trx'),
    raw,
  };

  if (metadata) {
    scope.metadata = metadata;
  }

  return scope;
}

export function createExecutionContextManager(
  store?: ExecutionContextStore<ExecutionContext>,
): ExecutionContextManager {
  return new ExecutionContextManager(store);
}

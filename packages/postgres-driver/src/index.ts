import {
  createDefaultSqlResultNormalizer,
  createObjxSqlCompiler,
  createSession,
  type CompiledQuery,
  joinSql,
  type ObjxSession,
  type ObjxSessionOptions,
  type ObjxTransactionInitializationContext,
  type ObjxTransactionInitializer,
  type SqlResultNormalizer,
  type SqlResultNormalizerContext,
  type SqlResultSet,
  type SqlExecutionRequest,
  type SqlDriver,
  type SqlTransactionRequest,
  isSqlResultSet,
  sql,
} from '@qbobjx/sql-engine';

export type PostgresQueryResultRow = Record<string, unknown>;

export interface PostgresQueryResult<
  TRow extends PostgresQueryResultRow = PostgresQueryResultRow,
> {
  readonly rows: readonly TRow[];
  readonly rowCount: number | null;
  readonly command?: string;
}

export interface PostgresQueryExecutor {
  query(
    sqlText: string,
    parameters?: readonly unknown[],
  ): Promise<PostgresQueryResult>;
}

export interface PostgresPoolClient extends PostgresQueryExecutor {
  release(error?: Error | boolean): void;
}

export interface PostgresPool extends PostgresQueryExecutor {
  connect(): Promise<PostgresPoolClient>;
  end?(): Promise<void>;
}

export interface ObjxPostgresTransaction {
  readonly kind: 'objx:postgres-transaction';
  readonly client: PostgresQueryExecutor;
  readonly depth: number;
  readonly savepointName?: string;
}

interface InternalPostgresTransaction extends ObjxPostgresTransaction {
  readonly driverToken: object;
}

export interface CreatePostgresDriverOptions {
  readonly pool?: PostgresPool;
  readonly client?: PostgresQueryExecutor;
  readonly closePoolOnDispose?: boolean;
}

export interface ObjxPostgresDriver extends SqlDriver<ObjxPostgresTransaction> {
  readonly pool?: PostgresPool;
  readonly client: PostgresQueryExecutor;
  close(): Promise<void>;
}

export interface CreatePostgresSessionOptions
  extends Omit<ObjxSessionOptions<ObjxPostgresTransaction>, 'driver' | 'compiler'>,
    CreatePostgresDriverOptions {
  readonly driver?: ObjxPostgresDriver;
  readonly compiler?: ObjxSessionOptions<ObjxPostgresTransaction>['compiler'];
  readonly executionContextSettings?: PostgresExecutionContextSettingsOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRowArray(value: unknown): value is readonly PostgresQueryResultRow[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function isPostgresQueryExecutor(value: unknown): value is PostgresQueryExecutor {
  return isRecord(value) && 'query' in value && typeof value.query === 'function';
}

function isInternalPostgresTransaction(
  value: unknown,
  driverToken: object,
): value is InternalPostgresTransaction {
  return (
    isRecord(value) &&
    value.kind === 'objx:postgres-transaction' &&
    value.driverToken === driverToken &&
    'client' in value &&
    isPostgresQueryExecutor(value.client) &&
    'depth' in value &&
    typeof value.depth === 'number'
  );
}

function serializePostgresParameter(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError('Undefined cannot be bound to a PostgreSQL parameter.');
  }

  if (value instanceof Uint8Array && !(value instanceof Buffer)) {
    return Buffer.from(value);
  }

  return value;
}

function extractSqlParameters(compiledQuery: CompiledQuery): readonly unknown[] {
  return compiledQuery.parameters.map((parameter) => serializePostgresParameter(parameter.value));
}

function createTransaction(
  client: PostgresQueryExecutor,
  depth: number,
  driverToken: object,
  savepointName?: string,
): InternalPostgresTransaction {
  const transaction: {
    kind: 'objx:postgres-transaction';
    client: PostgresQueryExecutor;
    depth: number;
    driverToken: object;
    savepointName?: string;
  } = {
    kind: 'objx:postgres-transaction',
    client,
    depth,
    driverToken,
  };

  if (savepointName) {
    transaction.savepointName = savepointName;
  }

  return transaction;
}

async function runQuery(
  client: PostgresQueryExecutor,
  compiledQuery: CompiledQuery,
): Promise<PostgresQueryResult> {
  return client.query(compiledQuery.sql, extractSqlParameters(compiledQuery));
}

const BEGIN_SQL = 'begin';
const COMMIT_SQL = 'commit';
const ROLLBACK_SQL = 'rollback';
const SAVEPOINT_PREFIX = 'objx_sp_';

export class PostgresResultNormalizer implements SqlResultNormalizer {
  readonly #fallback = createDefaultSqlResultNormalizer();

  normalize(
    result: unknown,
    context: SqlResultNormalizerContext,
  ): SqlResultSet {
    if (isSqlResultSet(result)) {
      return result;
    }

    if (isRecord(result) && 'rows' in result && isRowArray(result.rows)) {
      return {
        rows: result.rows,
        rowCount: typeof result.rowCount === 'number' ? result.rowCount : result.rows.length,
        ...(typeof result.command === 'string' ? { command: result.command } : {}),
        raw: result,
      };
    }

    return this.#fallback.normalize(result, context);
  }
}

export function createPostgresResultNormalizer(): SqlResultNormalizer {
  return new PostgresResultNormalizer();
}

export interface PostgresExecutionContextSettingsValueContext {
  readonly executionContext: ObjxTransactionInitializationContext<ObjxPostgresTransaction>['executionContext'];
  readonly parentExecutionContext: ObjxTransactionInitializationContext<ObjxPostgresTransaction>['parentExecutionContext'];
  readonly metadata: ObjxTransactionInitializationContext<ObjxPostgresTransaction>['metadata'];
  readonly isNested: boolean;
}

export interface PostgresExecutionContextSettingBinding {
  readonly setting: string;
  readonly contextKey?: string;
  readonly value?:
    | unknown
    | ((context: PostgresExecutionContextSettingsValueContext) => unknown);
  readonly required?: boolean;
  readonly isLocal?: boolean;
  readonly applyOnNestedTransactions?: boolean;
  readonly serialize?: (
    value: unknown,
    context: PostgresExecutionContextSettingsValueContext,
  ) => string | undefined;
}

export interface PostgresExecutionContextSettingsOptions {
  readonly bindings: readonly PostgresExecutionContextSettingBinding[];
}

function defaultSerializeExecutionContextSettingValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
}

function resolveExecutionContextSettingValue(
  binding: PostgresExecutionContextSettingBinding,
  context: PostgresExecutionContextSettingsValueContext,
): unknown {
  if (binding.value !== undefined) {
    return typeof binding.value === 'function'
      ? binding.value(context)
      : binding.value;
  }

  if (!binding.contextKey) {
    return undefined;
  }

  return context.executionContext.values.get(binding.contextKey);
}

export function createPostgresSetConfigTransactionInitializer(
  options: PostgresExecutionContextSettingsOptions,
): ObjxTransactionInitializer<ObjxPostgresTransaction> {
  return async ({
    session,
    executionContext,
    parentExecutionContext,
    metadata,
    isNested,
  }) => {
    const valueContext: PostgresExecutionContextSettingsValueContext = {
      executionContext,
      parentExecutionContext,
      metadata,
      isNested,
    };
    const setConfigCalls = [];

    for (const binding of options.bindings) {
      if (isNested && binding.applyOnNestedTransactions === false) {
        continue;
      }

      const resolvedValue = resolveExecutionContextSettingValue(binding, valueContext);

      if (resolvedValue === undefined) {
        if (binding.required) {
          throw new Error(
            `Postgres execution context setting "${binding.setting}" requires value "${binding.contextKey ?? binding.setting}".`,
          );
        }

        continue;
      }

      const serializedValue = binding.serialize
        ? binding.serialize(resolvedValue, valueContext)
        : defaultSerializeExecutionContextSettingValue(resolvedValue);

      if (serializedValue === undefined) {
        if (binding.required) {
          throw new Error(
            `Postgres execution context setting "${binding.setting}" resolved to an undefined value.`,
          );
        }

        continue;
      }

      setConfigCalls.push(
        sql`set_config(${binding.setting}, ${serializedValue}, ${binding.isLocal ?? true})`,
      );
    }

    if (setConfigCalls.length === 0) {
      return;
    }

    await session.execute(sql`select ${joinSql(setConfigCalls, ', ')}`);
  };
}

export function createPostgresDriver(
  options: CreatePostgresDriverOptions = {},
): ObjxPostgresDriver {
  if (options.pool && options.client) {
    throw new Error('Provide either "pool" or "client", but not both.');
  }

  const pool = options.pool;
  const baseClient = pool ?? options.client;
  const closePoolOnDispose = options.closePoolOnDispose ?? false;

  if (!baseClient) {
    throw new Error(
      'Postgres driver requires a "pool" or "client" query executor.',
    );
  }

  let transactionCounter = 0;
  const driverToken = {};

  return {
    ...(pool ? { pool } : {}),
    client: baseClient,
    async execute<TResult = unknown>(
      compiledQuery: CompiledQuery,
      request?: SqlExecutionRequest<ObjxPostgresTransaction>,
    ) {
      const transaction = request?.transaction;

      if (transaction !== undefined) {
        if (!isInternalPostgresTransaction(transaction, driverToken)) {
          throw new Error(
            'Postgres transaction belongs to a different driver instance.',
          );
        }

        return runQuery(transaction.client, compiledQuery) as TResult;
      }

      return runQuery(baseClient, compiledQuery) as TResult;
    },
    async transaction<TResult>(
      callback: (transaction: ObjxPostgresTransaction) => Promise<TResult>,
      request?: SqlTransactionRequest,
    ): Promise<TResult> {
      const parentRaw = request?.executionContext?.transaction?.raw;
      const parentTransaction = isInternalPostgresTransaction(parentRaw, driverToken)
        ? parentRaw
        : undefined;

      if (parentTransaction) {
        const savepointName = `${SAVEPOINT_PREFIX}${++transactionCounter}`;
        const nestedTransaction = createTransaction(
          parentTransaction.client,
          parentTransaction.depth + 1,
          driverToken,
          savepointName,
        );

        await parentTransaction.client.query(
          `savepoint ${savepointName}`,
        );

        try {
          const result = await callback(nestedTransaction);
          await parentTransaction.client.query(
            `release savepoint ${savepointName}`,
          );
          return result;
        } catch (error) {
          try {
            await parentTransaction.client.query(
              `rollback to savepoint ${savepointName}`,
            );
          } catch {
            // Keep the original failure as the primary error.
          }

          throw error;
        }
      }

      if (pool) {
        const transactionClient = await pool.connect();
        const rootTransaction = createTransaction(transactionClient, 0, driverToken);

        try {
          await transactionClient.query(BEGIN_SQL);

          try {
            const result = await callback(rootTransaction);
            await transactionClient.query(COMMIT_SQL);
            return result;
          } catch (error) {
            try {
              await transactionClient.query(ROLLBACK_SQL);
            } catch {
              // Keep the original failure as the primary error.
            }

            throw error;
          }
        } finally {
          transactionClient.release();
        }
      }

      const rootTransaction = createTransaction(baseClient, 0, driverToken);
      await baseClient.query(BEGIN_SQL);

      try {
        const result = await callback(rootTransaction);
        await baseClient.query(COMMIT_SQL);
        return result;
      } catch (error) {
        try {
          await baseClient.query(ROLLBACK_SQL);
        } catch {
          // Keep the original failure as the primary error.
        }

        throw error;
      }
    },
    async close() {
      if (closePoolOnDispose && pool && typeof pool.end === 'function') {
        await pool.end();
      }
    },
  };
}

export function createPostgresSession(
  options: CreatePostgresSessionOptions = {},
): ObjxSession<ObjxPostgresTransaction> {
  const driver = options.driver ?? createPostgresDriver(options);
  const transactionInitializers = [
    ...(options.transactionInitializers ?? []),
    ...(options.executionContextSettings
      ? [createPostgresSetConfigTransactionInitializer(options.executionContextSettings)]
      : []),
  ];
  const sessionOptions = {
    driver,
    compiler: options.compiler ?? createObjxSqlCompiler({ dialect: 'postgres' }),
    ...(options.executionContextManager
      ? { executionContextManager: options.executionContextManager }
      : {}),
    ...(options.observers ? { observers: options.observers } : {}),
    ...(options.plugins ? { plugins: options.plugins } : {}),
    ...(transactionInitializers.length > 0
      ? { transactionInitializers }
      : {}),
    resultNormalizer: options.resultNormalizer ?? createPostgresResultNormalizer(),
    ...(options.hydrateByDefault !== undefined
      ? { hydrateByDefault: options.hydrateByDefault }
      : {}),
  };

  return createSession(sessionOptions);
}

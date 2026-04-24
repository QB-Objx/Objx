import type { ExecutionContext } from './execution-context.js';
import type { AnyColumnDefinition } from './columns.js';
import type { AnyModelDefinition } from './model.js';
import type { QueryNode } from './query.js';
import { deepFreeze } from './utils.js';

export interface ModelPluginContext<TModel extends AnyModelDefinition = AnyModelDefinition> {
  readonly model: TModel;
  readonly metadata: Map<string, unknown>;
  setMetadata(key: string, value: unknown): void;
  getMetadata<TValue = unknown>(key: string): TValue | undefined;
}

export type ObjxPluginQueryKind = QueryNode['kind'] | 'raw';

export interface PluginCompiledQueryInfo {
  readonly sql: string;
  readonly parameterCount: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PluginTimingInfo {
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly durationMs?: number;
}

export interface QueryPluginContext {
  readonly model: AnyModelDefinition | undefined;
  readonly executionContext: ExecutionContext | undefined;
  readonly metadata: ReadonlyMap<string, unknown>;
  readonly query?: QueryNode;
  readonly queryKind?: ObjxPluginQueryKind;
  readonly compiledQuery?: PluginCompiledQueryInfo;
  readonly timing?: PluginTimingInfo;
}

export interface ResultPluginContext extends QueryPluginContext {
  readonly result: unknown;
}

export interface ErrorPluginContext extends QueryPluginContext {
  readonly error: unknown;
}

export interface ModelDefinePluginContext {
  readonly modelName: string;
  readonly table: string;
  readonly dbTable: string;
  readonly columnDefinitions: Readonly<Record<string, AnyColumnDefinition>>;
  setTableDbName(dbTable: string): void;
  getTableDbName(): string;
  setColumnDbName(columnKey: string, dbName: string): void;
  getColumnDbName(columnKey: string): string | undefined;
}

export interface ObjxPluginHooks {
  onModelDefine?(context: ModelDefinePluginContext): void;
  onModelRegister?(context: ModelPluginContext): void;
  onQueryCreate?(context: QueryPluginContext): void;
  onQueryBuild?(context: QueryPluginContext): void;
  onQueryExecute?(context: QueryPluginContext): void;
  onResult?(context: ResultPluginContext): unknown | void;
  onError?(context: ErrorPluginContext): unknown | void;
}

export interface ObjxPlugin {
  readonly name: string;
  readonly version?: string;
  readonly hooks?: ObjxPluginHooks;
}

export interface ModelPluginRegistration<TModel extends AnyModelDefinition = AnyModelDefinition> {
  readonly model: TModel;
  readonly metadata: ReadonlyMap<string, unknown>;
  readonly plugins: readonly ObjxPlugin[];
}

export function definePlugin<TPlugin extends ObjxPlugin>(plugin: TPlugin): Readonly<TPlugin> {
  return deepFreeze(plugin);
}

export class ObjxPluginRuntime {
  readonly #globalPlugins: readonly ObjxPlugin[];

  constructor(globalPlugins: readonly ObjxPlugin[] = []) {
    this.#globalPlugins = deepFreeze([...globalPlugins]);
  }

  registerModel<TModel extends AnyModelDefinition>(model: TModel): ModelPluginRegistration<TModel> {
    const plugins = deepFreeze([...this.#globalPlugins, ...model.plugins]);
    const metadata = new Map<string, unknown>();
    const context: ModelPluginContext<TModel> = {
      model,
      metadata,
      setMetadata(key, value) {
        metadata.set(key, value);
      },
      getMetadata<TValue = unknown>(key: string): TValue | undefined {
        return metadata.get(key) as TValue | undefined;
      },
    };

    for (const plugin of plugins) {
      plugin.hooks?.onModelRegister?.(context);
    }

    return {
      model,
      metadata: new Map(metadata),
      plugins,
    };
  }

  emitQueryCreate(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void {
    this.#emitVoidHook(plugins, 'onQueryCreate', context);
  }

  emitQueryBuild(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void {
    this.#emitVoidHook(plugins, 'onQueryBuild', context);
  }

  emitQueryExecute(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void {
    this.#emitVoidHook(plugins, 'onQueryExecute', context);
  }

  emitResult(
    context: Omit<ResultPluginContext, 'result'>,
    result: unknown,
    plugins: readonly ObjxPlugin[],
  ): unknown {
    let current = result;

    for (const plugin of plugins) {
      const next = plugin.hooks?.onResult?.({
        ...context,
        result: current,
      });

      if (next !== undefined) {
        current = next;
      }
    }

    return current;
  }

  emitError(
    context: Omit<ErrorPluginContext, 'error'>,
    error: unknown,
    plugins: readonly ObjxPlugin[],
  ): unknown {
    let current = error;

    for (const plugin of plugins) {
      const next = plugin.hooks?.onError?.({
        ...context,
        error: current,
      });

      if (next !== undefined) {
        current = next;
      }
    }

    return current;
  }

  #emitVoidHook(
    plugins: readonly ObjxPlugin[],
    hookName: 'onQueryCreate' | 'onQueryBuild' | 'onQueryExecute',
    context: QueryPluginContext,
  ): void {
    for (const plugin of plugins) {
      plugin.hooks?.[hookName]?.(context);
    }
  }
}

export function createPluginRuntime(globalPlugins?: readonly ObjxPlugin[]): ObjxPluginRuntime {
  return new ObjxPluginRuntime(globalPlugins);
}

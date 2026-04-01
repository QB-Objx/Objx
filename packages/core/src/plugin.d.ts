import type { ExecutionContext } from './execution-context.js';
import type { AnyModelDefinition } from './model.js';
import type { QueryNode } from './query.js';
export interface ModelPluginContext<TModel extends AnyModelDefinition = AnyModelDefinition> {
    readonly model: TModel;
    readonly metadata: Map<string, unknown>;
    setMetadata(key: string, value: unknown): void;
    getMetadata<TValue = unknown>(key: string): TValue | undefined;
}
export type ObjxPluginQueryKind = QueryNode['kind'] | 'raw';
export interface QueryPluginContext {
    readonly model: AnyModelDefinition | undefined;
    readonly executionContext: ExecutionContext | undefined;
    readonly metadata: ReadonlyMap<string, unknown>;
    readonly query?: QueryNode;
    readonly queryKind?: ObjxPluginQueryKind;
}
export interface ResultPluginContext extends QueryPluginContext {
    readonly result: unknown;
}
export interface ErrorPluginContext extends QueryPluginContext {
    readonly error: unknown;
}
export interface ObjxPluginHooks {
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
export declare function definePlugin<TPlugin extends ObjxPlugin>(plugin: TPlugin): Readonly<TPlugin>;
export declare class ObjxPluginRuntime {
    #private;
    constructor(globalPlugins?: readonly ObjxPlugin[]);
    registerModel<TModel extends AnyModelDefinition>(model: TModel): ModelPluginRegistration<TModel>;
    emitQueryCreate(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void;
    emitQueryBuild(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void;
    emitQueryExecute(context: QueryPluginContext, plugins: readonly ObjxPlugin[]): void;
    emitResult(context: Omit<ResultPluginContext, 'result'>, result: unknown, plugins: readonly ObjxPlugin[]): unknown;
    emitError(context: Omit<ErrorPluginContext, 'error'>, error: unknown, plugins: readonly ObjxPlugin[]): unknown;
}
export declare function createPluginRuntime(globalPlugins?: readonly ObjxPlugin[]): ObjxPluginRuntime;
//# sourceMappingURL=plugin.d.ts.map
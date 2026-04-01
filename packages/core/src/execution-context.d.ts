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
export declare class InMemoryExecutionContextStore<TContext> implements ExecutionContextStore<TContext> {
    #private;
    get(): TContext | undefined;
    run<TResult>(context: TContext, callback: () => TResult): TResult;
}
export declare class ExecutionContextManager {
    #private;
    constructor(store?: ExecutionContextStore<ExecutionContext>);
    current(): ExecutionContext | undefined;
    create(init?: ExecutionContextInit): ExecutionContext;
    run<TResult>(contextOrInit: ExecutionContext | ExecutionContextInit, callback: () => TResult): TResult;
    getValue<TValue = unknown>(key: string): TValue | undefined;
}
export declare function createTransactionScope<TTransaction>(raw: TTransaction, metadata?: Readonly<Record<string, unknown>>): TransactionScope<TTransaction>;
export declare function createExecutionContextManager(store?: ExecutionContextStore<ExecutionContext>): ExecutionContextManager;
//# sourceMappingURL=execution-context.d.ts.map
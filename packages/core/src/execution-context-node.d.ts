import type { ExecutionContextStore } from './execution-context.js';
export declare class AsyncLocalStorageExecutionContextStore<TContext> implements ExecutionContextStore<TContext> {
    #private;
    get(): TContext | undefined;
    run<TResult>(context: TContext, callback: () => TResult): TResult;
}
//# sourceMappingURL=execution-context-node.d.ts.map
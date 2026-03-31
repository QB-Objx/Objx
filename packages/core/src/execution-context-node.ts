import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExecutionContextStore } from './execution-context.js';

export class AsyncLocalStorageExecutionContextStore<TContext>
  implements ExecutionContextStore<TContext>
{
  readonly #storage = new AsyncLocalStorage<TContext>();

  get(): TContext | undefined {
    return this.#storage.getStore();
  }

  run<TResult>(context: TContext, callback: () => TResult): TResult {
    return this.#storage.run(context, callback);
  }
}

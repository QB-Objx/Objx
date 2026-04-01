import { AsyncLocalStorage } from 'node:async_hooks';
export class AsyncLocalStorageExecutionContextStore {
    #storage = new AsyncLocalStorage();
    get() {
        return this.#storage.getStore();
    }
    run(context, callback) {
        return this.#storage.run(context, callback);
    }
}

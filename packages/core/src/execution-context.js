import { createInternalId } from './utils.js';
import { AsyncLocalStorageExecutionContextStore } from './execution-context-node.js';
export class InMemoryExecutionContextStore {
    #current;
    get() {
        return this.#current;
    }
    run(context, callback) {
        const previous = this.#current;
        this.#current = context;
        try {
            return callback();
        }
        finally {
            this.#current = previous;
        }
    }
}
function isExecutionContext(value) {
    return 'id' in value && 'values' in value;
}
export class ExecutionContextManager {
    #store;
    constructor(store = new AsyncLocalStorageExecutionContextStore()) {
        this.#store = store;
    }
    current() {
        return this.#store.get();
    }
    create(init = {}) {
        const parent = init.parent ?? this.current();
        const values = new Map(parent?.values ?? []);
        if (init.values) {
            for (const [key, value] of Object.entries(init.values)) {
                values.set(key, value);
            }
        }
        const context = {
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
    run(contextOrInit, callback) {
        const context = isExecutionContext(contextOrInit) ? contextOrInit : this.create(contextOrInit);
        return this.#store.run(context, callback);
    }
    getValue(key) {
        return this.current()?.values.get(key);
    }
}
export function createTransactionScope(raw, metadata) {
    const scope = {
        id: createInternalId('trx'),
        raw,
    };
    if (metadata) {
        scope.metadata = metadata;
    }
    return scope;
}
export function createExecutionContextManager(store) {
    return new ExecutionContextManager(store);
}

import { createPluginRuntime } from './plugin.js';
export class DuplicateModelRegistrationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DuplicateModelRegistrationError';
    }
}
export class ModelRegistry {
    #pluginRuntime;
    #registrationsByName = new Map();
    #registrationsByTable = new Map();
    constructor(options = {}) {
        this.#pluginRuntime = createPluginRuntime(options.plugins);
    }
    register(...models) {
        for (const model of models) {
            if (this.#registrationsByName.has(model.name)) {
                throw new DuplicateModelRegistrationError(`Model name "${model.name}" is already registered.`);
            }
            if (this.#registrationsByTable.has(model.table)) {
                throw new DuplicateModelRegistrationError(`Model table "${model.table}" is already registered.`);
            }
            const registration = this.#pluginRuntime.registerModel(model);
            this.#registrationsByName.set(model.name, registration);
            this.#registrationsByTable.set(model.table, registration);
        }
        return models;
    }
    get pluginRuntime() {
        return this.#pluginRuntime;
    }
    getByName(name) {
        return this.#registrationsByName.get(name);
    }
    getByTable(table) {
        return this.#registrationsByTable.get(table);
    }
    all() {
        return [...this.#registrationsByName.values()];
    }
}
export function createModelRegistry(options) {
    return new ModelRegistry(options);
}

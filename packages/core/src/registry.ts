import type { AnyModelDefinition } from './model.js';
import type { ModelPluginRegistration, ObjxPlugin, ObjxPluginRuntime } from './plugin.js';
import { createPluginRuntime } from './plugin.js';

export class DuplicateModelRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateModelRegistrationError';
  }
}

export interface ModelRegistryOptions {
  readonly plugins?: readonly ObjxPlugin[];
}

export class ModelRegistry {
  readonly #pluginRuntime: ObjxPluginRuntime;
  readonly #registrationsByName = new Map<string, ModelPluginRegistration>();
  readonly #registrationsByTable = new Map<string, ModelPluginRegistration>();

  constructor(options: ModelRegistryOptions = {}) {
    this.#pluginRuntime = createPluginRuntime(options.plugins);
  }

  register<TModels extends readonly AnyModelDefinition[]>(...models: TModels): TModels {
    for (const model of models) {
      if (this.#registrationsByName.has(model.name)) {
        throw new DuplicateModelRegistrationError(
          `Model name "${model.name}" is already registered.`,
        );
      }

      if (this.#registrationsByTable.has(model.dbTable)) {
        throw new DuplicateModelRegistrationError(
          `Model table "${model.dbTable}" is already registered.`,
        );
      }

      const registration = this.#pluginRuntime.registerModel(model);
      this.#registrationsByName.set(model.name, registration);
      this.#registrationsByTable.set(model.dbTable, registration);
    }

    return models;
  }

  get pluginRuntime(): ObjxPluginRuntime {
    return this.#pluginRuntime;
  }

  getByName<TModel extends AnyModelDefinition = AnyModelDefinition>(
    name: string,
  ): ModelPluginRegistration<TModel> | undefined {
    return this.#registrationsByName.get(name) as ModelPluginRegistration<TModel> | undefined;
  }

  getByTable<TModel extends AnyModelDefinition = AnyModelDefinition>(
    table: string,
  ): ModelPluginRegistration<TModel> | undefined {
    return this.#registrationsByTable.get(table) as ModelPluginRegistration<TModel> | undefined;
  }

  all(): readonly ModelPluginRegistration[] {
    return [...this.#registrationsByName.values()];
  }
}

export function createModelRegistry(options?: ModelRegistryOptions): ModelRegistry {
  return new ModelRegistry(options);
}

import type { AnyModelDefinition } from './model.js';
import type { ModelPluginRegistration, ObjxPlugin, ObjxPluginRuntime } from './plugin.js';
export declare class DuplicateModelRegistrationError extends Error {
    constructor(message: string);
}
export interface ModelRegistryOptions {
    readonly plugins?: readonly ObjxPlugin[];
}
export declare class ModelRegistry {
    #private;
    constructor(options?: ModelRegistryOptions);
    register<TModels extends readonly AnyModelDefinition[]>(...models: TModels): TModels;
    get pluginRuntime(): ObjxPluginRuntime;
    getByName<TModel extends AnyModelDefinition = AnyModelDefinition>(name: string): ModelPluginRegistration<TModel> | undefined;
    getByTable<TModel extends AnyModelDefinition = AnyModelDefinition>(table: string): ModelPluginRegistration<TModel> | undefined;
    all(): readonly ModelPluginRegistration[];
}
export declare function createModelRegistry(options?: ModelRegistryOptions): ModelRegistry;
//# sourceMappingURL=registry.d.ts.map
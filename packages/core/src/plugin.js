import { deepFreeze } from './utils.js';
export function definePlugin(plugin) {
    return deepFreeze(plugin);
}
export class ObjxPluginRuntime {
    #globalPlugins;
    constructor(globalPlugins = []) {
        this.#globalPlugins = deepFreeze([...globalPlugins]);
    }
    registerModel(model) {
        const plugins = deepFreeze([...this.#globalPlugins, ...model.plugins]);
        const metadata = new Map();
        const context = {
            model,
            metadata,
            setMetadata(key, value) {
                metadata.set(key, value);
            },
            getMetadata(key) {
                return metadata.get(key);
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
    emitQueryCreate(context, plugins) {
        this.#emitVoidHook(plugins, 'onQueryCreate', context);
    }
    emitQueryBuild(context, plugins) {
        this.#emitVoidHook(plugins, 'onQueryBuild', context);
    }
    emitQueryExecute(context, plugins) {
        this.#emitVoidHook(plugins, 'onQueryExecute', context);
    }
    emitResult(context, result, plugins) {
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
    emitError(context, error, plugins) {
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
    #emitVoidHook(plugins, hookName, context) {
        for (const plugin of plugins) {
            plugin.hooks?.[hookName]?.(context);
        }
    }
}
export function createPluginRuntime(globalPlugins) {
    return new ObjxPluginRuntime(globalPlugins);
}

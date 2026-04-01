import { definePlugin } from '@qbobjx/core';
export const VALIDATION_METADATA_KEY = 'validation';
export class ObjxValidationError extends Error {
    modelName;
    tableName;
    operation;
    adapterName;
    issues;
    constructor(message, options) {
        super(message);
        this.name = 'ObjxValidationError';
        this.operation = options.operation;
        this.adapterName = options.adapterName;
        this.issues = options.issues;
        if (options.modelName) {
            this.modelName = options.modelName;
        }
        if (options.tableName) {
            this.tableName = options.tableName;
        }
    }
}
export function validationOk(value) {
    return {
        success: true,
        value,
        issues: [],
    };
}
export function validationFail(issues) {
    return {
        success: false,
        issues,
    };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFunction(value) {
    return typeof value === 'function';
}
function formatPathSegment(segment, isFirst) {
    if (typeof segment === 'number') {
        return `[${segment}]`;
    }
    return isFirst ? segment : `.${segment}`;
}
function normalizePath(path) {
    if (!path || path.length === 0) {
        return undefined;
    }
    return path.map((segment, index) => formatPathSegment(segment, index === 0)).join('');
}
function normalizePathFromPointer(pointer) {
    if (!pointer || pointer.length === 0 || pointer === '/') {
        return undefined;
    }
    const segments = pointer
        .split('/')
        .slice(1)
        .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
    return normalizePath(segments);
}
function toReadonlyRecord(value) {
    return isRecord(value) ? value : undefined;
}
function createIssue(options) {
    return {
        code: options.code,
        message: options.message,
        ...(options.path ? { path: options.path } : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
    };
}
function isZodSchemaLike(value) {
    return isRecord(value) && isFunction(value.safeParse);
}
export function createZodAdapter() {
    return {
        name: 'zod',
        validate(schema, input) {
            if (!isZodSchemaLike(schema)) {
                throw new TypeError('Zod adapter requires a schema with a safeParse(input) method.');
            }
            const result = schema.safeParse(input);
            if (result.success) {
                return validationOk(result.data);
            }
            return validationFail((result.error?.issues ?? []).map((issue) => {
                const path = normalizePath(issue.path);
                const metadata = issue.expected !== undefined || issue.received !== undefined
                    ? {
                        ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
                        ...(issue.received !== undefined ? { received: issue.received } : {}),
                    }
                    : undefined;
                return createIssue({
                    code: issue.code ?? 'invalid_type',
                    message: issue.message ?? 'Validation failed.',
                    ...(path ? { path } : {}),
                    ...(metadata ? { metadata } : {}),
                });
            }));
        },
    };
}
function isAjvValidatorLike(value) {
    return isFunction(value);
}
export function createAjvAdapter(options = {}) {
    const objectCache = new WeakMap();
    const primitiveCache = new Map();
    const resolveValidator = (schema) => {
        if (isAjvValidatorLike(schema)) {
            return schema;
        }
        if (!options.ajv) {
            throw new TypeError('Ajv adapter requires an Ajv-compatible instance when the schema is not a compiled validator.');
        }
        if (typeof schema === 'object' && schema !== null) {
            const cached = objectCache.get(schema);
            if (cached) {
                return cached;
            }
            const compiled = options.ajv.compile(schema);
            objectCache.set(schema, compiled);
            return compiled;
        }
        if (primitiveCache.has(schema)) {
            return primitiveCache.get(schema);
        }
        const compiled = options.ajv.compile(schema);
        primitiveCache.set(schema, compiled);
        return compiled;
    };
    return {
        name: 'ajv',
        async validate(schema, input) {
            const validator = resolveValidator(schema);
            const valid = await validator(input);
            if (valid) {
                return validationOk(input);
            }
            return validationFail((validator.errors ?? []).map((issue) => {
                const path = normalizePathFromPointer(issue.instancePath);
                const metadata = issue.params || issue.schemaPath
                    ? {
                        ...(issue.params ?? {}),
                        ...(issue.schemaPath ? { schemaPath: issue.schemaPath } : {}),
                    }
                    : undefined;
                return createIssue({
                    code: issue.keyword ?? 'validation_error',
                    message: issue.message ?? 'Validation failed.',
                    ...(path ? { path } : {}),
                    ...(metadata ? { metadata } : {}),
                });
            }));
        },
    };
}
function normalizeValibotPath(path) {
    if (!path || path.length === 0) {
        return undefined;
    }
    const segments = path.map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number') {
            return entry;
        }
        return entry.key ?? '';
    });
    return normalizePath(segments.filter((segment) => segment !== ''));
}
export function createValibotAdapter(moduleLike) {
    if (!moduleLike || !isFunction(moduleLike.safeParse)) {
        throw new TypeError('Valibot adapter requires a module with a safeParse(schema, input) function.');
    }
    return {
        name: 'valibot',
        async validate(schema, input) {
            const result = await moduleLike.safeParse(schema, input);
            if (result.success) {
                return validationOk(result.output);
            }
            return validationFail((result.issues ?? []).map((issue) => {
                const path = normalizeValibotPath(issue.path);
                const metadata = issue.expected !== undefined || issue.received !== undefined || issue.input !== undefined
                    ? {
                        ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
                        ...(issue.received !== undefined ? { received: issue.received } : {}),
                        ...(issue.input !== undefined ? { input: issue.input } : {}),
                    }
                    : undefined;
                return createIssue({
                    code: issue.type ?? 'validation_error',
                    message: issue.message ?? 'Validation failed.',
                    ...(path ? { path } : {}),
                    ...(metadata ? { metadata } : {}),
                });
            }));
        },
    };
}
export function createValidationPlugin(options) {
    return definePlugin({
        name: options.name ?? `validation:${options.adapter.name}`,
        hooks: {
            onModelRegister(context) {
                context.setMetadata(VALIDATION_METADATA_KEY, {
                    adapter: options.adapter,
                    schemas: {
                        ...options.schemas,
                    },
                });
            },
        },
    });
}
export function createValidationErrorMessage(options) {
    const modelLabel = options.modelName
        ? `model "${options.modelName}"`
        : options.tableName
            ? `table "${options.tableName}"`
            : 'query payload';
    return `Validation failed for ${modelLabel} during "${options.operation}" using ${options.adapterName}.`;
}
export function createValidationError(options) {
    return new ObjxValidationError(createValidationErrorMessage(options), options);
}
export function defineValidationSchemas(schemas) {
    return Object.freeze({
        ...schemas,
    });
}
export function normalizeValidationIssues(issues) {
    return issues.map((issue) => Object.freeze(createIssue({
        code: issue.code,
        message: issue.message,
        ...(issue.path ? { path: issue.path } : {}),
        ...(issue.metadata
            ? { metadata: toReadonlyRecord(issue.metadata) }
            : {}),
    })));
}

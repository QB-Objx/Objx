function hasOwnKey(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
}
function coerceBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (value === 1) {
            return true;
        }
        if (value === 0) {
            return false;
        }
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === 't' || normalized === '1') {
            return true;
        }
        if (normalized === 'false' || normalized === 'f' || normalized === '0') {
            return false;
        }
    }
    return value;
}
function coerceNumber(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
}
function coerceTimestamp(value) {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed;
    }
    return value;
}
function coerceJson(value) {
    if (typeof value !== 'string') {
        return value;
    }
    const normalized = value.trim();
    if (normalized === '') {
        return value;
    }
    try {
        return JSON.parse(normalized);
    }
    catch {
        return value;
    }
}
export function hydrateColumnValue(definition, value) {
    if (value === null || value === undefined) {
        return value;
    }
    const customHydrator = definition.config.hydrate;
    if (typeof customHydrator === 'function') {
        return customHydrator(value, definition);
    }
    switch (definition.kind) {
        case 'int':
            return coerceNumber(value);
        case 'boolean':
            return coerceBoolean(value);
        case 'json':
            return coerceJson(value);
        case 'timestamp':
            return coerceTimestamp(value);
        default:
            return value;
    }
}
export function hydrateModelRow(model, row, options = {}) {
    const preserveUnknownKeys = options.preserveUnknownKeys ?? true;
    const hydrated = preserveUnknownKeys ? { ...row } : {};
    for (const [columnName, definition] of Object.entries(model.columnDefinitions)) {
        if (!hasOwnKey(row, columnName)) {
            continue;
        }
        hydrated[columnName] = hydrateColumnValue(definition, row[columnName]);
    }
    return hydrated;
}
export function hydrateModelRows(model, rows, options) {
    return rows.map((row) => hydrateModelRow(model, row, options));
}

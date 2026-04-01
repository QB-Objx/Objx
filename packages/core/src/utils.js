let internalSequence = 0;
export function createInternalId(prefix) {
    internalSequence += 1;
    return `${prefix}_${internalSequence.toString(36)}`;
}
export function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
        return value;
    }
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
        const nested = value[key];
        if (typeof nested === 'object' && nested !== null) {
            deepFreeze(nested);
        }
    }
    return value;
}

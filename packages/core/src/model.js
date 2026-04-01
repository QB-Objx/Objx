import { resolveColumnInput, } from './columns.js';
import { createDeleteQueryBuilder, createInsertQueryBuilder, createSelectQueryBuilder, createUpdateQueryBuilder, } from './query.js';
import { createInternalId, deepFreeze } from './utils.js';
function createColumnReference(model, key, definition) {
    return Object.freeze({
        kind: 'objx:column-ref',
        model,
        key,
        table: model.table,
        definition,
        toString() {
            return `${model.table}.${key}`;
        },
    });
}
function createRelationDefinition(kind, target, options) {
    return Object.freeze({
        kind,
        target,
        from: options.from,
        to: options.to,
        through: 'through' in options ? options.through : undefined,
        metadata: deepFreeze({
            ...(options.metadata ?? {}),
        }),
    });
}
export function hasOne(target, options) {
    return createRelationDefinition('hasOne', target, options);
}
export function hasMany(target, options) {
    return createRelationDefinition('hasMany', target, options);
}
export function belongsToOne(target, options) {
    return createRelationDefinition('belongsToOne', target, options);
}
export function manyToMany(target, options) {
    return createRelationDefinition('manyToMany', target, options);
}
export function defineModel(config) {
    const resolvedColumns = Object.fromEntries(Object.entries(config.columns).map(([key, value]) => [key, resolveColumnInput(value)]));
    const modelShell = {
        kind: 'objx:model',
        id: createInternalId('model'),
        name: config.name ?? config.table,
        table: config.table,
        columnDefinitions: resolvedColumns,
        columns: {},
        relations: {},
        plugins: deepFreeze([...(config.plugins ?? [])]),
        metadata: deepFreeze({
            ...(config.metadata ?? {}),
        }),
        query() {
            return createSelectQueryBuilder(modelShell);
        },
        insert(values) {
            return createInsertQueryBuilder(modelShell, values);
        },
        insertMany(values) {
            return createInsertQueryBuilder(modelShell, values);
        },
        update(values) {
            return createUpdateQueryBuilder(modelShell, values);
        },
        delete() {
            return createDeleteQueryBuilder(modelShell);
        },
    };
    const columnReferences = Object.fromEntries(Object.entries(resolvedColumns).map(([key, definition]) => [
        key,
        createColumnReference(modelShell, key, definition),
    ]));
    modelShell.columns = Object.freeze(columnReferences);
    const relations = config.relations
        ? config.relations(modelShell)
        : {};
    modelShell.relations = Object.freeze(relations);
    return deepFreeze(modelShell);
}

import type { ObjxPlugin } from './plugin.js';
import type { DeleteQueryBuilder, InsertQueryBuilder, SelectQueryBuilder, UpdateQueryBuilder } from './query.js';
import { type AnyColumnDefinition, type ColumnDefinition, type ColumnInput, type InferColumnsShape, type ResolveColumns } from './columns.js';
export interface ModelColumnReference<TModel extends AnyModelDefinition = AnyModelDefinition, TKey extends string = string, TValue = unknown> {
    readonly kind: 'objx:column-ref';
    readonly model: TModel;
    readonly key: TKey;
    readonly table: string;
    readonly definition: ColumnDefinition<TValue>;
    toString(): string;
}
export type RelationKind = 'hasOne' | 'hasMany' | 'belongsToOne' | 'manyToMany';
export interface RelationThroughDefinition {
    readonly from: AnyModelColumnReference;
    readonly to: AnyModelColumnReference;
    readonly extras?: readonly string[];
}
export interface RelationDefinition<TTarget extends AnyModelDefinition = AnyModelDefinition> {
    readonly kind: RelationKind;
    readonly target: () => TTarget;
    readonly from: AnyModelColumnReference;
    readonly to: AnyModelColumnReference;
    readonly through?: RelationThroughDefinition;
    readonly metadata: Readonly<Record<string, unknown>>;
}
export type AnyRelationDefinition = RelationDefinition<any>;
export type AnyModelColumnReference = ModelColumnReference<any, any, any>;
export type ModelColumnsInput = Record<string, ColumnInput>;
export type ModelColumns = Record<string, AnyColumnDefinition>;
export type ModelRelations = Record<string, AnyRelationDefinition>;
type EmptyModelRelations = Record<string, never>;
export interface ModelDefinition<TColumns extends ModelColumns = ModelColumns, TRelations extends ModelRelations = ModelRelations> {
    readonly kind: 'objx:model';
    readonly id: string;
    readonly name: string;
    readonly table: string;
    readonly columnDefinitions: TColumns;
    readonly columns: ModelColumnReferenceMap<TColumns, ModelDefinition<TColumns, TRelations>>;
    readonly relations: TRelations;
    readonly plugins: readonly ObjxPlugin[];
    readonly metadata: Readonly<Record<string, unknown>>;
    query(): SelectQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
    insert(values: InferColumnsShape<TColumns> | InferInsertShape<ModelDefinition<TColumns, TRelations>> | readonly InferInsertShape<ModelDefinition<TColumns, TRelations>>[]): InsertQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
    insertMany(values: readonly InferInsertShape<ModelDefinition<TColumns, TRelations>>[]): InsertQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
    update(values: InferInsertShape<ModelDefinition<TColumns, TRelations>>): UpdateQueryBuilder<ModelDefinition<TColumns, TRelations>, number>;
    delete(): DeleteQueryBuilder<ModelDefinition<TColumns, TRelations>, number>;
}
export type AnyModelDefinition = ModelDefinition<any, any>;
export type ModelColumnReferenceMap<TColumns extends ModelColumns, TModel extends AnyModelDefinition> = {
    [TKey in keyof TColumns]: ModelColumnReference<TModel, Extract<TKey, string>, TColumns[TKey] extends ColumnDefinition<infer TValue, any> ? TValue : never>;
};
export type InferModelShape<TModel extends AnyModelDefinition> = TModel extends ModelDefinition<infer TColumns, any> ? InferColumnsShape<TColumns> : never;
export type InferInsertShape<TModel extends AnyModelDefinition> = Partial<InferModelShape<TModel>>;
export interface RelationOptions {
    readonly from: AnyModelColumnReference;
    readonly to: AnyModelColumnReference;
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface ManyToManyRelationOptions extends RelationOptions {
    readonly through: RelationThroughDefinition;
}
export interface ModelDefinitionConfig<TColumnsInput extends ModelColumnsInput, TRelations extends ModelRelations = EmptyModelRelations> {
    readonly name?: string;
    readonly table: string;
    readonly columns: TColumnsInput;
    readonly relations?: (model: ModelDefinition<ResolveColumns<TColumnsInput>, EmptyModelRelations>) => TRelations;
    readonly plugins?: readonly ObjxPlugin[];
    readonly metadata?: Readonly<Record<string, unknown>>;
}
export declare function hasOne<TTarget extends AnyModelDefinition>(target: () => TTarget, options: RelationOptions): RelationDefinition<TTarget>;
export declare function hasMany<TTarget extends AnyModelDefinition>(target: () => TTarget, options: RelationOptions): RelationDefinition<TTarget>;
export declare function belongsToOne<TTarget extends AnyModelDefinition>(target: () => TTarget, options: RelationOptions): RelationDefinition<TTarget>;
export declare function manyToMany<TTarget extends AnyModelDefinition>(target: () => TTarget, options: ManyToManyRelationOptions): RelationDefinition<TTarget>;
export declare function defineModel<TColumnsInput extends ModelColumnsInput, TRelations extends ModelRelations = EmptyModelRelations>(config: ModelDefinitionConfig<TColumnsInput, TRelations>): ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>;
export {};
//# sourceMappingURL=model.d.ts.map
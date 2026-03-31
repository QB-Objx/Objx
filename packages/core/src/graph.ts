import type { AnyModelDefinition, AnyRelationDefinition, InferInsertShape, InferModelShape } from './model.js';

type Simplify<TValue> = {
  [TKey in keyof TValue]: TValue[TKey];
} & {};

export type InferGraphRelationTarget<TRelation extends AnyRelationDefinition> =
  TRelation extends { target: () => infer TTarget }
    ? TTarget extends AnyModelDefinition
      ? TTarget
      : never
    : never;

export type GraphRelationInput<TRelation extends AnyRelationDefinition> =
  TRelation['kind'] extends 'hasMany' | 'manyToMany'
    ? readonly GraphInsertInput<InferGraphRelationTarget<TRelation>>[]
    : GraphInsertInput<InferGraphRelationTarget<TRelation>> | null;

export type GraphRelationResult<TRelation extends AnyRelationDefinition> =
  TRelation['kind'] extends 'hasMany' | 'manyToMany'
    ? readonly GraphInsertResult<InferGraphRelationTarget<TRelation>>[]
    : GraphInsertResult<InferGraphRelationTarget<TRelation>> | null;

export type GraphInsertInput<TModel extends AnyModelDefinition> = Simplify<
  InferInsertShape<TModel> & {
    [TRelationName in Extract<keyof TModel['relations'], string>]?: GraphRelationInput<
      TModel['relations'][TRelationName]
    >;
  }
>;

export type GraphInsertResult<TModel extends AnyModelDefinition> = Simplify<
  InferModelShape<TModel> &
    Partial<{
      [TRelationName in Extract<keyof TModel['relations'], string>]: GraphRelationResult<
        TModel['relations'][TRelationName]
      >;
    }> &
    Record<string, unknown>
>;

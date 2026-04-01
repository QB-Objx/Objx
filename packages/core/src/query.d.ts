import type { AnyModelColumnReference, AnyModelDefinition, AnyRelationDefinition, InferInsertShape, InferModelShape, ModelColumnReference } from './model.js';
export type QueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> = SelectQueryNode<TModel> | InsertQueryNode<TModel> | UpdateQueryNode<TModel> | DeleteQueryNode<TModel>;
export interface AstContainer<TAst extends QueryNode = QueryNode> {
    toAst(): TAst;
}
export interface ColumnExpressionNode<TColumn extends AnyModelColumnReference = AnyModelColumnReference> {
    readonly kind: 'column';
    readonly column: TColumn;
}
export interface ValueExpressionNode {
    readonly kind: 'value';
    readonly value: unknown;
}
export type ExpressionNode = ColumnExpressionNode | ValueExpressionNode;
export type PredicateOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'like' | 'ilike' | 'is null' | 'is not null';
export interface ComparisonPredicateNode {
    readonly kind: 'predicate';
    readonly operator: PredicateOperator;
    readonly left: ExpressionNode;
    readonly right?: ExpressionNode | readonly ExpressionNode[];
}
export type LogicalPredicateOperator = 'and' | 'or';
export interface LogicalPredicateNode {
    readonly kind: 'logical-predicate';
    readonly operator: LogicalPredicateOperator;
    readonly predicates: readonly PredicateNode[];
}
export type PredicateNode = ComparisonPredicateNode | LogicalPredicateNode;
export interface SelectionNode<TColumn extends AnyModelColumnReference = AnyModelColumnReference> {
    readonly kind: 'selection';
    readonly column: TColumn;
    readonly alias?: string;
}
export interface OrderByNode<TColumn extends AnyModelColumnReference = AnyModelColumnReference> {
    readonly kind: 'order-by';
    readonly column: TColumn;
    readonly direction: 'asc' | 'desc';
}
export type JoinType = 'inner' | 'left' | 'right' | 'full';
export interface JoinConditionNode {
    readonly kind: 'join-condition';
    readonly left: ColumnExpressionNode;
    readonly right: ColumnExpressionNode;
}
export interface JoinNode {
    readonly kind: 'join';
    readonly joinType: JoinType;
    readonly table: string;
    readonly conditions: readonly JoinConditionNode[];
    readonly relationName?: string;
}
export type SoftDeleteQueryMode = 'default' | 'include' | 'only';
export interface SelectQueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> {
    readonly kind: 'select';
    readonly model: TModel;
    readonly selections: readonly SelectionNode[];
    readonly joins: readonly JoinNode[];
    readonly eagerRelations: readonly string[];
    readonly softDeleteMode?: SoftDeleteQueryMode;
    readonly predicates: readonly PredicateNode[];
    readonly orderBy: readonly OrderByNode[];
    readonly limit?: number;
    readonly offset?: number;
}
export interface InsertQueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> {
    readonly kind: 'insert';
    readonly model: TModel;
    readonly rows: readonly Readonly<Record<string, unknown>>[];
    readonly returning: readonly SelectionNode[];
}
export interface UpdateQueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> {
    readonly kind: 'update';
    readonly model: TModel;
    readonly values: Readonly<Record<string, unknown>>;
    readonly softDeleteMode?: SoftDeleteQueryMode;
    readonly predicates: readonly PredicateNode[];
    readonly returning: readonly SelectionNode[];
}
export interface DeleteQueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> {
    readonly kind: 'delete';
    readonly model: TModel;
    readonly softDeleteMode?: SoftDeleteQueryMode;
    readonly hardDelete?: boolean;
    readonly predicates: readonly PredicateNode[];
    readonly returning: readonly SelectionNode[];
}
type Simplify<TValue> = {
    [TKey in keyof TValue]: TValue[TKey];
} & {};
export type InferColumnReferenceValue<TColumn extends AnyModelColumnReference> = TColumn extends ModelColumnReference<any, any, infer TValue> ? TValue : never;
export type InferSelectionShape<TSelection extends readonly AnyModelColumnReference[]> = Simplify<{
    [TRef in TSelection[number] as TRef['key']]: TRef extends ModelColumnReference<any, any, infer TValue> ? TValue : never;
}>;
export type InferRelationTarget<TValue extends AnyRelationDefinition> = TValue extends {
    target: () => infer TTarget;
} ? TTarget extends AnyModelDefinition ? TTarget : never : never;
export type InferRelationShape<TValue extends AnyRelationDefinition> = TValue['kind'] extends 'hasMany' | 'manyToMany' ? readonly InferModelShape<InferRelationTarget<TValue>>[] : InferModelShape<InferRelationTarget<TValue>> | null;
type MergeRelationResult<TResult, TRelationName extends string, TRelation extends AnyRelationDefinition> = Simplify<TResult & Record<TRelationName, InferRelationShape<TRelation>>>;
export type RelationExpression<TModel extends AnyModelDefinition = AnyModelDefinition> = Extract<keyof TModel['relations'], string> | readonly RelationExpression<TModel>[] | {
    readonly [TRelationName in Extract<keyof TModel['relations'], string>]?: true | RelationExpression<InferRelationTarget<TModel['relations'][TRelationName]>>;
};
export type JoinConditionInput = readonly [AnyModelColumnReference, AnyModelColumnReference] | readonly (readonly [AnyModelColumnReference, AnyModelColumnReference])[];
export declare function columnExpression<TColumn extends AnyModelColumnReference>(column: TColumn): ColumnExpressionNode<TColumn>;
export declare function valueExpression(value: unknown): ExpressionNode;
export interface FilterOperators {
    eq<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    ne<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    gt<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    gte<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    lt<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    lte<TColumn extends AnyModelColumnReference>(left: TColumn, right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference): PredicateNode;
    like<TColumn extends AnyModelColumnReference>(left: TColumn, right: string): PredicateNode;
    ilike<TColumn extends AnyModelColumnReference>(left: TColumn, right: string): PredicateNode;
    in<TColumn extends AnyModelColumnReference>(left: TColumn, right: readonly (InferColumnReferenceValue<TColumn> | AnyModelColumnReference)[]): PredicateNode;
    isNull<TColumn extends AnyModelColumnReference>(left: TColumn): PredicateNode;
    isNotNull<TColumn extends AnyModelColumnReference>(left: TColumn): PredicateNode;
    and(...predicates: readonly PredicateNode[]): PredicateNode;
    or(...predicates: readonly PredicateNode[]): PredicateNode;
}
export declare const op: FilterOperators;
export declare class SelectQueryBuilder<TModel extends AnyModelDefinition, TResult = InferModelShape<TModel>> {
    #private;
    constructor(model: TModel, node?: SelectQueryNode<TModel>);
    select<TSelection extends readonly AnyModelColumnReference[]>(selector: (columns: TModel['columns']) => TSelection): SelectQueryBuilder<TModel, InferSelectionShape<TSelection>>;
    selectAs<TColumn extends AnyModelColumnReference, TAlias extends string>(selector: (columns: TModel['columns']) => TColumn, alias: TAlias): SelectQueryBuilder<TModel, Simplify<Omit<TResult, TColumn['key']> & Record<TAlias, InferColumnReferenceValue<TColumn>>>>;
    join(model: AnyModelDefinition, conditions: JoinConditionInput): SelectQueryBuilder<TModel, TResult>;
    leftJoin(model: AnyModelDefinition, conditions: JoinConditionInput): SelectQueryBuilder<TModel, TResult>;
    joinRelated<K extends Extract<keyof TModel['relations'], string>>(relationName: K): SelectQueryBuilder<TModel, TResult>;
    leftJoinRelated<K extends Extract<keyof TModel['relations'], string>>(relationName: K): SelectQueryBuilder<TModel, TResult>;
    withRelated<K extends Extract<keyof TModel['relations'], string>>(relationName: K): SelectQueryBuilder<TModel, MergeRelationResult<TResult, K, TModel['relations'][K]>>;
    withRelated(relationExpression: string | RelationExpression<TModel>): SelectQueryBuilder<TModel, TResult>;
    withSoftDeleted(): SelectQueryBuilder<TModel, TResult>;
    onlySoftDeleted(): SelectQueryBuilder<TModel, TResult>;
    where(predicateOrFactory: PredicateNode | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode)): SelectQueryBuilder<TModel, TResult>;
    orderBy<TColumn extends AnyModelColumnReference>(selector: (columns: TModel['columns']) => TColumn, direction?: 'asc' | 'desc'): SelectQueryBuilder<TModel, TResult>;
    limit(limit: number): SelectQueryBuilder<TModel, TResult>;
    offset(offset: number): SelectQueryBuilder<TModel, TResult>;
    toAst(): SelectQueryNode<TModel>;
}
export declare class InsertQueryBuilder<TModel extends AnyModelDefinition, TResult = InferModelShape<TModel>> {
    #private;
    readonly __result?: TResult;
    constructor(model: TModel, node: InsertQueryNode<TModel>);
    returning<TSelection extends readonly AnyModelColumnReference[]>(selector: (columns: TModel['columns']) => TSelection): InsertQueryBuilder<TModel, InferSelectionShape<TSelection>>;
    toAst(): InsertQueryNode<TModel>;
}
export declare class UpdateQueryBuilder<TModel extends AnyModelDefinition, TResult = number> {
    #private;
    constructor(model: TModel, node: UpdateQueryNode<TModel>);
    where(predicateOrFactory: PredicateNode | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode)): UpdateQueryBuilder<TModel, TResult>;
    returning<TSelection extends readonly AnyModelColumnReference[]>(selector: (columns: TModel['columns']) => TSelection): UpdateQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]>;
    withSoftDeleted(): UpdateQueryBuilder<TModel, TResult>;
    onlySoftDeleted(): UpdateQueryBuilder<TModel, TResult>;
    toAst(): UpdateQueryNode<TModel>;
}
export declare class DeleteQueryBuilder<TModel extends AnyModelDefinition, TResult = number> {
    #private;
    constructor(model: TModel, node: DeleteQueryNode<TModel>);
    where(predicateOrFactory: PredicateNode | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode)): DeleteQueryBuilder<TModel, TResult>;
    returning<TSelection extends readonly AnyModelColumnReference[]>(selector: (columns: TModel['columns']) => TSelection): DeleteQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]>;
    withSoftDeleted(): DeleteQueryBuilder<TModel, TResult>;
    onlySoftDeleted(): DeleteQueryBuilder<TModel, TResult>;
    hardDelete(): DeleteQueryBuilder<TModel, TResult>;
    toAst(): DeleteQueryNode<TModel>;
}
export type AnyQueryBuilder = SelectQueryBuilder<AnyModelDefinition, any> | InsertQueryBuilder<AnyModelDefinition, any> | UpdateQueryBuilder<AnyModelDefinition, any> | DeleteQueryBuilder<AnyModelDefinition, any>;
export type QueryResult<TQuery> = TQuery extends SelectQueryBuilder<any, infer TResult> ? readonly TResult[] : TQuery extends InsertQueryBuilder<any, infer TResult> ? readonly TResult[] : TQuery extends UpdateQueryBuilder<any, infer TResult> ? TResult : TQuery extends DeleteQueryBuilder<any, infer TResult> ? TResult : unknown;
export declare function createSelectQueryBuilder<TModel extends AnyModelDefinition>(model: TModel): SelectQueryBuilder<TModel, InferModelShape<TModel>>;
export declare function createInsertQueryBuilder<TModel extends AnyModelDefinition>(model: TModel, rows: InferInsertShape<TModel> | readonly InferInsertShape<TModel>[]): InsertQueryBuilder<TModel, InferModelShape<TModel>>;
export declare function createUpdateQueryBuilder<TModel extends AnyModelDefinition>(model: TModel, values: InferInsertShape<TModel>): UpdateQueryBuilder<TModel, number>;
export declare function createDeleteQueryBuilder<TModel extends AnyModelDefinition>(model: TModel): DeleteQueryBuilder<TModel, number>;
export declare function query<TModel extends AnyModelDefinition>(model: TModel): SelectQueryBuilder<TModel, InferModelShape<TModel>>;
export {};
//# sourceMappingURL=query.d.ts.map
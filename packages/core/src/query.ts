import { deepFreeze } from './utils.js';
import type {
  AnyModelColumnReference,
  AnyModelDefinition,
  AnyRelationDefinition,
  InferInsertShape,
  InferModelShape,
  ModelColumnReference,
} from './model.js';

export type QueryNode<TModel extends AnyModelDefinition = AnyModelDefinition> =
  | SelectQueryNode<TModel>
  | InsertQueryNode<TModel>
  | UpdateQueryNode<TModel>
  | DeleteQueryNode<TModel>;

export interface AstContainer<TAst extends QueryNode = QueryNode> {
  toAst(): TAst;
}

export interface ColumnExpressionNode<
  TColumn extends AnyModelColumnReference = AnyModelColumnReference,
> {
  readonly kind: 'column';
  readonly column: TColumn;
}

export interface ValueExpressionNode {
  readonly kind: 'value';
  readonly value: unknown;
}

export type ExpressionNode = ColumnExpressionNode | ValueExpressionNode;

export type PredicateOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'like'
  | 'ilike'
  | 'is null'
  | 'is not null';

export interface PredicateNode {
  readonly kind: 'predicate';
  readonly operator: PredicateOperator;
  readonly left: ExpressionNode;
  readonly right?: ExpressionNode | readonly ExpressionNode[];
}

export interface SelectionNode<
  TColumn extends AnyModelColumnReference = AnyModelColumnReference,
> {
  readonly kind: 'selection';
  readonly column: TColumn;
  readonly alias?: string;
}

export interface OrderByNode<
  TColumn extends AnyModelColumnReference = AnyModelColumnReference,
> {
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

export type InferColumnReferenceValue<TColumn extends AnyModelColumnReference> =
  TColumn extends ModelColumnReference<any, any, infer TValue> ? TValue : never;

export type InferSelectionShape<TSelection extends readonly AnyModelColumnReference[]> = Simplify<{
  [TRef in TSelection[number] as TRef['key']]: TRef extends ModelColumnReference<any, any, infer TValue>
    ? TValue
    : never;
}>;

export type InferRelationTarget<TValue extends AnyRelationDefinition> =
  TValue extends { target: () => infer TTarget }
    ? TTarget extends AnyModelDefinition
      ? TTarget
      : never
    : never;

export type InferRelationShape<TValue extends AnyRelationDefinition> =
  TValue['kind'] extends 'hasMany' | 'manyToMany'
    ? readonly InferModelShape<InferRelationTarget<TValue>>[]
    : InferModelShape<InferRelationTarget<TValue>> | null;

type MergeRelationResult<
  TResult,
  TRelationName extends string,
  TRelation extends AnyRelationDefinition,
> = Simplify<TResult & Record<TRelationName, InferRelationShape<TRelation>>>;

export type JoinConditionInput =
  | readonly [AnyModelColumnReference, AnyModelColumnReference]
  | readonly (readonly [AnyModelColumnReference, AnyModelColumnReference])[];

function isColumnReference(value: unknown): value is AnyModelColumnReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { kind?: string }).kind === 'objx:column-ref'
  );
}

export function columnExpression<TColumn extends AnyModelColumnReference>(
  column: TColumn,
): ColumnExpressionNode<TColumn> {
  return {
    kind: 'column',
    column,
  };
}

export function valueExpression(value: unknown): ExpressionNode {
  if (isColumnReference(value)) {
    return columnExpression(value);
  }

  return {
    kind: 'value',
    value,
  };
}

function createPredicate(
  operator: PredicateOperator,
  left: AnyModelColumnReference,
  right?: unknown,
): PredicateNode {
  const predicate: {
    kind: 'predicate';
    operator: PredicateOperator;
    left: ExpressionNode;
    right?: ExpressionNode | readonly ExpressionNode[];
  } = {
    kind: 'predicate',
    operator,
    left: columnExpression(left),
  };

  if (Array.isArray(right)) {
    predicate.right = deepFreeze(right.map((item) => valueExpression(item)));
  } else if (right !== undefined) {
    predicate.right = valueExpression(right);
  }

  return deepFreeze(predicate) as PredicateNode;
}

export interface FilterOperators {
  eq<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  ne<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  gt<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  gte<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  lt<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  lte<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: InferColumnReferenceValue<TColumn> | AnyModelColumnReference,
  ): PredicateNode;
  like<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: string,
  ): PredicateNode;
  ilike<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: string,
  ): PredicateNode;
  in<TColumn extends AnyModelColumnReference>(
    left: TColumn,
    right: readonly (InferColumnReferenceValue<TColumn> | AnyModelColumnReference)[],
  ): PredicateNode;
  isNull<TColumn extends AnyModelColumnReference>(left: TColumn): PredicateNode;
  isNotNull<TColumn extends AnyModelColumnReference>(left: TColumn): PredicateNode;
}

export const op: FilterOperators = deepFreeze({
  eq(left, right) {
    return createPredicate('=', left, right);
  },
  ne(left, right) {
    return createPredicate('!=', left, right);
  },
  gt(left, right) {
    return createPredicate('>', left, right);
  },
  gte(left, right) {
    return createPredicate('>=', left, right);
  },
  lt(left, right) {
    return createPredicate('<', left, right);
  },
  lte(left, right) {
    return createPredicate('<=', left, right);
  },
  like(left, right) {
    return createPredicate('like', left, right);
  },
  ilike(left, right) {
    return createPredicate('ilike', left, right);
  },
  in(left, right) {
    return createPredicate('in', left, right);
  },
  isNull(left) {
    return createPredicate('is null', left);
  },
  isNotNull(left) {
    return createPredicate('is not null', left);
  },
}) as FilterOperators;

function createSelection(column: AnyModelColumnReference, alias?: string): SelectionNode {
  const selection: {
    kind: 'selection';
    column: AnyModelColumnReference;
    alias?: string;
  } = {
    kind: 'selection',
    column,
  };

  if (alias) {
    selection.alias = alias;
  }

  return deepFreeze(selection) as SelectionNode;
}

function createJoinCondition(
  left: AnyModelColumnReference,
  right: AnyModelColumnReference,
): JoinConditionNode {
  return deepFreeze({
    kind: 'join-condition',
    left: columnExpression(left),
    right: columnExpression(right),
  });
}

function normalizeJoinConditions(input: JoinConditionInput): readonly JoinConditionNode[] {
  if (input.length === 2 && isColumnReference(input[0]) && isColumnReference(input[1])) {
    return deepFreeze([createJoinCondition(input[0], input[1])]);
  }

  return deepFreeze(
    (input as readonly (readonly [AnyModelColumnReference, AnyModelColumnReference])[]).map(
      ([left, right]) => createJoinCondition(left, right),
    ),
  );
}

function createJoinNode(
  joinType: JoinType,
  table: string,
  conditions: readonly JoinConditionNode[],
  relationName?: string,
): JoinNode {
  const join: {
    kind: 'join';
    joinType: JoinType;
    table: string;
    conditions: readonly JoinConditionNode[];
    relationName?: string;
  } = {
    kind: 'join',
    joinType,
    table,
    conditions,
  };

  if (relationName) {
    join.relationName = relationName;
  }

  return deepFreeze(join) as JoinNode;
}

function resolveRelationJoins(
  relationName: string,
  relation: AnyRelationDefinition,
  joinType: JoinType,
): readonly JoinNode[] {
  const targetModel = relation.target();

  if (relation.kind === 'manyToMany') {
    if (!relation.through) {
      throw new Error(`Relation "${relationName}" is missing through configuration for manyToMany.`);
    }

    return deepFreeze([
      createJoinNode(
        joinType,
        relation.through.from.table,
        deepFreeze([createJoinCondition(relation.from, relation.through.from)]),
        relationName,
      ),
      createJoinNode(
        joinType,
        targetModel.table,
        deepFreeze([createJoinCondition(relation.through.to, relation.to)]),
        relationName,
      ),
    ]);
  }

  return deepFreeze([
    createJoinNode(
      joinType,
      targetModel.table,
      deepFreeze([createJoinCondition(relation.from, relation.to)]),
      relationName,
    ),
  ]);
}

function cloneSelectNode<TModel extends AnyModelDefinition>(
  model: TModel,
  current: SelectQueryNode<TModel>,
  next: Partial<Omit<SelectQueryNode<TModel>, 'kind' | 'model'>>,
): SelectQueryNode<TModel> {
  const node: {
    kind: 'select';
    model: TModel;
    selections: readonly SelectionNode[];
    joins: readonly JoinNode[];
    eagerRelations: readonly string[];
    softDeleteMode?: SoftDeleteQueryMode;
    predicates: readonly PredicateNode[];
    orderBy: readonly OrderByNode[];
    limit?: number;
    offset?: number;
  } = {
    kind: 'select',
    model,
    selections: next.selections ?? current.selections,
    joins: next.joins ?? current.joins,
    eagerRelations: next.eagerRelations ?? current.eagerRelations,
    predicates: next.predicates ?? current.predicates,
    orderBy: next.orderBy ?? current.orderBy,
  };

  const softDeleteMode = next.softDeleteMode ?? current.softDeleteMode;
  const limit = next.limit ?? current.limit;
  const offset = next.offset ?? current.offset;

  if (softDeleteMode !== undefined) {
    node.softDeleteMode = softDeleteMode;
  }

  if (limit !== undefined) {
    node.limit = limit;
  }

  if (offset !== undefined) {
    node.offset = offset;
  }

  return deepFreeze(node) as SelectQueryNode<TModel>;
}

function cloneInsertNode<TModel extends AnyModelDefinition>(
  model: TModel,
  current: InsertQueryNode<TModel>,
  next: Partial<Omit<InsertQueryNode<TModel>, 'kind' | 'model'>>,
): InsertQueryNode<TModel> {
  return deepFreeze({
    kind: 'insert',
    model,
    rows: next.rows ?? current.rows,
    returning: next.returning ?? current.returning,
  });
}

function cloneUpdateNode<TModel extends AnyModelDefinition>(
  model: TModel,
  current: UpdateQueryNode<TModel>,
  next: Partial<Omit<UpdateQueryNode<TModel>, 'kind' | 'model' | 'values'>>,
): UpdateQueryNode<TModel> {
  const node: {
    kind: 'update';
    model: TModel;
    values: Readonly<Record<string, unknown>>;
    softDeleteMode?: SoftDeleteQueryMode;
    predicates: readonly PredicateNode[];
    returning: readonly SelectionNode[];
  } = {
    kind: 'update',
    model,
    values: current.values,
    predicates: next.predicates ?? current.predicates,
    returning: next.returning ?? current.returning,
  };

  const softDeleteMode = next.softDeleteMode ?? current.softDeleteMode;

  if (softDeleteMode !== undefined) {
    node.softDeleteMode = softDeleteMode;
  }

  return deepFreeze(node) as UpdateQueryNode<TModel>;
}

function cloneDeleteNode<TModel extends AnyModelDefinition>(
  model: TModel,
  current: DeleteQueryNode<TModel>,
  next: Partial<Omit<DeleteQueryNode<TModel>, 'kind' | 'model'>>,
): DeleteQueryNode<TModel> {
  const node: {
    kind: 'delete';
    model: TModel;
    softDeleteMode?: SoftDeleteQueryMode;
    hardDelete?: boolean;
    predicates: readonly PredicateNode[];
    returning: readonly SelectionNode[];
  } = {
    kind: 'delete',
    model,
    predicates: next.predicates ?? current.predicates,
    returning: next.returning ?? current.returning,
  };

  const softDeleteMode = next.softDeleteMode ?? current.softDeleteMode;
  const hardDelete = next.hardDelete ?? current.hardDelete;

  if (softDeleteMode !== undefined) {
    node.softDeleteMode = softDeleteMode;
  }

  if (hardDelete !== undefined) {
    node.hardDelete = hardDelete;
  }

  return deepFreeze(node) as DeleteQueryNode<TModel>;
}

export class SelectQueryBuilder<
  TModel extends AnyModelDefinition,
  TResult = InferModelShape<TModel>,
> {
  readonly #model: TModel;
  readonly #node: SelectQueryNode<TModel>;

  constructor(model: TModel, node?: SelectQueryNode<TModel>) {
    this.#model = model;
    this.#node =
      node ??
      deepFreeze({
        kind: 'select',
        model,
        selections: [],
        joins: [],
        eagerRelations: [],
        softDeleteMode: 'default',
        predicates: [],
        orderBy: [],
      });
  }

  select<TSelection extends readonly AnyModelColumnReference[]>(
    selector: (columns: TModel['columns']) => TSelection,
  ): SelectQueryBuilder<TModel, InferSelectionShape<TSelection>> {
    const selections = selector(this.#model.columns).map((column) => createSelection(column));

    return new SelectQueryBuilder<TModel, InferSelectionShape<TSelection>>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        selections: deepFreeze(selections),
      }),
    );
  }

  selectAs<TColumn extends AnyModelColumnReference, TAlias extends string>(
    selector: (columns: TModel['columns']) => TColumn,
    alias: TAlias,
  ): SelectQueryBuilder<
    TModel,
    Simplify<Omit<TResult, TColumn['key']> & Record<TAlias, InferColumnReferenceValue<TColumn>>>
  > {
    const column = selector(this.#model.columns);
    const selections = [...this.#node.selections, createSelection(column, alias)];

    return new SelectQueryBuilder(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        selections: deepFreeze(selections),
      }),
    ) as SelectQueryBuilder<
      TModel,
      Simplify<Omit<TResult, TColumn['key']> & Record<TAlias, InferColumnReferenceValue<TColumn>>>
    >;
  }

  join(
    model: AnyModelDefinition,
    conditions: JoinConditionInput,
  ): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        joins: deepFreeze([
          ...this.#node.joins,
          createJoinNode('inner', model.table, normalizeJoinConditions(conditions)),
        ]),
      }),
    );
  }

  leftJoin(
    model: AnyModelDefinition,
    conditions: JoinConditionInput,
  ): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        joins: deepFreeze([
          ...this.#node.joins,
          createJoinNode('left', model.table, normalizeJoinConditions(conditions)),
        ]),
      }),
    );
  }

  joinRelated<K extends Extract<keyof TModel['relations'], string>>(
    relationName: K,
  ): SelectQueryBuilder<TModel, TResult> {
    const relation = this.#model.relations[relationName];

    if (!relation) {
      throw new Error(`Unknown relation "${relationName}" for model "${this.#model.name}".`);
    }

    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        joins: deepFreeze([...this.#node.joins, ...resolveRelationJoins(relationName, relation, 'inner')]),
      }),
    );
  }

  leftJoinRelated<K extends Extract<keyof TModel['relations'], string>>(
    relationName: K,
  ): SelectQueryBuilder<TModel, TResult> {
    const relation = this.#model.relations[relationName];

    if (!relation) {
      throw new Error(`Unknown relation "${relationName}" for model "${this.#model.name}".`);
    }

    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        joins: deepFreeze([...this.#node.joins, ...resolveRelationJoins(relationName, relation, 'left')]),
      }),
    );
  }

  withRelated<K extends Extract<keyof TModel['relations'], string>>(
    relationName: K,
  ): SelectQueryBuilder<TModel, MergeRelationResult<TResult, K, TModel['relations'][K]>> {
    const relation = this.#model.relations[relationName];

    if (!relation) {
      throw new Error(`Unknown relation "${relationName}" for model "${this.#model.name}".`);
    }

    const eagerRelations = this.#node.eagerRelations.includes(relationName)
      ? this.#node.eagerRelations
      : deepFreeze([...this.#node.eagerRelations, relationName]);

    return new SelectQueryBuilder(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        eagerRelations,
      }),
    ) as SelectQueryBuilder<TModel, MergeRelationResult<TResult, K, TModel['relations'][K]>>;
  }

  withSoftDeleted(): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        softDeleteMode: 'include',
      }),
    );
  }

  onlySoftDeleted(): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        softDeleteMode: 'only',
      }),
    );
  }

  where(
    predicateOrFactory:
      | PredicateNode
      | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode),
  ): SelectQueryBuilder<TModel, TResult> {
    const predicate =
      typeof predicateOrFactory === 'function'
        ? predicateOrFactory(this.#model.columns, op)
        : predicateOrFactory;

    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        predicates: deepFreeze([...this.#node.predicates, predicate]),
      }),
    );
  }

  orderBy<TColumn extends AnyModelColumnReference>(
    selector: (columns: TModel['columns']) => TColumn,
    direction: 'asc' | 'desc' = 'asc',
  ): SelectQueryBuilder<TModel, TResult> {
    const column = selector(this.#model.columns);
    const orderBy = deepFreeze([
      ...this.#node.orderBy,
      deepFreeze({
        kind: 'order-by',
        column,
        direction,
      }) as OrderByNode,
    ]);

    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        orderBy,
      }),
    );
  }

  limit(limit: number): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        limit,
      }),
    );
  }

  offset(offset: number): SelectQueryBuilder<TModel, TResult> {
    return new SelectQueryBuilder<TModel, TResult>(
      this.#model,
      cloneSelectNode(this.#model, this.#node, {
        offset,
      }),
    );
  }

  toAst(): SelectQueryNode<TModel> {
    return this.#node;
  }
}

export class InsertQueryBuilder<
  TModel extends AnyModelDefinition,
  TResult = InferModelShape<TModel>,
> {
  declare readonly __result?: TResult;
  readonly #model: TModel;
  readonly #node: InsertQueryNode<TModel>;

  constructor(model: TModel, node: InsertQueryNode<TModel>) {
    this.#model = model;
    this.#node = node;
  }

  returning<TSelection extends readonly AnyModelColumnReference[]>(
    selector: (columns: TModel['columns']) => TSelection,
  ): InsertQueryBuilder<TModel, InferSelectionShape<TSelection>> {
    const returning = selector(this.#model.columns).map((column) => createSelection(column));

    return new InsertQueryBuilder<TModel, InferSelectionShape<TSelection>>(
      this.#model,
      cloneInsertNode(this.#model, this.#node, {
        returning: deepFreeze(returning),
      }),
    );
  }

  toAst(): InsertQueryNode<TModel> {
    return this.#node;
  }
}

export class UpdateQueryBuilder<
  TModel extends AnyModelDefinition,
  TResult = number,
> {
  readonly #model: TModel;
  readonly #node: UpdateQueryNode<TModel>;

  constructor(model: TModel, node: UpdateQueryNode<TModel>) {
    this.#model = model;
    this.#node = node;
  }

  where(
    predicateOrFactory:
      | PredicateNode
      | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode),
  ): UpdateQueryBuilder<TModel, TResult> {
    const predicate =
      typeof predicateOrFactory === 'function'
        ? predicateOrFactory(this.#model.columns, op)
        : predicateOrFactory;

    return new UpdateQueryBuilder<TModel, TResult>(
      this.#model,
      cloneUpdateNode(this.#model, this.#node, {
        predicates: deepFreeze([...this.#node.predicates, predicate]),
      }),
    );
  }

  returning<TSelection extends readonly AnyModelColumnReference[]>(
    selector: (columns: TModel['columns']) => TSelection,
  ): UpdateQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]> {
    const returning = selector(this.#model.columns).map((column) => createSelection(column));

    return new UpdateQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]>(
      this.#model,
      cloneUpdateNode(this.#model, this.#node, {
        returning: deepFreeze(returning),
      }),
    );
  }

  withSoftDeleted(): UpdateQueryBuilder<TModel, TResult> {
    return new UpdateQueryBuilder<TModel, TResult>(
      this.#model,
      cloneUpdateNode(this.#model, this.#node, {
        softDeleteMode: 'include',
      }),
    );
  }

  onlySoftDeleted(): UpdateQueryBuilder<TModel, TResult> {
    return new UpdateQueryBuilder<TModel, TResult>(
      this.#model,
      cloneUpdateNode(this.#model, this.#node, {
        softDeleteMode: 'only',
      }),
    );
  }

  toAst(): UpdateQueryNode<TModel> {
    return this.#node;
  }
}

export class DeleteQueryBuilder<
  TModel extends AnyModelDefinition,
  TResult = number,
> {
  readonly #model: TModel;
  readonly #node: DeleteQueryNode<TModel>;

  constructor(model: TModel, node: DeleteQueryNode<TModel>) {
    this.#model = model;
    this.#node = node;
  }

  where(
    predicateOrFactory:
      | PredicateNode
      | ((columns: TModel['columns'], operators: FilterOperators) => PredicateNode),
  ): DeleteQueryBuilder<TModel, TResult> {
    const predicate =
      typeof predicateOrFactory === 'function'
        ? predicateOrFactory(this.#model.columns, op)
        : predicateOrFactory;

    return new DeleteQueryBuilder<TModel, TResult>(
      this.#model,
      cloneDeleteNode(this.#model, this.#node, {
        predicates: deepFreeze([...this.#node.predicates, predicate]),
      }),
    );
  }

  returning<TSelection extends readonly AnyModelColumnReference[]>(
    selector: (columns: TModel['columns']) => TSelection,
  ): DeleteQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]> {
    const returning = selector(this.#model.columns).map((column) => createSelection(column));

    return new DeleteQueryBuilder<TModel, readonly InferSelectionShape<TSelection>[]>(
      this.#model,
      cloneDeleteNode(this.#model, this.#node, {
        returning: deepFreeze(returning),
      }),
    );
  }

  withSoftDeleted(): DeleteQueryBuilder<TModel, TResult> {
    return new DeleteQueryBuilder<TModel, TResult>(
      this.#model,
      cloneDeleteNode(this.#model, this.#node, {
        softDeleteMode: 'include',
      }),
    );
  }

  onlySoftDeleted(): DeleteQueryBuilder<TModel, TResult> {
    return new DeleteQueryBuilder<TModel, TResult>(
      this.#model,
      cloneDeleteNode(this.#model, this.#node, {
        softDeleteMode: 'only',
      }),
    );
  }

  hardDelete(): DeleteQueryBuilder<TModel, TResult> {
    return new DeleteQueryBuilder<TModel, TResult>(
      this.#model,
      cloneDeleteNode(this.#model, this.#node, {
        hardDelete: true,
      }),
    );
  }

  toAst(): DeleteQueryNode<TModel> {
    return this.#node;
  }
}

export type AnyQueryBuilder =
  | SelectQueryBuilder<AnyModelDefinition, any>
  | InsertQueryBuilder<AnyModelDefinition, any>
  | UpdateQueryBuilder<AnyModelDefinition, any>
  | DeleteQueryBuilder<AnyModelDefinition, any>;

export type QueryResult<TQuery> = TQuery extends SelectQueryBuilder<any, infer TResult>
  ? readonly TResult[]
  : TQuery extends InsertQueryBuilder<any, infer TResult>
    ? readonly TResult[]
    : TQuery extends UpdateQueryBuilder<any, infer TResult>
      ? TResult
      : TQuery extends DeleteQueryBuilder<any, infer TResult>
        ? TResult
        : unknown;

export function createSelectQueryBuilder<TModel extends AnyModelDefinition>(
  model: TModel,
): SelectQueryBuilder<TModel, InferModelShape<TModel>> {
  return new SelectQueryBuilder(model);
}

export function createInsertQueryBuilder<TModel extends AnyModelDefinition>(
  model: TModel,
  rows: InferInsertShape<TModel> | readonly InferInsertShape<TModel>[],
): InsertQueryBuilder<TModel, InferModelShape<TModel>> {
  const normalizedRows = (Array.isArray(rows) ? rows : [rows]).map((row) =>
    deepFreeze({ ...row }),
  );

  return new InsertQueryBuilder(
    model,
    deepFreeze({
      kind: 'insert',
      model,
      rows: deepFreeze(normalizedRows),
      returning: [],
    }),
  );
}

export function createUpdateQueryBuilder<TModel extends AnyModelDefinition>(
  model: TModel,
  values: InferInsertShape<TModel>,
): UpdateQueryBuilder<TModel, number> {
  return new UpdateQueryBuilder(
    model,
    deepFreeze({
      kind: 'update',
      model,
      values: deepFreeze({ ...values }),
      softDeleteMode: 'default',
      predicates: [],
      returning: [],
    }),
  );
}

export function createDeleteQueryBuilder<TModel extends AnyModelDefinition>(
  model: TModel,
): DeleteQueryBuilder<TModel, number> {
  return new DeleteQueryBuilder(
    model,
    deepFreeze({
      kind: 'delete',
      model,
      softDeleteMode: 'default',
      predicates: [],
      returning: [],
    }),
  );
}

export function query<TModel extends AnyModelDefinition>(
  model: TModel,
): SelectQueryBuilder<TModel, InferModelShape<TModel>> {
  return createSelectQueryBuilder(model);
}

import { deepFreeze } from './utils.js';
function isColumnReference(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'kind' in value &&
        value.kind === 'objx:column-ref');
}
export function columnExpression(column) {
    return {
        kind: 'column',
        column,
    };
}
export function valueExpression(value) {
    if (isColumnReference(value)) {
        return columnExpression(value);
    }
    return {
        kind: 'value',
        value,
    };
}
function createPredicate(operator, left, right) {
    const predicate = {
        kind: 'predicate',
        operator,
        left: columnExpression(left),
    };
    if (Array.isArray(right)) {
        predicate.right = deepFreeze(right.map((item) => valueExpression(item)));
    }
    else if (right !== undefined) {
        predicate.right = valueExpression(right);
    }
    return deepFreeze(predicate);
}
function createLogicalPredicate(operator, predicates) {
    if (predicates.length === 0) {
        throw new Error(`Logical predicate "${operator}" requires at least one predicate.`);
    }
    return deepFreeze({
        kind: 'logical-predicate',
        operator,
        predicates: deepFreeze([...predicates]),
    });
}
export const op = deepFreeze({
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
    and(...predicates) {
        return createLogicalPredicate('and', predicates);
    },
    or(...predicates) {
        return createLogicalPredicate('or', predicates);
    },
});
function createSelection(column, alias) {
    const selection = {
        kind: 'selection',
        column,
    };
    if (alias) {
        selection.alias = alias;
    }
    return deepFreeze(selection);
}
function createJoinCondition(left, right) {
    return deepFreeze({
        kind: 'join-condition',
        left: columnExpression(left),
        right: columnExpression(right),
    });
}
function normalizeJoinConditions(input) {
    if (input.length === 2 && isColumnReference(input[0]) && isColumnReference(input[1])) {
        return deepFreeze([createJoinCondition(input[0], input[1])]);
    }
    return deepFreeze(input.map(([left, right]) => createJoinCondition(left, right)));
}
function createJoinNode(joinType, table, conditions, relationName) {
    const join = {
        kind: 'join',
        joinType,
        table,
        conditions,
    };
    if (relationName) {
        join.relationName = relationName;
    }
    return deepFreeze(join);
}
function resolveRelationJoins(relationName, relation, joinType) {
    const targetModel = relation.target();
    if (relation.kind === 'manyToMany') {
        if (!relation.through) {
            throw new Error(`Relation "${relationName}" is missing through configuration for manyToMany.`);
        }
        return deepFreeze([
            createJoinNode(joinType, relation.through.from.table, deepFreeze([createJoinCondition(relation.from, relation.through.from)]), relationName),
            createJoinNode(joinType, targetModel.table, deepFreeze([createJoinCondition(relation.through.to, relation.to)]), relationName),
        ]);
    }
    return deepFreeze([
        createJoinNode(joinType, targetModel.table, deepFreeze([createJoinCondition(relation.from, relation.to)]), relationName),
    ]);
}
function isRelationExpressionRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseRelationPathSegments(model, relationPath) {
    const normalizedRelationPath = relationPath.trim();
    if (normalizedRelationPath.length === 0) {
        throw new Error(`Cannot resolve an empty relation path for model "${model.name}".`);
    }
    const segments = normalizedRelationPath.split('.').map((segment) => segment.trim());
    if (segments.some((segment) => segment.length === 0)) {
        throw new Error(`Invalid relation path "${relationPath}" for model "${model.name}".`);
    }
    return segments;
}
function resolveRelationPath(model, relationPath) {
    const segments = parseRelationPathSegments(model, relationPath);
    let currentModel = model;
    for (const segment of segments) {
        const relation = currentModel.relations[segment];
        if (!relation) {
            throw new Error(`Unknown relation "${segment}" for model "${currentModel.name}".`);
        }
        currentModel = relation.target();
    }
    return segments.join('.');
}
function collectRelationExpressionPaths(model, expression, prefix = []) {
    if (typeof expression === 'string') {
        const segments = parseRelationPathSegments(model, expression);
        let currentModel = model;
        for (const segment of segments) {
            const relation = currentModel.relations[segment];
            if (!relation) {
                throw new Error(`Unknown relation "${segment}" for model "${currentModel.name}".`);
            }
            currentModel = relation.target();
        }
        return [deepFreeze([...prefix, ...segments]).join('.')];
    }
    if (Array.isArray(expression)) {
        if (expression.length === 0) {
            if (prefix.length === 0) {
                throw new Error(`Cannot resolve an empty relation expression for model "${model.name}".`);
            }
            return [prefix.join('.')];
        }
        return expression.flatMap((item) => {
            if (typeof item !== 'string' &&
                !Array.isArray(item) &&
                !isRelationExpressionRecord(item)) {
                throw new Error(`Invalid relation expression for model "${model.name}".`);
            }
            return collectRelationExpressionPaths(model, item, prefix);
        });
    }
    if (!isRelationExpressionRecord(expression)) {
        throw new Error(`Invalid relation expression for model "${model.name}".`);
    }
    const entries = Object.entries(expression);
    if (entries.length === 0) {
        if (prefix.length === 0) {
            throw new Error(`Cannot resolve an empty relation expression for model "${model.name}".`);
        }
        return [prefix.join('.')];
    }
    const paths = [];
    for (const [relationName, relationExpression] of entries) {
        const normalizedRelationName = relationName.trim();
        if (normalizedRelationName.length === 0) {
            throw new Error(`Invalid relation expression for model "${model.name}".`);
        }
        const relation = model.relations[normalizedRelationName];
        if (!relation) {
            throw new Error(`Unknown relation "${normalizedRelationName}" for model "${model.name}".`);
        }
        const nextPrefix = [...prefix, normalizedRelationName];
        if (relationExpression === true || relationExpression === undefined) {
            paths.push(nextPrefix.join('.'));
            continue;
        }
        if (typeof relationExpression !== 'string' &&
            !Array.isArray(relationExpression) &&
            !isRelationExpressionRecord(relationExpression)) {
            throw new Error(`Invalid expression for relation "${normalizedRelationName}" on model "${model.name}".`);
        }
        paths.push(...collectRelationExpressionPaths(relation.target(), relationExpression, nextPrefix));
    }
    return paths;
}
function resolveRelationExpressionPaths(model, expression) {
    const paths = typeof expression === 'string'
        ? [resolveRelationPath(model, expression)]
        : collectRelationExpressionPaths(model, expression);
    return deepFreeze([...new Set(paths)]);
}
function buildRelationPathTree(relationPaths) {
    const tree = new Map();
    for (const relationPath of relationPaths) {
        const segments = relationPath.split('.');
        let current = tree;
        for (const segment of segments) {
            const next = current.get(segment);
            if (next) {
                current = next;
                continue;
            }
            const child = new Map();
            current.set(segment, child);
            current = child;
        }
    }
    return tree;
}
function appendRelationJoinsFromTree(model, relationTree, joinType, joins) {
    for (const [relationName, childTree] of relationTree) {
        const relation = model.relations[relationName];
        if (!relation) {
            continue;
        }
        joins.push(...resolveRelationJoins(relationName, relation, joinType));
        if (childTree.size > 0) {
            appendRelationJoinsFromTree(relation.target(), childTree, joinType, joins);
        }
    }
}
function resolveRelationExpressionJoins(model, expression, joinType) {
    const relationTree = buildRelationPathTree(resolveRelationExpressionPaths(model, expression));
    const joins = [];
    appendRelationJoinsFromTree(model, relationTree, joinType, joins);
    return deepFreeze(joins);
}
function cloneSelectNode(model, current, next) {
    const node = {
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
    return deepFreeze(node);
}
function cloneInsertNode(model, current, next) {
    return deepFreeze({
        kind: 'insert',
        model,
        rows: next.rows ?? current.rows,
        returning: next.returning ?? current.returning,
    });
}
function cloneUpdateNode(model, current, next) {
    const node = {
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
    return deepFreeze(node);
}
function cloneDeleteNode(model, current, next) {
    const node = {
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
    return deepFreeze(node);
}
export class SelectQueryBuilder {
    #model;
    #node;
    constructor(model, node) {
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
    select(selector) {
        const selections = selector(this.#model.columns).map((column) => createSelection(column));
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            selections: deepFreeze(selections),
        }));
    }
    selectAs(selector, alias) {
        const column = selector(this.#model.columns);
        const selections = [...this.#node.selections, createSelection(column, alias)];
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            selections: deepFreeze(selections),
        }));
    }
    join(model, conditions) {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            joins: deepFreeze([
                ...this.#node.joins,
                createJoinNode('inner', model.table, normalizeJoinConditions(conditions)),
            ]),
        }));
    }
    leftJoin(model, conditions) {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            joins: deepFreeze([
                ...this.#node.joins,
                createJoinNode('left', model.table, normalizeJoinConditions(conditions)),
            ]),
        }));
    }
    joinRelated(relationExpression) {
        const joins = resolveRelationExpressionJoins(this.#model, relationExpression, 'inner');
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            joins: deepFreeze([...this.#node.joins, ...joins]),
        }));
    }
    leftJoinRelated(relationExpression) {
        const joins = resolveRelationExpressionJoins(this.#model, relationExpression, 'left');
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            joins: deepFreeze([...this.#node.joins, ...joins]),
        }));
    }
    withRelated(relationExpression) {
        const eagerRelations = new Set(this.#node.eagerRelations);
        for (const relationPath of resolveRelationExpressionPaths(this.#model, relationExpression)) {
            eagerRelations.add(relationPath);
        }
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            eagerRelations: deepFreeze([...eagerRelations]),
        }));
    }
    withSoftDeleted() {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            softDeleteMode: 'include',
        }));
    }
    onlySoftDeleted() {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            softDeleteMode: 'only',
        }));
    }
    where(predicateOrFactory) {
        const predicate = typeof predicateOrFactory === 'function'
            ? predicateOrFactory(this.#model.columns, op)
            : predicateOrFactory;
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            predicates: deepFreeze([...this.#node.predicates, predicate]),
        }));
    }
    orderBy(selector, direction = 'asc') {
        const column = selector(this.#model.columns);
        const orderBy = deepFreeze([
            ...this.#node.orderBy,
            deepFreeze({
                kind: 'order-by',
                column,
                direction,
            }),
        ]);
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            orderBy,
        }));
    }
    limit(limit) {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            limit,
        }));
    }
    offset(offset) {
        return new SelectQueryBuilder(this.#model, cloneSelectNode(this.#model, this.#node, {
            offset,
        }));
    }
    toAst() {
        return this.#node;
    }
}
export class InsertQueryBuilder {
    #model;
    #node;
    constructor(model, node) {
        this.#model = model;
        this.#node = node;
    }
    returning(selector) {
        const returning = selector(this.#model.columns).map((column) => createSelection(column));
        return new InsertQueryBuilder(this.#model, cloneInsertNode(this.#model, this.#node, {
            returning: deepFreeze(returning),
        }));
    }
    toAst() {
        return this.#node;
    }
}
export class UpdateQueryBuilder {
    #model;
    #node;
    constructor(model, node) {
        this.#model = model;
        this.#node = node;
    }
    where(predicateOrFactory) {
        const predicate = typeof predicateOrFactory === 'function'
            ? predicateOrFactory(this.#model.columns, op)
            : predicateOrFactory;
        return new UpdateQueryBuilder(this.#model, cloneUpdateNode(this.#model, this.#node, {
            predicates: deepFreeze([...this.#node.predicates, predicate]),
        }));
    }
    returning(selector) {
        const returning = selector(this.#model.columns).map((column) => createSelection(column));
        return new UpdateQueryBuilder(this.#model, cloneUpdateNode(this.#model, this.#node, {
            returning: deepFreeze(returning),
        }));
    }
    withSoftDeleted() {
        return new UpdateQueryBuilder(this.#model, cloneUpdateNode(this.#model, this.#node, {
            softDeleteMode: 'include',
        }));
    }
    onlySoftDeleted() {
        return new UpdateQueryBuilder(this.#model, cloneUpdateNode(this.#model, this.#node, {
            softDeleteMode: 'only',
        }));
    }
    toAst() {
        return this.#node;
    }
}
export class DeleteQueryBuilder {
    #model;
    #node;
    constructor(model, node) {
        this.#model = model;
        this.#node = node;
    }
    where(predicateOrFactory) {
        const predicate = typeof predicateOrFactory === 'function'
            ? predicateOrFactory(this.#model.columns, op)
            : predicateOrFactory;
        return new DeleteQueryBuilder(this.#model, cloneDeleteNode(this.#model, this.#node, {
            predicates: deepFreeze([...this.#node.predicates, predicate]),
        }));
    }
    returning(selector) {
        const returning = selector(this.#model.columns).map((column) => createSelection(column));
        return new DeleteQueryBuilder(this.#model, cloneDeleteNode(this.#model, this.#node, {
            returning: deepFreeze(returning),
        }));
    }
    withSoftDeleted() {
        return new DeleteQueryBuilder(this.#model, cloneDeleteNode(this.#model, this.#node, {
            softDeleteMode: 'include',
        }));
    }
    onlySoftDeleted() {
        return new DeleteQueryBuilder(this.#model, cloneDeleteNode(this.#model, this.#node, {
            softDeleteMode: 'only',
        }));
    }
    hardDelete() {
        return new DeleteQueryBuilder(this.#model, cloneDeleteNode(this.#model, this.#node, {
            hardDelete: true,
        }));
    }
    toAst() {
        return this.#node;
    }
}
export function createSelectQueryBuilder(model) {
    return new SelectQueryBuilder(model);
}
export function createInsertQueryBuilder(model, rows) {
    const normalizedRows = (Array.isArray(rows) ? rows : [rows]).map((row) => deepFreeze({ ...row }));
    return new InsertQueryBuilder(model, deepFreeze({
        kind: 'insert',
        model,
        rows: deepFreeze(normalizedRows),
        returning: [],
    }));
}
export function createUpdateQueryBuilder(model, values) {
    return new UpdateQueryBuilder(model, deepFreeze({
        kind: 'update',
        model,
        values: deepFreeze({ ...values }),
        softDeleteMode: 'default',
        predicates: [],
        returning: [],
    }));
}
export function createDeleteQueryBuilder(model) {
    return new DeleteQueryBuilder(model, deepFreeze({
        kind: 'delete',
        model,
        softDeleteMode: 'default',
        predicates: [],
        returning: [],
    }));
}
export function query(model) {
    return createSelectQueryBuilder(model);
}

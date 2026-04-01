import type {
  AnyRelationDefinition,
  AnyQueryBuilder,
  AnyModelColumnReference,
  AnyModelDefinition,
  ColumnExpressionNode,
  DeleteQueryBuilder,
  DeleteQueryNode,
  ExecutionContextManager,
  ExecutionContext,
  GraphInsertInput,
  GraphInsertResult,
  HydrationOptions,
  InsertQueryBuilder,
  InsertQueryNode,
  JoinNode,
  PredicateNode,
  QueryNode,
  QueryResult,
  SelectQueryBuilder,
  SelectQueryNode,
  SelectionNode,
  SoftDeleteQueryMode,
  UpdateQueryBuilder,
  UpdateQueryNode,
  ValueExpressionNode,
  ModelPluginRegistration,
  ObjxPlugin,
  ObjxPluginRuntime,
} from '@qbobjx/core';
import {
  createPluginRuntime,
  createExecutionContextManager,
  createTransactionScope,
  hydrateModelRows,
  op,
} from '@qbobjx/core';
import {
  ObjxValidationError,
  VALIDATION_METADATA_KEY,
  type ValidationIssue,
  type ValidationOperation,
  type ValidationPluginMetadata,
} from '@qbobjx/validation';

export interface SqlParameter {
  readonly value: unknown;
  readonly typeHint?: string;
}

export interface CompiledQuery {
  readonly sql: string;
  readonly parameters: readonly SqlParameter[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SqlEngineAst {
  readonly kind: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface SqlCompiler<TAst = SqlEngineAst> {
  compile(ast: TAst): CompiledQuery;
}

export interface SqlExecutionAdapter<TResult = unknown> {
  execute(compiledQuery: CompiledQuery, executionContext?: ExecutionContext): Promise<TResult>;
}

export interface SqlExecutionRequest<TTransaction = unknown> {
  readonly executionContext?: ExecutionContext;
  readonly transaction?: TTransaction;
}

export interface SqlTransactionRequest {
  readonly executionContext?: ExecutionContext;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SqlResultSet<TRow extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly TRow[];
  readonly rowCount: number;
  readonly command?: string;
  readonly raw: unknown;
}

export interface SqlResultNormalizerContext {
  readonly compiledQuery: CompiledQuery;
  readonly executionContext: ExecutionContext | undefined;
}

export interface SqlResultNormalizer {
  normalize(
    result: unknown,
    context: SqlResultNormalizerContext,
  ): SqlResultSet;
}

export interface SqlDriver<TTransaction = unknown> {
  execute<TResult = unknown>(
    compiledQuery: CompiledQuery,
    request?: SqlExecutionRequest<TTransaction>,
  ): Promise<TResult>;
  transaction?<TResult>(
    callback: (transaction: TTransaction) => Promise<TResult>,
    request?: SqlTransactionRequest,
  ): Promise<TResult>;
}

export interface SqlEngine<TAst = SqlEngineAst> {
  compile(ast: TAst): CompiledQuery;
  execute<TResult>(
    ast: TAst,
    adapter: SqlExecutionAdapter<TResult>,
    executionContext?: ExecutionContext,
  ): Promise<TResult>;
}

export function createSqlEngine<TAst>(compiler: SqlCompiler<TAst>): SqlEngine<TAst> {
  return {
    compile(ast) {
      return compiler.compile(ast);
    },
    async execute<TResult>(
      ast: TAst,
      adapter: SqlExecutionAdapter<TResult>,
      executionContext?: ExecutionContext,
    ): Promise<TResult> {
      const compiledQuery = compiler.compile(ast);
      return adapter.execute(compiledQuery, executionContext);
    },
  };
}

export interface ObjxQueryTraceEvent {
  readonly compiledQuery: CompiledQuery;
  readonly executionContext: ExecutionContext | undefined;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly durationMs?: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

export interface ObjxTransactionTraceEvent {
  readonly executionContext: ExecutionContext | undefined;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly durationMs?: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

export interface ObjxSessionObserver {
  onQueryStart?(event: ObjxQueryTraceEvent): MaybePromise<void>;
  onQuerySuccess?(event: ObjxQueryTraceEvent): MaybePromise<void>;
  onQueryError?(event: ObjxQueryTraceEvent): MaybePromise<void>;
  onTransactionStart?(event: ObjxTransactionTraceEvent): MaybePromise<void>;
  onTransactionSuccess?(event: ObjxTransactionTraceEvent): MaybePromise<void>;
  onTransactionError?(event: ObjxTransactionTraceEvent): MaybePromise<void>;
}

export interface ObjxQueryMaterializationOptions {
  readonly hydrate?: boolean | HydrationOptions;
}

export interface RawSqlIdentifier {
  readonly kind: 'raw-sql-identifier';
  readonly path: readonly string[];
}

export interface RawSqlReference {
  readonly kind: 'raw-sql-reference';
  readonly value: string;
}

export interface RawSqlFragment {
  readonly kind: 'raw-sql-fragment';
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

export interface RawSqlCompiler {
  compileRaw(fragment: RawSqlFragment): CompiledQuery;
}

export function identifier(...path: string[]): RawSqlIdentifier {
  return {
    kind: 'raw-sql-identifier',
    path,
  };
}

export function ref(value: string): RawSqlReference {
  return {
    kind: 'raw-sql-reference',
    value,
  };
}

export function sql(strings: TemplateStringsArray, ...values: readonly unknown[]): RawSqlFragment {
  return {
    kind: 'raw-sql-fragment',
    strings: Array.from(strings),
    values,
  };
}

export function joinSql(
  fragments: readonly (
    | RawSqlFragment
    | RawSqlIdentifier
    | RawSqlReference
    | AnyModelColumnReference
    | unknown
  )[],
  separator = ', ',
): RawSqlFragment {
  if (fragments.length === 0) {
    return {
      kind: 'raw-sql-fragment',
      strings: [''],
      values: [],
    };
  }

  const strings: string[] = [''];
  const values: unknown[] = [];

  fragments.forEach((fragment, index) => {
    values.push(fragment);
    strings.push(index === fragments.length - 1 ? '' : separator);
  });

  return {
    kind: 'raw-sql-fragment',
    strings,
    values,
  };
}

export class ObjxSqlEngineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ObjxSqlEngineError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRowArray(value: unknown): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function resolveNumericCount(result: Record<string, unknown>): number | undefined {
  const candidates = ['rowCount', 'affectedRows', 'count', 'changes'];

  for (const key of candidates) {
    const value = result[key];

    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

export class DefaultSqlResultNormalizer implements SqlResultNormalizer {
  normalize(
    result: unknown,
    context: SqlResultNormalizerContext,
  ): SqlResultSet {
    void context;

    if (isRowArray(result)) {
      return {
        rows: result,
        rowCount: result.length,
        raw: result,
      };
    }

    if (typeof result === 'number') {
      return {
        rows: [],
        rowCount: result,
        raw: result,
      };
    }

    if (isRecord(result)) {
      const rows = isRowArray(result.rows)
        ? result.rows
        : isRowArray(result.records)
          ? result.records
          : [];

      const rowCount = resolveNumericCount(result) ?? rows.length;
      const command = typeof result.command === 'string' ? result.command : undefined;

      const normalized: {
        rows: readonly Record<string, unknown>[];
        rowCount: number;
        raw: unknown;
        command?: string;
      } = {
        rows,
        rowCount,
        raw: result,
      };

      if (command) {
        normalized.command = command;
      }

      return normalized;
    }

    return {
      rows: [],
      rowCount: 0,
      raw: result,
    };
  }
}

export function createDefaultSqlResultNormalizer(): SqlResultNormalizer {
  return new DefaultSqlResultNormalizer();
}

function uniqueNonNullableValues(values: readonly unknown[]): readonly unknown[] {
  const unique = new Set<unknown>();

  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    unique.add(value);
  }

  return [...unique];
}

type EagerRelationTree = Map<string, EagerRelationTree>;

const SOFT_DELETE_METADATA_KEY = 'softDelete';
const TENANT_SCOPE_METADATA_KEY = 'tenantScope';

type ValidationModelConfig = ValidationPluginMetadata<unknown>;

interface SoftDeleteModelConfig {
  readonly column: string;
  readonly activeValue?: unknown;
  readonly deletedValue?: unknown;
  readonly deletedValueFactory?: () => unknown;
}

interface TenantScopeModelConfig {
  readonly column: string;
  readonly contextKey: string;
  readonly bypassKey: string;
  readonly required: boolean;
}

function resolveSoftDeleteDeletedValue(config: SoftDeleteModelConfig): unknown {
  if (config.deletedValueFactory) {
    return config.deletedValueFactory();
  }

  if ('deletedValue' in config) {
    return config.deletedValue;
  }

  return new Date();
}

export class TransactionNotSupportedError extends ObjxSqlEngineError {
  constructor() {
    super('The configured SQL driver does not support transactions.');
    this.name = 'TransactionNotSupportedError';
  }
}

export class SqlExecutionError extends ObjxSqlEngineError {
  readonly compiledQuery: CompiledQuery;
  readonly executionContext?: ExecutionContext;

  constructor(
    message: string,
    options: {
      compiledQuery: CompiledQuery;
      executionContext?: ExecutionContext;
      cause: unknown;
    },
  ) {
    super(message, {
      cause: options.cause instanceof Error ? options.cause : new Error(String(options.cause)),
    });
    this.name = 'SqlExecutionError';
    this.compiledQuery = options.compiledQuery;

    if (options.executionContext) {
      this.executionContext = options.executionContext;
    }
  }
}

export class SqlTransactionError extends ObjxSqlEngineError {
  readonly executionContext?: ExecutionContext;

  constructor(
    message: string,
    options: {
      executionContext?: ExecutionContext;
      cause: unknown;
    },
  ) {
    super(message, {
      cause: options.cause instanceof Error ? options.cause : new Error(String(options.cause)),
    });
    this.name = 'SqlTransactionError';

    if (options.executionContext) {
      this.executionContext = options.executionContext;
    }
  }
}

function isAstContainer(value: QueryNode | AnyQueryBuilder): value is AnyQueryBuilder {
  return typeof value === 'object' && value !== null && 'toAst' in value;
}

function resolveQueryNode(query: QueryNode | AnyQueryBuilder): QueryNode {
  return isAstContainer(query) ? query.toAst() : query;
}

function isRawSqlIdentifier(value: unknown): value is RawSqlIdentifier {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'raw-sql-identifier';
}

function isRawSqlReference(value: unknown): value is RawSqlReference {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'raw-sql-reference';
}

function isRawSqlFragment(value: unknown): value is RawSqlFragment {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'raw-sql-fragment';
}

function isCompiledQuery(value: unknown): value is CompiledQuery {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sql' in value &&
    typeof value.sql === 'string' &&
    'parameters' in value &&
    Array.isArray(value.parameters)
  );
}

function isColumnReference(value: unknown): value is AnyModelColumnReference {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'objx:column-ref';
}

export interface SqlDialect {
  readonly name: string;
  quoteIdentifier(identifier: string): string;
  placeholder(index: number): string;
  readonly supportsReturning: boolean;
}

export type BuiltinSqlDialectName =
  | 'ansi'
  | 'postgres'
  | 'cockroachdb'
  | 'redshift'
  | 'sqlite3'
  | 'mysql';

export type SqlDialectInput = SqlDialect | BuiltinSqlDialectName | string;

function quoteWith(identifier: string, open: string, close: string): string {
  return `${open}${identifier.replaceAll(close, `${close}${close}`)}${close}`;
}

function createBuiltinDialect(
  name: BuiltinSqlDialectName,
  quoteIdentifier: (identifier: string) => string,
  placeholder: (index: number) => string,
  supportsReturning: boolean,
): SqlDialect {
  return {
    name,
    quoteIdentifier,
    placeholder,
    supportsReturning,
  };
}

export const ansiDialect = createBuiltinDialect(
  'ansi',
  (identifier) => quoteWith(identifier, '"', '"'),
  () => '?',
  true,
);

export const postgresDialect = createBuiltinDialect(
  'postgres',
  (identifier) => quoteWith(identifier, '"', '"'),
  (index) => `$${index}`,
  true,
);

export const cockroachDialect = createBuiltinDialect(
  'cockroachdb',
  (identifier) => quoteWith(identifier, '"', '"'),
  (index) => `$${index}`,
  true,
);

export const redshiftDialect = createBuiltinDialect(
  'redshift',
  (identifier) => quoteWith(identifier, '"', '"'),
  (index) => `$${index}`,
  true,
);

export const sqliteDialect = createBuiltinDialect(
  'sqlite3',
  (identifier) => quoteWith(identifier, '"', '"'),
  () => '?',
  true,
);

export const mysqlDialect = createBuiltinDialect(
  'mysql',
  (identifier) => quoteWith(identifier, '`', '`'),
  () => '?',
  false,
);

const KNEX_DIALECT_ALIASES = Object.freeze({
  pg: 'postgres',
  postgresql: 'postgres',
  pgnative: 'postgres',
  sqlite: 'sqlite3',
  'better-sqlite3': 'sqlite3',
  mysql2: 'mysql',
} satisfies Record<string, BuiltinSqlDialectName>);

const BUILTIN_SQL_DIALECTS = Object.freeze({
  ansi: ansiDialect,
  postgres: postgresDialect,
  cockroachdb: cockroachDialect,
  redshift: redshiftDialect,
  sqlite3: sqliteDialect,
  mysql: mysqlDialect,
} satisfies Record<BuiltinSqlDialectName, SqlDialect>);

export function resolveSqlDialectName(name: string): BuiltinSqlDialectName {
  const normalized = name.trim().toLowerCase();
  const resolved =
    KNEX_DIALECT_ALIASES[normalized as keyof typeof KNEX_DIALECT_ALIASES] ?? normalized;

  if (resolved in BUILTIN_SQL_DIALECTS) {
    return resolved as BuiltinSqlDialectName;
  }

  throw new ObjxSqlEngineError(
    `Unsupported SQL dialect "${name}". Supported dialects: ${Object.keys(BUILTIN_SQL_DIALECTS).join(', ')}.`,
  );
}

export function resolveSqlDialect(dialect: SqlDialectInput = ansiDialect): SqlDialect {
  if (typeof dialect !== 'string') {
    return dialect;
  }

  return BUILTIN_SQL_DIALECTS[resolveSqlDialectName(dialect)];
}

export function listBuiltinSqlDialects(): readonly BuiltinSqlDialectName[] {
  return Object.keys(BUILTIN_SQL_DIALECTS) as BuiltinSqlDialectName[];
}

export interface ObjxSqlCompilerOptions {
  readonly dialect?: SqlDialectInput;
}

class CompilationContext {
  readonly #dialect: SqlDialect;
  readonly #parameters: SqlParameter[] = [];

  constructor(dialect: SqlDialect) {
    this.#dialect = dialect;
  }

  get dialect(): SqlDialect {
    return this.#dialect;
  }

  get parameters(): readonly SqlParameter[] {
    return this.#parameters;
  }

  pushParameter(value: unknown, typeHint?: string): string {
    this.#parameters.push(typeHint ? { value, typeHint } : { value });
    return this.#dialect.placeholder(this.#parameters.length);
  }
}

export class ObjxSqlCompiler implements SqlCompiler<QueryNode>, RawSqlCompiler {
  readonly #dialect: SqlDialect;

  constructor(options: ObjxSqlCompilerOptions = {}) {
    this.#dialect = resolveSqlDialect(options.dialect ?? ansiDialect);
  }

  compile(ast: QueryNode | AnyQueryBuilder): CompiledQuery {
    const queryNode = resolveQueryNode(ast);
    const context = new CompilationContext(this.#dialect);
    let sql: string;

    switch (queryNode.kind) {
      case 'select':
        sql = this.#compileSelect(queryNode, context);
        break;
      case 'insert':
        sql = this.#compileInsert(queryNode, context);
        break;
      case 'update':
        sql = this.#compileUpdate(queryNode, context);
        break;
      case 'delete':
        sql = this.#compileDelete(queryNode, context);
        break;
    }

    return {
      sql,
      parameters: context.parameters,
      metadata: {
        dialect: this.#dialect.name,
        queryKind: queryNode.kind,
        table: queryNode.model.table,
      },
    };
  }

  compileRaw(fragment: RawSqlFragment): CompiledQuery {
    const context = new CompilationContext(this.#dialect);
    const sql = this.#compileRawFragment(fragment, context);

    return {
      sql,
      parameters: context.parameters,
      metadata: {
        dialect: this.#dialect.name,
        queryKind: 'raw',
      },
    };
  }

  #compileSelect(ast: SelectQueryNode, context: CompilationContext): string {
    const selections =
      ast.selections.length > 0
        ? ast.selections.map((selection) => this.#compileSelection(selection, context)).join(', ')
        : Object.keys(ast.model.columnDefinitions)
            .map((columnName) =>
              `${this.#columnReference(ast.model.table, columnName, context)} as ${this.#quote(
                columnName,
                context,
              )}`,
            )
            .join(', ');

    let sql = `select ${selections} from ${this.#quote(ast.model.table, context)}`;

    if (ast.joins.length > 0) {
      sql += ` ${ast.joins.map((join) => this.#compileJoin(join, context)).join(' ')}`;
    }

    if (ast.predicates.length > 0) {
      sql += ` where ${ast.predicates
        .map((predicate) => this.#compilePredicate(predicate, context))
        .join(' and ')}`;
    }

    if (ast.orderBy.length > 0) {
      sql += ` order by ${ast.orderBy
        .map((entry) => `${this.#compileColumn(entry.column, context)} ${entry.direction}`)
        .join(', ')}`;
    }

    if (ast.limit !== undefined) {
      sql += ` limit ${context.pushParameter(ast.limit, 'limit')}`;
    }

    if (ast.offset !== undefined) {
      sql += ` offset ${context.pushParameter(ast.offset, 'offset')}`;
    }

    return sql;
  }

  #compileInsert(ast: InsertQueryNode, context: CompilationContext): string {
    const orderedColumns = Object.keys(ast.model.columnDefinitions).filter((columnName) =>
      ast.rows.some((row) => Object.prototype.hasOwnProperty.call(row, columnName)),
    );

    if (orderedColumns.length === 0) {
      return `insert into ${this.#quote(ast.model.table, context)} default values`;
    }

    const columnsSql = orderedColumns.map((columnName) => this.#quote(columnName, context)).join(', ');
    const rowsSql = ast.rows
      .map((row) => {
        const valuesSql = orderedColumns.map((columnName) => {
          if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
            return 'default';
          }

          return context.pushParameter(row[columnName], columnName);
        });

        return `(${valuesSql.join(', ')})`;
      })
      .join(', ');

    let sql = `insert into ${this.#quote(ast.model.table, context)} (${columnsSql}) values ${rowsSql}`;

    if (ast.returning.length > 0 && this.#dialect.supportsReturning) {
      sql += ` returning ${ast.returning
        .map((selection) => this.#compileSelection(selection, context))
        .join(', ')}`;
    }

    return sql;
  }

  #compileUpdate(ast: UpdateQueryNode, context: CompilationContext): string {
    const orderedColumns = Object.keys(ast.model.columnDefinitions).filter((columnName) =>
      Object.prototype.hasOwnProperty.call(ast.values, columnName),
    );

    if (orderedColumns.length === 0) {
      throw new ObjxSqlEngineError('Cannot compile update query without values.');
    }

    const assignmentsSql = orderedColumns
      .map((columnName) => {
        const value = ast.values[columnName];
        return `${this.#quote(columnName, context)} = ${context.pushParameter(value, columnName)}`;
      })
      .join(', ');

    let sql = `update ${this.#quote(ast.model.table, context)} set ${assignmentsSql}`;

    if (ast.predicates.length > 0) {
      sql += ` where ${ast.predicates
        .map((predicate) => this.#compilePredicate(predicate, context))
        .join(' and ')}`;
    }

    if (ast.returning.length > 0 && this.#dialect.supportsReturning) {
      sql += ` returning ${ast.returning
        .map((selection) => this.#compileSelection(selection, context))
        .join(', ')}`;
    }

    return sql;
  }

  #compileDelete(ast: DeleteQueryNode, context: CompilationContext): string {
    let sql = `delete from ${this.#quote(ast.model.table, context)}`;

    if (ast.predicates.length > 0) {
      sql += ` where ${ast.predicates
        .map((predicate) => this.#compilePredicate(predicate, context))
        .join(' and ')}`;
    }

    if (ast.returning.length > 0 && this.#dialect.supportsReturning) {
      sql += ` returning ${ast.returning
        .map((selection) => this.#compileSelection(selection, context))
        .join(', ')}`;
    }

    return sql;
  }

  #compileRawFragment(fragment: RawSqlFragment, context: CompilationContext): string {
    let sql = '';

    for (let index = 0; index < fragment.strings.length; index += 1) {
      sql += fragment.strings[index] ?? '';

      if (index < fragment.values.length) {
        sql += this.#compileRawValue(fragment.values[index], context);
      }
    }

    return sql;
  }

  #compileRawValue(value: unknown, context: CompilationContext): string {
    if (isRawSqlFragment(value)) {
      return this.#compileRawFragment(value, context);
    }

    if (isRawSqlIdentifier(value)) {
      return this.#compileIdentifierPath(value.path, context);
    }

    if (isRawSqlReference(value)) {
      return this.#compileReference(value.value, context);
    }

    if (isColumnReference(value)) {
      return this.#compileColumn(value, context);
    }

    return context.pushParameter(value);
  }

  #compileSelection(selection: SelectionNode, context: CompilationContext): string {
    const base = this.#compileColumn(selection.column, context);

    if (!selection.alias) {
      return base;
    }

    return `${base} as ${this.#quote(selection.alias, context)}`;
  }

  #compileJoin(join: JoinNode, context: CompilationContext): string {
    const conditionsSql = join.conditions
      .map((condition) => {
        const left = this.#compileExpression(condition.left, context);
        const right = this.#compileExpression(condition.right, context);
        return `${left} = ${right}`;
      })
      .join(' and ');

    return `${this.#joinKeyword(join.joinType)} ${this.#quote(join.table, context)} on ${conditionsSql}`;
  }

  #compilePredicate(predicate: PredicateNode, context: CompilationContext): string {
    if (predicate.kind === 'logical-predicate') {
      if (predicate.predicates.length === 0) {
        return predicate.operator === 'and' ? '1 = 1' : '1 = 0';
      }

      return `(${predicate.predicates
        .map((item) => this.#compilePredicate(item, context))
        .join(` ${predicate.operator} `)})`;
    }

    const left = this.#compileExpression(predicate.left, context);

    if (predicate.operator === 'is null' || predicate.operator === 'is not null') {
      return `${left} ${predicate.operator}`;
    }

    if (predicate.operator === 'in') {
      const values = Array.isArray(predicate.right) ? predicate.right : [];

      if (values.length === 0) {
        return '1 = 0';
      }

      return `${left} in (${values
        .map((value) => this.#compileExpression(value, context))
        .join(', ')})`;
    }

    if (!predicate.right || Array.isArray(predicate.right)) {
      throw new Error(`Predicate "${predicate.operator}" requires a single right-hand expression.`);
    }

    const right = predicate.right as ColumnExpressionNode | ValueExpressionNode;

    return `${left} ${predicate.operator} ${this.#compileExpression(right, context)}`;
  }

  #compileExpression(
    expression: ColumnExpressionNode | ValueExpressionNode,
    context: CompilationContext,
  ): string {
    if (expression.kind === 'column') {
      return this.#compileColumn(expression.column, context);
    }

    return context.pushParameter(expression.value);
  }

  #compileColumn(column: AnyModelColumnReference, context: CompilationContext): string {
    return this.#columnReference(column.table, column.key, context);
  }

  #compileIdentifierPath(path: readonly string[], context: CompilationContext): string {
    return path
      .map((segment) => {
        if (segment === '*') {
          return '*';
        }

        return this.#quote(segment, context);
      })
      .join('.');
  }

  #compileReference(reference: string, context: CompilationContext): string {
    const normalized = reference.trim();
    const lower = normalized.toLowerCase();
    const asIndex = lower.indexOf(' as ');

    if (asIndex === -1) {
      return this.#compileReferencePath(normalized, context);
    }

    const source = normalized.slice(0, asIndex).trim();
    const alias = normalized.slice(asIndex + 4).trim();

    return `${this.#compileReferencePath(source, context)} as ${this.#quote(alias, context)}`;
  }

  #compileReferencePath(reference: string, context: CompilationContext): string {
    const segments = reference
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      throw new ObjxSqlEngineError('Cannot compile an empty SQL reference.');
    }

    return this.#compileIdentifierPath(segments, context);
  }

  #columnReference(table: string, column: string, context: CompilationContext): string {
    return `${this.#quote(table, context)}.${this.#quote(column, context)}`;
  }

  #quote(identifier: string, context: CompilationContext): string {
    return context.dialect.quoteIdentifier(identifier);
  }

  #joinKeyword(joinType: JoinNode['joinType']): string {
    switch (joinType) {
      case 'inner':
        return 'join';
      case 'left':
        return 'left join';
      case 'right':
        return 'right join';
      case 'full':
        return 'full join';
    }
  }
}

export function createObjxSqlCompiler(options?: ObjxSqlCompilerOptions): ObjxSqlCompiler {
  return new ObjxSqlCompiler(options);
}

export interface ObjxSessionOptions<TTransaction = unknown> {
  readonly compiler?: SqlCompiler<QueryNode> & Partial<RawSqlCompiler>;
  readonly driver: SqlDriver<TTransaction>;
  readonly executionContextManager?: ExecutionContextManager;
  readonly observers?: readonly ObjxSessionObserver[];
  readonly plugins?: readonly ObjxPlugin[];
  readonly resultNormalizer?: SqlResultNormalizer;
  readonly hydrateByDefault?: boolean | HydrationOptions;
}

export interface ObjxExecuteOptions<TTransaction = unknown>
  extends SqlExecutionRequest<TTransaction>,
    ObjxQueryMaterializationOptions {
  readonly validationOperation?: ValidationOperation;
}

export interface ObjxTransactionOptions {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface ObjxInsertGraphOptions extends ObjxQueryMaterializationOptions {
  readonly transactional?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface ObjxUpsertGraphOptions extends ObjxInsertGraphOptions {
  readonly insertMissing?: boolean;
}

export type ObjxRelationOptions = ObjxInsertGraphOptions;

async function notifyObservers(
  observers: readonly ObjxSessionObserver[],
  selectHandler: (observer: ObjxSessionObserver) => ((event: any) => MaybePromise<void>) | undefined,
  event: unknown,
): Promise<void> {
  for (const observer of observers) {
    const handler = selectHandler(observer);

    if (!handler) {
      continue;
    }

    try {
      await handler(event);
    } catch {
      // Tracing must not interfere with query execution.
    }
  }
}

export class ObjxSession<TTransaction = unknown> {
  readonly #compiler: SqlCompiler<QueryNode> & Partial<RawSqlCompiler>;
  readonly #driver: SqlDriver<TTransaction>;
  readonly #executionContextManager: ExecutionContextManager;
  readonly #observers: readonly ObjxSessionObserver[];
  readonly #pluginRuntime: ObjxPluginRuntime;
  readonly #modelRegistrations = new Map<string, ModelPluginRegistration>();
  readonly #resultNormalizer: SqlResultNormalizer;
  readonly #hydrateByDefault: boolean | HydrationOptions;

  constructor(options: ObjxSessionOptions<TTransaction>) {
    this.#compiler = options.compiler ?? new ObjxSqlCompiler();
    this.#driver = options.driver;
    this.#executionContextManager =
      options.executionContextManager ?? createExecutionContextManager();
    this.#observers = options.observers ?? [];
    this.#pluginRuntime = createPluginRuntime(options.plugins);
    this.#resultNormalizer = options.resultNormalizer ?? createDefaultSqlResultNormalizer();
    this.#hydrateByDefault = options.hydrateByDefault ?? false;
  }

  get executionContextManager(): ExecutionContextManager {
    return this.#executionContextManager;
  }

  currentExecutionContext(): ExecutionContext | undefined {
    return this.#executionContextManager.current();
  }

  #getModelRegistration<TModel extends AnyModelDefinition>(
    model: TModel,
  ): ModelPluginRegistration<TModel> {
    const cached = this.#modelRegistrations.get(model.id);

    if (cached) {
      return cached as ModelPluginRegistration<TModel>;
    }

    const registration = this.#pluginRuntime.registerModel(model);
    this.#modelRegistrations.set(model.id, registration);
    return registration as ModelPluginRegistration<TModel>;
  }

  #getSoftDeleteConfig(
    registration: ModelPluginRegistration | undefined,
  ): SoftDeleteModelConfig | undefined {
    return registration?.metadata.get(SOFT_DELETE_METADATA_KEY) as
      | SoftDeleteModelConfig
      | undefined;
  }

  #getTenantScopeConfig(
    registration: ModelPluginRegistration | undefined,
  ): TenantScopeModelConfig | undefined {
    return registration?.metadata.get(TENANT_SCOPE_METADATA_KEY) as
      | TenantScopeModelConfig
      | undefined;
  }

  #getValidationConfig(
    registration: ModelPluginRegistration | undefined,
  ): ValidationModelConfig | undefined {
    return registration?.metadata.get(VALIDATION_METADATA_KEY) as
      | ValidationModelConfig
      | undefined;
  }

  #createPluginContext(
    registration: ModelPluginRegistration,
    executionContext?: ExecutionContext,
    query?: QueryNode,
  ) {
    const context: {
      model: AnyModelDefinition;
      executionContext: ExecutionContext | undefined;
      metadata: ReadonlyMap<string, unknown>;
      query?: QueryNode;
      queryKind?: QueryNode['kind'];
    } = {
      model: registration.model,
      executionContext,
      metadata: registration.metadata,
    };

    if (query) {
      context.query = query;
      context.queryKind = query.kind;
    }

    return context;
  }

  #prepareStructuredQuery(
    queryNode: QueryNode,
    registration: ModelPluginRegistration = this.#getModelRegistration(queryNode.model),
    executionContext?: ExecutionContext,
  ): QueryNode {
    let preparedQuery = queryNode;
    const softDelete = this.#getSoftDeleteConfig(registration);

    if (softDelete) {
      preparedQuery = this.#applySoftDeleteScope(preparedQuery, registration, softDelete);
    }

    const tenantScope = this.#getTenantScopeConfig(registration);

    if (tenantScope) {
      preparedQuery = this.#applyTenantScope(
        preparedQuery,
        registration,
        tenantScope,
        executionContext,
      );
    }

    return preparedQuery;
  }

  #resolveValidationSchema(
    validation: ValidationModelConfig,
    operation: ValidationOperation,
    queryKind: QueryNode['kind'],
  ): unknown {
    switch (operation) {
      case 'insert':
        return validation.schemas.insert ?? validation.schemas.default;
      case 'update':
        return validation.schemas.update ?? validation.schemas.default;
      case 'insertGraph':
        return (
          validation.schemas.insertGraph ??
          validation.schemas.insert ??
          validation.schemas.default
        );
      case 'upsertGraph':
        if (queryKind === 'insert') {
          return (
            validation.schemas.upsertGraph ??
            validation.schemas.insertGraph ??
            validation.schemas.insert ??
            validation.schemas.default
          );
        }

        return (
          validation.schemas.upsertGraph ??
          validation.schemas.update ??
          validation.schemas.default
        );
    }
  }

  async #validatePayload<TValue>(
    registration: ModelPluginRegistration,
    operation: ValidationOperation,
    queryKind: QueryNode['kind'],
    input: TValue,
  ): Promise<TValue> {
    const validation = this.#getValidationConfig(registration);

    if (!validation) {
      return input;
    }

    const schema = this.#resolveValidationSchema(validation, operation, queryKind);

    if (schema === undefined) {
      return input;
    }

    const result = await validation.adapter.validate<TValue>(schema, input, {
      operation,
      modelName: registration.model.name,
      tableName: registration.model.table,
    });

    if (result.success) {
      return result.value;
    }

    throw new ObjxValidationError(
      `Validation failed for model "${registration.model.name}" during "${operation}" using ${validation.adapter.name}.`,
      {
        modelName: registration.model.name,
        tableName: registration.model.table,
        operation,
        adapterName: validation.adapter.name,
        issues: result.issues as readonly ValidationIssue[],
      },
    );
  }

  async #applyValidationToStructuredQuery(
    queryNode: QueryNode,
    registration: ModelPluginRegistration,
    operation: ValidationOperation | undefined,
  ): Promise<QueryNode> {
    if (!operation) {
      return queryNode;
    }

    switch (queryNode.kind) {
      case 'select':
      case 'delete':
        return queryNode;
      case 'insert': {
        const validatedRows = await Promise.all(
          queryNode.rows.map((row) =>
            this.#validatePayload<Readonly<Record<string, unknown>>>(
              registration,
              operation,
              queryNode.kind,
              row,
            ),
          ),
        );

        return {
          ...queryNode,
          rows: validatedRows,
        };
      }
      case 'update': {
        const validatedValues = await this.#validatePayload<Readonly<Record<string, unknown>>>(
          registration,
          operation,
          queryNode.kind,
          queryNode.values,
        );

        return {
          ...queryNode,
          values: validatedValues,
        };
      }
    }
  }

  #applySoftDeleteScope(
    queryNode: QueryNode,
    registration: ModelPluginRegistration,
    softDelete: SoftDeleteModelConfig,
  ): QueryNode {
    const columns = registration.model.columns as Record<string, AnyModelColumnReference>;
    const column = columns[softDelete.column];

    if (!column) {
      throw new ObjxSqlEngineError(
        `Soft delete column "${softDelete.column}" was not found on model "${registration.model.name}".`,
      );
    }

    const mode = (() => {
      switch (queryNode.kind) {
        case 'select':
        case 'update':
        case 'delete':
          return queryNode.softDeleteMode ?? 'default';
        case 'insert':
          return 'include' as SoftDeleteQueryMode;
      }
    })();

    const predicates = [...('predicates' in queryNode ? queryNode.predicates : [])];

    if (mode === 'default') {
      if (softDelete.activeValue === null || softDelete.activeValue === undefined) {
        predicates.push(op.isNull(column as never));
      } else {
        predicates.push(op.eq(column as never, softDelete.activeValue as never));
      }
    } else if (mode === 'only') {
      if (softDelete.activeValue === null || softDelete.activeValue === undefined) {
        predicates.push(op.isNotNull(column as never));
      } else if ('deletedValue' in softDelete && softDelete.deletedValue !== undefined) {
        predicates.push(op.eq(column as never, softDelete.deletedValue as never));
      } else {
        predicates.push(op.ne(column as never, softDelete.activeValue as never));
      }
    }

    switch (queryNode.kind) {
      case 'select':
        return {
          ...queryNode,
          predicates,
        };
      case 'update':
        return {
          ...queryNode,
          predicates,
        };
      case 'delete':
        if (queryNode.hardDelete) {
          return {
            ...queryNode,
            predicates,
          };
        }

        return {
          kind: 'update',
          model: queryNode.model,
          values: {
            [softDelete.column]: resolveSoftDeleteDeletedValue(softDelete),
          },
          softDeleteMode: 'include',
          predicates,
          returning: queryNode.returning,
        } satisfies UpdateQueryNode;
      case 'insert':
        return queryNode;
    }
  }

  #applyTenantScope(
    queryNode: QueryNode,
    registration: ModelPluginRegistration,
    tenantScope: TenantScopeModelConfig,
    executionContext?: ExecutionContext,
  ): QueryNode {
    const columns = registration.model.columns as Record<string, AnyModelColumnReference>;
    const column = columns[tenantScope.column];

    if (!column) {
      throw new ObjxSqlEngineError(
        `Tenant scope column "${tenantScope.column}" was not found on model "${registration.model.name}".`,
      );
    }

    if (executionContext?.values.get(tenantScope.bypassKey) === true) {
      return queryNode;
    }

    const tenantValue = executionContext?.values.get(tenantScope.contextKey);

    if (tenantValue === undefined) {
      if (!tenantScope.required) {
        return queryNode;
      }

      throw new ObjxSqlEngineError(
        `Tenant scope for model "${registration.model.name}" requires execution context value "${tenantScope.contextKey}".`,
      );
    }

    switch (queryNode.kind) {
      case 'select':
        return {
          ...queryNode,
          predicates: [...queryNode.predicates, op.eq(column as never, tenantValue as never)],
        };
      case 'update':
        return {
          ...queryNode,
          predicates: [...queryNode.predicates, op.eq(column as never, tenantValue as never)],
        };
      case 'delete':
        return {
          ...queryNode,
          predicates: [...queryNode.predicates, op.eq(column as never, tenantValue as never)],
        };
      case 'insert':
        return {
          ...queryNode,
          rows: queryNode.rows.map((row) =>
            this.#scopeInsertRow(row, registration.model, tenantScope, tenantValue),
          ),
        };
    }
  }

  compile(query: QueryNode | AnyQueryBuilder | RawSqlFragment | CompiledQuery): CompiledQuery {
    if (isCompiledQuery(query)) {
      return query;
    }

    if (isRawSqlFragment(query)) {
      if (!this.#compiler.compileRaw) {
        throw new ObjxSqlEngineError(
          'The configured SQL compiler does not support raw SQL fragments.',
        );
      }

      return this.#compiler.compileRaw(query);
    }

    const queryNode = resolveQueryNode(query);
    const registration = this.#getModelRegistration(queryNode.model);
    return this.#compiler.compile(
      this.#prepareStructuredQuery(
        queryNode,
        registration,
        this.#executionContextManager.current(),
      ),
    );
  }

  execute<TResult>(
    query: SelectQueryBuilder<any, TResult>,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<readonly TResult[]>;
  execute<TResult>(
    query: InsertQueryBuilder<any, TResult>,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<readonly TResult[]>;
  execute<TResult>(
    query: UpdateQueryBuilder<any, TResult>,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<TResult>;
  execute<TResult>(
    query: DeleteQueryBuilder<any, TResult>,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<TResult>;
  execute(
    query: RawSqlFragment | CompiledQuery,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<SqlResultSet>;
  execute<TResult = unknown>(
    query: QueryNode,
    options?: ObjxExecuteOptions<TTransaction>,
  ): Promise<TResult>;
  async execute(
    query: QueryNode | AnyQueryBuilder | RawSqlFragment | CompiledQuery,
    options: ObjxExecuteOptions<TTransaction> = {},
  ): Promise<unknown> {
    const executionContext = options.executionContext ?? this.#executionContextManager.current();
    const originalQueryNode = this.#resolveStructuredQueryNode(query);
    const registration = originalQueryNode
      ? this.#getModelRegistration(originalQueryNode.model)
      : undefined;
    const pluginContext =
      registration && this.#createPluginContext(registration, executionContext, originalQueryNode);
    const preparedQueryNode =
      originalQueryNode && registration
        ? this.#prepareStructuredQuery(originalQueryNode, registration, executionContext)
        : originalQueryNode;
    const validationOperation =
      options.validationOperation ??
      (originalQueryNode?.kind === 'insert'
        ? 'insert'
        : originalQueryNode?.kind === 'update'
          ? 'update'
          : undefined);
    const queryNode =
      preparedQueryNode && registration
        ? await this.#applyValidationToStructuredQuery(
            preparedQueryNode,
            registration,
            validationOperation,
          )
        : preparedQueryNode;
    const compiledQuery = isCompiledQuery(query)
      ? query
      : isRawSqlFragment(query)
        ? this.compile(query)
        : queryNode
          ? this.#compiler.compile(queryNode)
          : this.compile(query);
    const startedAt = new Date();
    const transaction =
      options.transaction ??
      (executionContext?.transaction?.raw as TTransaction | undefined);

    const request: {
      executionContext?: ExecutionContext;
      transaction?: TTransaction;
    } = {};

    if (executionContext) {
      request.executionContext = executionContext;
    }

    if (transaction !== undefined) {
      request.transaction = transaction;
    }

    if (registration && pluginContext) {
      this.#pluginRuntime.emitQueryCreate(pluginContext, registration.plugins);
      this.#pluginRuntime.emitQueryBuild(pluginContext, registration.plugins);
      this.#pluginRuntime.emitQueryExecute(pluginContext, registration.plugins);
    }

    await notifyObservers(this.#observers, (observer) => observer.onQueryStart, {
      compiledQuery,
      executionContext,
      startedAt,
    } satisfies ObjxQueryTraceEvent);

    try {
      const rawResult = await this.#driver.execute(compiledQuery, request);
      const normalizedResult = this.#resultNormalizer.normalize(rawResult, {
        compiledQuery,
        executionContext,
      });
      const materializedResult = await this.#materializeResult(queryNode, normalizedResult, options);
      const result =
        registration && pluginContext
          ? this.#pluginRuntime.emitResult(pluginContext, materializedResult, registration.plugins)
          : materializedResult;
      const finishedAt = new Date();

      await notifyObservers(this.#observers, (observer) => observer.onQuerySuccess, {
        compiledQuery,
        executionContext,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        result,
      } satisfies ObjxQueryTraceEvent);

      return result;
    } catch (error) {
      const pluginError =
        registration && pluginContext
          ? this.#pluginRuntime.emitError(pluginContext, error, registration.plugins)
          : error;
      const finishedAt = new Date();

      await notifyObservers(this.#observers, (observer) => observer.onQueryError, {
        compiledQuery,
        executionContext,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error: pluginError,
      } satisfies ObjxQueryTraceEvent);

      const errorOptions: {
        compiledQuery: CompiledQuery;
        executionContext?: ExecutionContext;
        cause: unknown;
      } = {
        compiledQuery,
        cause: pluginError,
      };

      if (executionContext) {
        errorOptions.executionContext = executionContext;
      }

      throw new SqlExecutionError('Failed to execute SQL query.', errorOptions);
    }
  }

  async #runGraphMutation<TResult>(
    options: ObjxInsertGraphOptions,
    run: () => Promise<TResult>,
  ): Promise<TResult> {
    const shouldWrapInTransaction =
      (options.transactional ?? true) &&
      !this.#executionContextManager.current()?.transaction &&
      !!this.#driver.transaction;

    if (!shouldWrapInTransaction) {
      return run();
    }

    const transactionOptions: {
      metadata?: Readonly<Record<string, unknown>>;
      values?: Readonly<Record<string, unknown>>;
    } = {};

    if (options.metadata !== undefined) {
      transactionOptions.metadata = options.metadata;
    }

    if (options.values !== undefined) {
      transactionOptions.values = options.values;
    }

    return this.transaction(() => run(), transactionOptions);
  }

  insertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel>,
    options?: ObjxInsertGraphOptions,
  ): Promise<GraphInsertResult<TModel>>;
  insertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: readonly GraphInsertInput<TModel>[],
    options?: ObjxInsertGraphOptions,
  ): Promise<readonly GraphInsertResult<TModel>[]>;
  async insertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel> | readonly GraphInsertInput<TModel>[],
    options: ObjxInsertGraphOptions = {},
  ): Promise<GraphInsertResult<TModel> | readonly GraphInsertResult<TModel>[]> {
    const run = async () => {
      if (Array.isArray(graph)) {
        const inserted: GraphInsertResult<TModel>[] = [];

        for (const item of graph) {
          inserted.push(await this.#insertGraphNode(model, item, options, new WeakSet<object>()));
        }

        return inserted as readonly GraphInsertResult<TModel>[];
      }

      return this.#insertGraphNode(
        model,
        graph as GraphInsertInput<TModel>,
        options,
        new WeakSet<object>(),
      );
    };

    return this.#runGraphMutation(options, run);
  }

  async #insertGraphNode<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel>,
    options: ObjxInsertGraphOptions,
    activePath: WeakSet<object>,
  ): Promise<GraphInsertResult<TModel>> {
    const graphRecord = this.#assertGraphRecord(graph, model);

    if (activePath.has(graphRecord)) {
      throw new ObjxSqlEngineError(
        `Cyclic graph references are not supported for model "${model.name}".`,
      );
    }

    activePath.add(graphRecord);

    try {
      const insertValues = this.#pickModelValues(model, graphRecord);
      const relationResults: Record<string, unknown> = {};

      for (const [relationName, relation] of Object.entries(model.relations) as [
        string,
        AnyRelationDefinition,
      ][]) {
        if (relation.kind !== 'belongsToOne' || !(relationName in graphRecord)) {
          continue;
        }

        const relationValue = graphRecord[relationName];

        if (relationValue === null) {
          this.#assertColumnNullable(
            relation.from,
            `Cannot set relation "${relationName}" on model "${model.name}" to null because foreign key "${relation.from.table}.${relation.from.key}" is not nullable.`,
          );
          insertValues[relation.from.key] = null;
          relationResults[relationName] = null;
          continue;
        }

        const insertedRelated = await this.#insertGraphNode(
          relation.target(),
          this.#assertGraphRecord(relationValue, relation.target()),
          options,
          activePath,
        );

        insertValues[relation.from.key] = insertedRelated[relation.to.key];
        relationResults[relationName] = insertedRelated;
      }

      const insertedRow = await this.#insertModelRow(model, insertValues, options);

      for (const [relationName, relation] of Object.entries(model.relations) as [
        string,
        AnyRelationDefinition,
      ][]) {
        if (!(relationName in graphRecord) || relation.kind === 'belongsToOne') {
          continue;
        }

        const relationValue = graphRecord[relationName];

        switch (relation.kind) {
          case 'hasOne': {
            if (relationValue === null) {
              relationResults[relationName] = null;
              break;
            }

            const childInput = this.#mergeInjectedValue(
              this.#assertGraphRecord(relationValue, relation.target()),
              relation.to.key,
              insertedRow[relation.from.key],
            );

            relationResults[relationName] = await this.#insertGraphNode(
              relation.target(),
              childInput,
              options,
              activePath,
            );
            break;
          }
          case 'hasMany': {
            const relatedItems = this.#assertGraphArray(
              relationValue,
              relationName,
              relation.target(),
            );
            const insertedChildren: Record<string, unknown>[] = [];

            for (const item of relatedItems) {
              insertedChildren.push(
                await this.#insertGraphNode(
                  relation.target(),
                  this.#mergeInjectedValue(item, relation.to.key, insertedRow[relation.from.key]),
                  options,
                  activePath,
                ),
              );
            }

            relationResults[relationName] = insertedChildren;
            break;
          }
          case 'manyToMany': {
            const relatedItems = this.#assertGraphArray(
              relationValue,
              relationName,
              relation.target(),
            );
            const insertedChildren: Record<string, unknown>[] = [];

            if (!relation.through) {
              throw new ObjxSqlEngineError(
                `Relation "${relationName}" on model "${model.name}" is missing through configuration.`,
              );
            }

            for (const item of relatedItems) {
              const insertedChild = await this.#insertGraphNode(
                relation.target(),
                item,
                options,
                activePath,
              );

              await this.#insertJoinRow(
                relation.through.from.table,
                this.#createJoinRow(
                  relation,
                  insertedRow,
                  insertedChild,
                  item,
                ),
              );

              insertedChildren.push(insertedChild);
            }

            relationResults[relationName] = insertedChildren;
            break;
          }
        }
      }

      return {
        ...insertedRow,
        ...relationResults,
      } as GraphInsertResult<TModel>;
    } finally {
      activePath.delete(graphRecord);
    }
  }

  upsertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel>,
    options?: ObjxUpsertGraphOptions,
  ): Promise<GraphInsertResult<TModel>>;
  upsertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: readonly GraphInsertInput<TModel>[],
    options?: ObjxUpsertGraphOptions,
  ): Promise<readonly GraphInsertResult<TModel>[]>;
  async upsertGraph<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel> | readonly GraphInsertInput<TModel>[],
    options: ObjxUpsertGraphOptions = {},
  ): Promise<GraphInsertResult<TModel> | readonly GraphInsertResult<TModel>[]> {
    const run = async () => {
      if (Array.isArray(graph)) {
        const upserted: GraphInsertResult<TModel>[] = [];

        for (const item of graph) {
          upserted.push(await this.#upsertGraphNode(model, item, options, new WeakSet<object>()));
        }

        return upserted as readonly GraphInsertResult<TModel>[];
      }

      return this.#upsertGraphNode(
        model,
        graph as GraphInsertInput<TModel>,
        options,
        new WeakSet<object>(),
      );
    };

    return this.#runGraphMutation(options, run);
  }

  async relate<TModel extends AnyModelDefinition>(
    model: TModel,
    ownerId: unknown,
    relationName: Extract<keyof TModel['relations'], string>,
    relatedIds: unknown | readonly unknown[],
    options: ObjxRelationOptions = {},
  ): Promise<number> {
    const run = async () => {
      const relation = this.#getRelation(model, relationName);
      const ids = this.#normalizeRelatedIds(relatedIds);
      await this.#assertModelRowExists(model, ownerId, options, 'owner');

      switch (relation.kind) {
        case 'belongsToOne': {
          if (ids.length !== 1) {
            throw new ObjxSqlEngineError(
              `Relation "${relationName}" on model "${model.name}" expects a single related id.`,
            );
          }

          await this.#assertRelatedRowsExist(
            relation.target(),
            ids,
            options,
            `Cannot relate "${relationName}" on model "${model.name}" because the related row was not found.`,
          );

          return this.#executeRelationUpdate(
            model
              .update({
                [relation.from.key]: ids[0],
              })
              .withSoftDeleted()
              .where(op.eq(this.#getPrimaryColumn(model) as never, ownerId as never)),
            options,
          );
        }
        case 'hasOne':
        case 'hasMany': {
          if (ids.length === 0) {
            return 0;
          }

          const targetModel = relation.target();
          const targetPrimary = this.#getPrimaryColumn(targetModel);
          await this.#assertRelatedRowsExist(
            targetModel,
            ids,
            options,
            `Cannot relate "${relationName}" on model "${model.name}" because one or more related rows were not found.`,
          );

          return this.#executeRelationUpdate(
            targetModel
              .update({
                [relation.to.key]: ownerId,
              })
              .withSoftDeleted()
              .where(op.in(targetPrimary as never, ids as readonly never[])),
            options,
          );
        }
        case 'manyToMany': {
          if (!relation.through) {
            throw new ObjxSqlEngineError(
              `Relation "${relationName}" on model "${model.name}" is missing through configuration.`,
            );
          }

          await this.#assertRelatedRowsExist(
            relation.target(),
            ids,
            options,
            `Cannot relate "${relationName}" on model "${model.name}" because one or more related rows were not found.`,
          );

          let relatedCount = 0;

          for (const relatedId of ids) {
            const inserted = await this.#ensureJoinRow(relation.through.from.table, {
              [relation.through.from.key]: ownerId,
              [relation.through.to.key]: relatedId,
            });

            if (inserted) {
              relatedCount += 1;
            }
          }

          return relatedCount;
        }
      }
    };

    return this.#runGraphMutation(options, run);
  }

  async unrelate<TModel extends AnyModelDefinition>(
    model: TModel,
    ownerId: unknown,
    relationName: Extract<keyof TModel['relations'], string>,
    relatedIds?: unknown | readonly unknown[],
    options: ObjxRelationOptions = {},
  ): Promise<number> {
    const run = async () => {
      const relation = this.#getRelation(model, relationName);
      const ids = this.#normalizeRelatedIds(relatedIds);
      await this.#assertModelRowExists(model, ownerId, options, 'owner');

      switch (relation.kind) {
        case 'belongsToOne': {
          this.#assertColumnNullable(
            relation.from,
            `Cannot unrelate "${relationName}" on model "${model.name}" because foreign key "${relation.from.table}.${relation.from.key}" is not nullable.`,
          );
          let builder = model
            .update({
              [relation.from.key]: null,
            })
            .withSoftDeleted()
            .where(op.eq(this.#getPrimaryColumn(model) as never, ownerId as never));

          if (ids.length > 0) {
            builder = builder.where(op.in(relation.from as never, ids as readonly never[]));
          }

          return this.#executeRelationUpdate(builder, options);
        }
        case 'hasOne':
        case 'hasMany': {
          const targetModel = relation.target();
          const targetPrimary = this.#getPrimaryColumn(targetModel);
          this.#assertColumnNullable(
            relation.to,
            `Cannot unrelate "${relationName}" on model "${model.name}" because foreign key "${relation.to.table}.${relation.to.key}" is not nullable.`,
          );
          let builder = targetModel
            .update({
              [relation.to.key]: null,
            })
            .withSoftDeleted()
            .where(op.eq(relation.to as never, ownerId as never));

          if (ids.length > 0) {
            builder = builder.where(op.in(targetPrimary as never, ids as readonly never[]));
          }

          return this.#executeRelationUpdate(builder, options);
        }
        case 'manyToMany': {
          if (!relation.through) {
            throw new ObjxSqlEngineError(
              `Relation "${relationName}" on model "${model.name}" is missing through configuration.`,
            );
          }

          const relatedPredicate =
            ids.length > 0
              ? sql` and ${identifier(relation.through.from.table, relation.through.to.key)} in (${joinSql(ids)})`
              : sql``;
          const result = await this.execute(
            sql`delete from ${identifier(relation.through.from.table)}
                where ${identifier(relation.through.from.table, relation.through.from.key)} = ${ownerId}${relatedPredicate}`,
          );

          return result.rowCount;
        }
      }
    };

    return this.#runGraphMutation(options, run);
  }

  async #upsertGraphNode<TModel extends AnyModelDefinition>(
    model: TModel,
    graph: GraphInsertInput<TModel>,
    options: ObjxUpsertGraphOptions,
    activePath: WeakSet<object>,
  ): Promise<GraphInsertResult<TModel>> {
    const graphRecord = this.#assertGraphRecord(graph, model);

    if (activePath.has(graphRecord)) {
      throw new ObjxSqlEngineError(
        `Cyclic graph references are not supported for model "${model.name}".`,
      );
    }

    activePath.add(graphRecord);

    try {
      const values = this.#pickModelValues(model, graphRecord);
      const relationResults: Record<string, unknown> = {};

      for (const [relationName, relation] of Object.entries(model.relations) as [
        string,
        AnyRelationDefinition,
      ][]) {
        if (relation.kind !== 'belongsToOne' || !(relationName in graphRecord)) {
          continue;
        }

        const relationValue = graphRecord[relationName];

        if (relationValue === null) {
          this.#assertColumnNullable(
            relation.from,
            `Cannot set relation "${relationName}" on model "${model.name}" to null because foreign key "${relation.from.table}.${relation.from.key}" is not nullable.`,
          );
          values[relation.from.key] = null;
          relationResults[relationName] = null;
          continue;
        }

        const upsertedRelated = await this.#upsertGraphNode(
          relation.target(),
          this.#assertGraphRecord(relationValue, relation.target()),
          options,
          activePath,
        );

        values[relation.from.key] = upsertedRelated[relation.to.key];
        relationResults[relationName] = upsertedRelated;
      }

      const existingRow = await this.#findExistingModelRow(model, graphRecord, options);
      const ownerRow = existingRow
        ? await this.#updateModelRow(model, existingRow, values, options)
        : await this.#insertOrThrowMissing(model, values, options);

      for (const [relationName, relation] of Object.entries(model.relations) as [
        string,
        AnyRelationDefinition,
      ][]) {
        if (!(relationName in graphRecord) || relation.kind === 'belongsToOne') {
          continue;
        }

        const relationValue = graphRecord[relationName];

        switch (relation.kind) {
          case 'hasOne': {
            if (relationValue === null) {
              this.#assertColumnNullable(
                relation.to,
                `Cannot clear relation "${relationName}" on model "${model.name}" because foreign key "${relation.to.table}.${relation.to.key}" is not nullable.`,
              );
              await this.#executeRelationUpdate(
                relation
                  .target()
                  .update({
                    [relation.to.key]: null,
                  })
                  .withSoftDeleted()
                  .where(op.eq(relation.to as never, ownerRow[relation.from.key] as never)),
                options,
              );
              relationResults[relationName] = null;
              break;
            }

            relationResults[relationName] = await this.#upsertGraphNode(
              relation.target(),
              this.#mergeInjectedValue(
                this.#assertGraphRecord(relationValue, relation.target()),
                relation.to.key,
                ownerRow[relation.from.key],
              ),
              options,
              activePath,
            );
            break;
          }
          case 'hasMany': {
            const relatedItems = this.#assertGraphArray(
              relationValue,
              relationName,
              relation.target(),
            );
            const upsertedChildren: Record<string, unknown>[] = [];

            for (const item of relatedItems) {
              upsertedChildren.push(
                await this.#upsertGraphNode(
                  relation.target(),
                  this.#mergeInjectedValue(item, relation.to.key, ownerRow[relation.from.key]),
                  options,
                  activePath,
                ),
              );
            }

            relationResults[relationName] = upsertedChildren;
            break;
          }
          case 'manyToMany': {
            if (!relation.through) {
              throw new ObjxSqlEngineError(
                `Relation "${relationName}" on model "${model.name}" is missing through configuration.`,
              );
            }

            const relatedItems = this.#assertGraphArray(
              relationValue,
              relationName,
              relation.target(),
            );
            const upsertedChildren: Record<string, unknown>[] = [];

            for (const item of relatedItems) {
              const upsertedChild = await this.#upsertGraphNode(
                relation.target(),
                item,
                options,
                activePath,
              );

              await this.#ensureJoinRow(
                relation.through.from.table,
                this.#createJoinRow(relation, ownerRow, upsertedChild, item),
              );

              upsertedChildren.push(upsertedChild);
            }

            relationResults[relationName] = upsertedChildren;
            break;
          }
        }
      }

      return {
        ...ownerRow,
        ...relationResults,
      } as GraphInsertResult<TModel>;
    } finally {
      activePath.delete(graphRecord);
    }
  }

  async transaction<TResult>(
    callback: (session: ObjxSession<TTransaction>) => Promise<TResult>,
    options: ObjxTransactionOptions = {},
  ): Promise<TResult> {
    if (!this.#driver.transaction) {
      throw new TransactionNotSupportedError();
    }

    const parent = this.#executionContextManager.current();
    const startedAt = new Date();

    await notifyObservers(this.#observers, (observer) => observer.onTransactionStart, {
      executionContext: parent,
      metadata: options.metadata,
      startedAt,
    } satisfies ObjxTransactionTraceEvent);

    try {
      const result = await this.#driver.transaction(async (transaction) => {
        const transactionScope = createTransactionScope(transaction, options.metadata);
        const contextInit: {
          parent?: ExecutionContext;
          transaction: typeof transactionScope;
          values?: Readonly<Record<string, unknown>>;
        } = {
          transaction: transactionScope,
        };

        if (parent) {
          contextInit.parent = parent;
        }

        if (options.values) {
          contextInit.values = options.values;
        }

        return this.#executionContextManager.run(
          contextInit,
          () => callback(this),
        );
      }, (() => {
        const request: {
          executionContext?: ExecutionContext;
          metadata?: Readonly<Record<string, unknown>>;
        } = {};

        if (parent) {
          request.executionContext = parent;
        }

        if (options.metadata) {
          request.metadata = options.metadata;
        }

        return request;
      })());
      const finishedAt = new Date();

      await notifyObservers(this.#observers, (observer) => observer.onTransactionSuccess, {
        executionContext: parent,
        metadata: options.metadata,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        result,
      } satisfies ObjxTransactionTraceEvent);

      return result;
    } catch (error) {
      const finishedAt = new Date();

      await notifyObservers(this.#observers, (observer) => observer.onTransactionError, {
        executionContext: parent,
        metadata: options.metadata,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        error,
      } satisfies ObjxTransactionTraceEvent);

      if (error instanceof SqlTransactionError) {
        throw error;
      }

      if (error instanceof ObjxValidationError) {
        throw error;
      }

      if (error instanceof ObjxSqlEngineError) {
        throw error;
      }

      const errorOptions: {
        executionContext?: ExecutionContext;
        cause: unknown;
      } = {
        cause: error,
      };

      if (parent) {
        errorOptions.executionContext = parent;
      }

      throw new SqlTransactionError('Failed to execute SQL transaction.', errorOptions);
    }
  }

  #resolveStructuredQueryNode(
    query: QueryNode | AnyQueryBuilder | RawSqlFragment | CompiledQuery,
  ): QueryNode | undefined {
    if (isCompiledQuery(query) || isRawSqlFragment(query)) {
      return undefined;
    }

    return resolveQueryNode(query);
  }

  async #materializeResult(
    queryNode: QueryNode | undefined,
    normalizedResult: SqlResultSet,
    options: ObjxQueryMaterializationOptions,
  ): Promise<unknown> {
    if (!queryNode) {
      return normalizedResult;
    }

    switch (queryNode.kind) {
      case 'select': {
        const rows = this.#materializeRows(queryNode.model, normalizedResult.rows, options);
        return queryNode.eagerRelations.length > 0
          ? this.#eagerLoadRelations(queryNode, rows, options)
          : rows;
      }
      case 'insert':
        return queryNode.returning.length > 0
          ? this.#materializeRows(queryNode.model, normalizedResult.rows, options)
          : normalizedResult.rows;
      case 'update':
        return queryNode.returning.length > 0
          ? this.#materializeRows(queryNode.model, normalizedResult.rows, options)
          : normalizedResult.rowCount;
      case 'delete':
        return queryNode.returning.length > 0
          ? this.#materializeRows(queryNode.model, normalizedResult.rows, options)
          : normalizedResult.rowCount;
    }
  }

  #materializeRows(
    model: AnyModelDefinition,
    rows: readonly Record<string, unknown>[],
    options: ObjxQueryMaterializationOptions,
  ): readonly Record<string, unknown>[] {
    const hydration = options.hydrate ?? this.#hydrateByDefault;

    if (!hydration) {
      return rows;
    }

    return hydrateModelRows(
      model,
      rows,
      typeof hydration === 'object' ? hydration : undefined,
    );
  }

  #assertGraphRecord<TModel extends AnyModelDefinition>(
    value: unknown,
    model: TModel,
  ): GraphInsertInput<TModel> & Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ObjxSqlEngineError(
        `Expected graph node for model "${model.name}" to be an object.`,
      );
    }

    return value as GraphInsertInput<TModel> & Record<string, unknown>;
  }

  #assertGraphArray(
    value: unknown,
    relationName: string,
    targetModel: AnyModelDefinition,
  ): readonly (Record<string, unknown> & GraphInsertInput<AnyModelDefinition>)[] {
    if (!Array.isArray(value)) {
      throw new ObjxSqlEngineError(
        `Expected relation "${relationName}" targeting model "${targetModel.name}" to be an array.`,
      );
    }

    return value.map((item) => this.#assertGraphRecord(item, targetModel));
  }

  #getRelation(
    model: AnyModelDefinition,
    relationName: string,
  ): AnyRelationDefinition {
    const relation = model.relations[relationName];

    if (!relation) {
      throw new ObjxSqlEngineError(
        `Unknown relation "${relationName}" for model "${model.name}".`,
      );
    }

    return relation;
  }

  #normalizeRelatedIds(
    relatedIds: unknown | readonly unknown[] | undefined,
  ): readonly unknown[] {
    if (relatedIds === undefined) {
      return [];
    }

    return Array.isArray(relatedIds) ? relatedIds : [relatedIds];
  }

  #scopeInsertRow(
    row: Readonly<Record<string, unknown>>,
    model: AnyModelDefinition,
    tenantScope: TenantScopeModelConfig,
    tenantValue: unknown,
  ): Readonly<Record<string, unknown>> {
    const scopedRow = {
      ...row,
    };
    const existingValue = scopedRow[tenantScope.column];

    if (existingValue === undefined) {
      scopedRow[tenantScope.column] = tenantValue;
      return scopedRow;
    }

    if (String(existingValue) !== String(tenantValue)) {
      throw new ObjxSqlEngineError(
        `Insert for model "${model.name}" conflicts with tenant scope "${tenantScope.contextKey}".`,
      );
    }

    return scopedRow;
  }

  #assertColumnNullable(
    column: AnyModelColumnReference,
    message: string,
  ): void {
    if (!column.definition.nullable) {
      throw new ObjxSqlEngineError(message);
    }
  }

  #pickModelValues(
    model: AnyModelDefinition,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    for (const columnName of Object.keys(model.columnDefinitions)) {
      if (columnName in source) {
        values[columnName] = source[columnName];
      }
    }

    return values;
  }

  #getPrimaryColumn(model: AnyModelDefinition): AnyModelColumnReference {
    const primaryColumns = (Object.entries(model.columnDefinitions) as [
      string,
      { primary: boolean },
    ][])
      .filter(([, definition]) => definition.primary)
      .map(([columnName]) => (model.columns as Record<string, AnyModelColumnReference>)[columnName])
      .filter((column): column is AnyModelColumnReference => column !== undefined);

    if (primaryColumns.length !== 1) {
      throw new ObjxSqlEngineError(
        `Model "${model.name}" must have exactly one primary column for graph upserts.`,
      );
    }

    return primaryColumns[0] as AnyModelColumnReference;
  }

  async #findExistingModelRow<TModel extends AnyModelDefinition>(
    model: TModel,
    source: Record<string, unknown>,
    options: ObjxQueryMaterializationOptions,
  ): Promise<Record<string, unknown> | undefined> {
    const primaryColumn = this.#getPrimaryColumn(model);
    const primaryValue = source[primaryColumn.key];

    if (primaryValue === undefined || primaryValue === null) {
      return undefined;
    }

    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
      validationOperation?: ValidationOperation;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    const rows = await this.execute(
      model.query().withSoftDeleted().where(op.eq(primaryColumn as never, primaryValue as never)).limit(1),
      executeOptions,
    ) as readonly Record<string, unknown>[];

    return rows[0];
  }

  async #assertModelRowExists<TModel extends AnyModelDefinition>(
    model: TModel,
    id: unknown,
    options: ObjxQueryMaterializationOptions,
    role: string,
  ): Promise<Record<string, unknown>> {
    const primaryColumn = this.#getPrimaryColumn(model);
    const row = await this.#findExistingModelRow(
      model,
      {
        [primaryColumn.key]: id,
      },
      options,
    );

    if (!row) {
      throw new ObjxSqlEngineError(
        `Cannot mutate relation because ${role} model "${model.name}" with primary key "${String(id)}" was not found.`,
      );
    }

    return row;
  }

  async #assertRelatedRowsExist<TModel extends AnyModelDefinition>(
    model: TModel,
    ids: readonly unknown[],
    options: ObjxQueryMaterializationOptions,
    message: string,
  ): Promise<void> {
    const uniqueIds = uniqueNonNullableValues(ids);

    if (uniqueIds.length === 0) {
      return;
    }

    const primaryColumn = this.#getPrimaryColumn(model);
    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
      validationOperation?: ValidationOperation;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    const rows = await this.execute(
      model
        .query()
        .withSoftDeleted()
        .where(op.in(primaryColumn as never, uniqueIds as readonly never[])),
      executeOptions,
    ) as readonly Record<string, unknown>[];
    const foundIds = new Set(rows.map((row) => String(row[primaryColumn.key])));
    const missingIds = uniqueIds.filter((id) => !foundIds.has(String(id)));

    if (missingIds.length > 0) {
      throw new ObjxSqlEngineError(`${message} Missing ids: ${missingIds.map(String).join(', ')}.`);
    }
  }

  async #insertOrThrowMissing<TModel extends AnyModelDefinition>(
    model: TModel,
    values: Record<string, unknown>,
    options: ObjxUpsertGraphOptions,
  ): Promise<Record<string, unknown>> {
    const primaryColumn = this.#getPrimaryColumn(model);

    if (
      options.insertMissing === false &&
      values[primaryColumn.key] !== undefined &&
      values[primaryColumn.key] !== null
    ) {
      throw new ObjxSqlEngineError(
        `Model "${model.name}" with primary key "${String(values[primaryColumn.key])}" was not found for graph upsert.`,
      );
    }

    return this.#insertModelRow(model, values, options);
  }

  #mergeInjectedValue(
    source: Record<string, unknown>,
    key: string,
    value: unknown,
  ): Record<string, unknown> & GraphInsertInput<AnyModelDefinition> {
    return {
      ...source,
      [key]: value,
    } as Record<string, unknown> & GraphInsertInput<AnyModelDefinition>;
  }

  async #updateModelRow<TModel extends AnyModelDefinition>(
    model: TModel,
    existingRow: Record<string, unknown>,
    values: Record<string, unknown>,
    options: ObjxUpsertGraphOptions,
  ): Promise<Record<string, unknown>> {
    const primaryColumn = this.#getPrimaryColumn(model);
    const updateValues = { ...values };
    delete updateValues[primaryColumn.key];

    if (Object.keys(updateValues).length === 0) {
      return existingRow;
    }

    const returningColumns = Object.values(model.columns) as AnyModelColumnReference[];
    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
      validationOperation?: ValidationOperation;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    executeOptions.validationOperation = 'upsertGraph';

    const updatedRows = await this.execute(
      model
        .update(updateValues)
        .withSoftDeleted()
        .where(op.eq(primaryColumn as never, existingRow[primaryColumn.key] as never))
        .returning(() => returningColumns),
      executeOptions,
    ) as readonly Record<string, unknown>[];

    if (updatedRows.length !== 1 || !updatedRows[0]) {
      throw new ObjxSqlEngineError(
        `Expected a single updated row for model "${model.name}", received ${updatedRows.length}.`,
      );
    }

    return updatedRows[0];
  }

  async #executeRelationUpdate(
    builder: UpdateQueryBuilder<any, number>,
    options: ObjxRelationOptions,
  ): Promise<number> {
    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    return this.execute(builder, executeOptions) as Promise<number>;
  }

  async #insertModelRow<TModel extends AnyModelDefinition>(
    model: TModel,
    values: Record<string, unknown>,
    options: ObjxInsertGraphOptions,
  ): Promise<Record<string, unknown>> {
    const returningColumns = Object.values(model.columns) as AnyModelColumnReference[];
    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
      validationOperation?: ValidationOperation;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    executeOptions.validationOperation = 'insertGraph';

    const insertedRows = await this.execute(
      model.insert(values).returning(() => returningColumns),
      executeOptions,
    ) as readonly Record<string, unknown>[];

    if (insertedRows.length !== 1) {
      throw new ObjxSqlEngineError(
        `Expected a single inserted row for model "${model.name}", received ${insertedRows.length}.`,
      );
    }

    const insertedRow = insertedRows[0];

    if (!insertedRow) {
      throw new ObjxSqlEngineError(
        `Expected a single inserted row for model "${model.name}", but the driver returned no rows.`,
      );
    }

    return insertedRow;
  }

  #createJoinRow(
    relation: Exclude<AnyModelDefinition['relations'][string], undefined>,
    ownerRow: Record<string, unknown>,
    relatedRow: Record<string, unknown>,
    inputRow: Record<string, unknown>,
  ): Record<string, unknown> {
    if (relation.kind !== 'manyToMany' || !relation.through) {
      throw new ObjxSqlEngineError('Join row creation is only supported for many-to-many relations.');
    }

    const joinRow: Record<string, unknown> = {
      [relation.through.from.key]: ownerRow[relation.from.key],
      [relation.through.to.key]: relatedRow[relation.to.key],
    };

    for (const extra of relation.through.extras ?? []) {
      if (extra in inputRow) {
        joinRow[extra] = inputRow[extra];
      }
    }

    return joinRow;
  }

  async #insertJoinRow(
    table: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    const columns = Object.keys(values);

    if (columns.length === 0) {
      return;
    }

    await this.execute(
      sql`insert into ${identifier(table)} (${joinSql(columns.map((column) => identifier(column)))}) values (${joinSql(columns.map((column) => values[column]))})`,
    );
  }

  async #ensureJoinRow(
    table: string,
    values: Record<string, unknown>,
  ): Promise<boolean> {
    const columns = Object.keys(values);

    if (columns.length === 0) {
      return false;
    }

    const whereClauses = joinSql(
      columns.map((column, index) =>
        index === 0
          ? sql`${identifier(table, column)} = ${values[column]}`
          : sql`and ${identifier(table, column)} = ${values[column]}`,
      ),
      ' ',
    );
    const existing = await this.execute(
      sql`select * from ${identifier(table)} where ${whereClauses}`,
    );

    if (existing.rowCount > 0) {
      return false;
    }

    await this.#insertJoinRow(table, values);
    return true;
  }

  async #eagerLoadRelations(
    queryNode: SelectQueryNode,
    rows: readonly Record<string, unknown>[],
    options: ObjxQueryMaterializationOptions,
  ): Promise<readonly Record<string, unknown>[]> {
    const hydratedRows = rows.map((row) => ({ ...row }));
    const eagerRelationTree = this.#buildEagerRelationTree(queryNode.eagerRelations);

    await this.#attachRelationTree(
      queryNode.model,
      hydratedRows,
      eagerRelationTree,
      options,
    );

    return hydratedRows;
  }

  #parseEagerRelationPath(relationPath: string): readonly string[] {
    const normalizedRelationPath = relationPath.trim();

    if (normalizedRelationPath.length === 0) {
      throw new ObjxSqlEngineError('Eager relation path cannot be empty.');
    }

    const segments = normalizedRelationPath.split('.').map((segment) => segment.trim());

    if (segments.some((segment) => segment.length === 0)) {
      throw new ObjxSqlEngineError(
        `Invalid eager relation path "${relationPath}".`,
      );
    }

    return segments;
  }

  #buildEagerRelationTree(relationPaths: readonly string[]): EagerRelationTree {
    const tree: EagerRelationTree = new Map();

    for (const relationPath of relationPaths) {
      const segments = this.#parseEagerRelationPath(relationPath);
      let current = tree;

      for (const segment of segments) {
        const next = current.get(segment);

        if (next) {
          current = next;
          continue;
        }

        const child: EagerRelationTree = new Map();
        current.set(segment, child);
        current = child;
      }
    }

    return tree;
  }

  #collectAttachedRelationRows(
    rows: readonly Record<string, unknown>[],
    relationName: string,
  ): Record<string, unknown>[] {
    const nestedRows: Record<string, unknown>[] = [];
    const seen = new Set<Record<string, unknown>>();

    for (const row of rows) {
      const related = row[relationName];

      if (Array.isArray(related)) {
        for (const item of related) {
          if (!isRecord(item) || seen.has(item)) {
            continue;
          }

          seen.add(item);
          nestedRows.push(item);
        }

        continue;
      }

      if (!isRecord(related) || seen.has(related)) {
        continue;
      }

      seen.add(related);
      nestedRows.push(related);
    }

    return nestedRows;
  }

  async #attachRelationTree(
    model: AnyModelDefinition,
    rows: Record<string, unknown>[],
    relationTree: EagerRelationTree,
    options: ObjxQueryMaterializationOptions,
  ): Promise<void> {
    if (rows.length === 0 || relationTree.size === 0) {
      return;
    }

    for (const [relationName, childTree] of relationTree.entries()) {
      const relation = model.relations[relationName];

      if (!relation) {
        continue;
      }

      await this.#attachRelation(model, relationName, relation, rows, options);

      if (childTree.size === 0) {
        continue;
      }

      const nestedRows = this.#collectAttachedRelationRows(rows, relationName);

      if (nestedRows.length === 0) {
        continue;
      }

      await this.#attachRelationTree(
        relation.target(),
        nestedRows,
        childTree,
        options,
      );
    }
  }

  async #attachRelation(
    model: AnyModelDefinition,
    relationName: string,
    relation: AnyModelDefinition['relations'][string],
    rows: Record<string, unknown>[],
    options: ObjxQueryMaterializationOptions,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      if (!(relation.from.key in row)) {
        throw new ObjxSqlEngineError(
          `Cannot eager load relation "${relationName}" for model "${model.name}" because the source key "${relation.from.key}" is missing from the result set.`,
        );
      }
    }

    if (relation.kind === 'manyToMany' && relation.through) {
      await this.#attachManyToManyRelation(relationName, relation, rows, options);
      return;
    }

    const sourceValues = uniqueNonNullableValues(rows.map((row) => row[relation.from.key]));

    if (sourceValues.length === 0) {
      for (const row of rows) {
        row[relationName] = relation.kind === 'hasMany' ? [] : null;
      }

      return;
    }

    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    const targetRows = await this.execute(
      relation.target().query().where(
        op.in(relation.to as never, sourceValues as readonly never[]),
      ),
      executeOptions,
    ) as readonly Record<string, unknown>[];

    const rowsByTargetKey = new Map<unknown, Record<string, unknown>[]>();

    for (const targetRow of targetRows) {
      const key = targetRow[relation.to.key];

      if (!rowsByTargetKey.has(key)) {
        rowsByTargetKey.set(key, []);
      }

      rowsByTargetKey.get(key)?.push(targetRow);
    }

    for (const row of rows) {
      const sourceKey = row[relation.from.key];
      const matches = rowsByTargetKey.get(sourceKey) ?? [];

      row[relationName] = relation.kind === 'hasMany' ? matches : (matches[0] ?? null);
    }
  }

  async #attachManyToManyRelation(
    relationName: string,
    relation: Exclude<AnyModelDefinition['relations'][string], undefined>,
    rows: Record<string, unknown>[],
    options: ObjxQueryMaterializationOptions,
  ): Promise<void> {
    if (relation.kind !== 'manyToMany' || !relation.through) {
      return;
    }

    const sourceValues = uniqueNonNullableValues(rows.map((row) => row[relation.from.key]));

    if (sourceValues.length === 0) {
      for (const row of rows) {
        row[relationName] = [];
      }

      return;
    }

    const sourceAlias = '__objx_source';
    const targetAlias = '__objx_target';
    const throughRowsResult = await this.execute(
      sql`select ${identifier(relation.through.from.table, relation.through.from.key)} as ${identifier(sourceAlias)}, ${identifier(relation.through.to.table, relation.through.to.key)} as ${identifier(targetAlias)}
          from ${identifier(relation.through.from.table)}
          where ${identifier(relation.through.from.table, relation.through.from.key)} in (${joinSql(sourceValues)})`,
    );
    const throughRows = throughRowsResult.rows;
    const targetValues = uniqueNonNullableValues(throughRows.map((row) => row[targetAlias]));

    if (targetValues.length === 0) {
      for (const row of rows) {
        row[relationName] = [];
      }

      return;
    }

    const executeOptions: {
      hydrate?: boolean | HydrationOptions;
    } = {};

    if (options.hydrate !== undefined) {
      executeOptions.hydrate = options.hydrate;
    }

    const targetRows = await this.execute(
      relation.target().query().where(
        op.in(relation.to as never, targetValues as readonly never[]),
      ),
      executeOptions,
    ) as readonly Record<string, unknown>[];

    const targetsByKey = new Map<unknown, Record<string, unknown>[]>();

    for (const targetRow of targetRows) {
      const key = targetRow[relation.to.key];

      if (!targetsByKey.has(key)) {
        targetsByKey.set(key, []);
      }

      targetsByKey.get(key)?.push(targetRow);
    }

    const targetKeysBySource = new Map<unknown, unknown[]>();

    for (const throughRow of throughRows) {
      const sourceKey = throughRow[sourceAlias];
      const targetKey = throughRow[targetAlias];

      if (!targetKeysBySource.has(sourceKey)) {
        targetKeysBySource.set(sourceKey, []);
      }

      targetKeysBySource.get(sourceKey)?.push(targetKey);
    }

    for (const row of rows) {
      const sourceKey = row[relation.from.key];
      const targetKeys = targetKeysBySource.get(sourceKey) ?? [];
      const relatedRows = targetKeys.flatMap((targetKey) => targetsByKey.get(targetKey) ?? []);
      row[relationName] = relatedRows;
    }
  }
}

export function createSession<TTransaction = unknown>(
  options: ObjxSessionOptions<TTransaction>,
): ObjxSession<TTransaction> {
  return new ObjxSession(options);
}

export type SessionQueryResult<TQuery> = TQuery extends QueryNode ? unknown : QueryResult<TQuery>;

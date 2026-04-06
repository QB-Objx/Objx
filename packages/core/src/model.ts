import type { ModelDefinePluginContext, ObjxPlugin } from './plugin.js';
import type {
  DeleteQueryBuilder,
  InsertQueryBuilder,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from './query.js';
import {
  type AnyColumnDefinition,
  type ColumnDefinition,
  type ColumnInput,
  type InferColumnsShape,
  type ResolveColumns,
  resolveColumnInput,
} from './columns.js';
import {
  createDeleteQueryBuilder,
  createInsertQueryBuilder,
  createSelectQueryBuilder,
  createUpdateQueryBuilder,
} from './query.js';
import { createInternalId, deepFreeze } from './utils.js';

export interface ModelColumnReference<
  TModel extends AnyModelDefinition = AnyModelDefinition,
  TKey extends string = string,
  TValue = unknown,
> {
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
type Simplify<TValue> = {
  [TKey in keyof TValue]: TValue[TKey];
} & {};

type OptionalColumnKeys<TColumns extends ModelColumns> = Extract<
  {
    [TKey in keyof TColumns]: TColumns[TKey] extends ColumnDefinition<
      any,
      any,
      infer TNullable,
      infer TPrimary,
      infer THasDefault,
      infer TGenerated
    >
      ? TNullable extends true
        ? TKey
        : TPrimary extends true
          ? TKey
          : THasDefault extends true
            ? TKey
            : TGenerated extends true
              ? TKey
              : never
      : never;
  }[keyof TColumns],
  keyof TColumns
>;

type RequiredColumnKeys<TColumns extends ModelColumns> = Exclude<
  keyof TColumns,
  OptionalColumnKeys<TColumns>
>;

export interface ModelDefinition<
  TColumns extends ModelColumns = ModelColumns,
  TRelations extends ModelRelations = ModelRelations,
> {
  readonly kind: 'objx:model';
  readonly id: string;
  readonly name: string;
  readonly table: string;
  readonly dbTable: string;
  readonly columnDefinitions: TColumns;
  readonly columns: ModelColumnReferenceMap<TColumns, ModelDefinition<TColumns, TRelations>>;
  readonly relations: TRelations;
  readonly plugins: readonly ObjxPlugin[];
  readonly metadata: Readonly<Record<string, unknown>>;
  query(): SelectQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
  insert(
    values:
      | InferInsertShape<ModelDefinition<TColumns, TRelations>>
      | readonly InferInsertShape<ModelDefinition<TColumns, TRelations>>[],
  ): InsertQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
  insertMany(
    values: readonly InferInsertShape<ModelDefinition<TColumns, TRelations>>[],
  ): InsertQueryBuilder<ModelDefinition<TColumns, TRelations>, InferColumnsShape<TColumns>>;
  update(
    values: InferUpdateShape<ModelDefinition<TColumns, TRelations>>,
  ): UpdateQueryBuilder<ModelDefinition<TColumns, TRelations>, number>;
  delete(): DeleteQueryBuilder<ModelDefinition<TColumns, TRelations>, number>;
}

export type AnyModelDefinition = ModelDefinition<any, any>;

export type ModelColumnReferenceMap<
  TColumns extends ModelColumns,
  TModel extends AnyModelDefinition,
> = {
  [TKey in keyof TColumns]: ModelColumnReference<
    TModel,
    Extract<TKey, string>,
    TColumns[TKey] extends ColumnDefinition<infer TValue, any> ? TValue : never
  >;
};

export type InferModelShape<TModel extends AnyModelDefinition> = TModel extends ModelDefinition<
  infer TColumns,
  any
>
  ? InferColumnsShape<TColumns>
  : never;

export type InferInsertShape<TModel extends AnyModelDefinition> = TModel extends ModelDefinition<
  infer TColumns,
  any
>
  ? Simplify<
      {
        [TKey in RequiredColumnKeys<TColumns>]: InferColumnsShape<TColumns>[TKey];
      } & {
        [TKey in OptionalColumnKeys<TColumns>]?: InferColumnsShape<TColumns>[TKey];
      }
    >
  : never;

export type InferUpdateShape<TModel extends AnyModelDefinition> = Partial<InferModelShape<TModel>>;

export interface RelationOptions {
  readonly from: AnyModelColumnReference;
  readonly to: AnyModelColumnReference;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ManyToManyRelationOptions extends RelationOptions {
  readonly through: RelationThroughDefinition;
}

export interface ModelDefinitionConfig<
  TColumnsInput extends ModelColumnsInput,
  TRelations extends ModelRelations = EmptyModelRelations,
> {
  readonly name?: string;
  readonly table: string;
  readonly dbTable?: string;
  readonly columns: TColumnsInput;
  readonly relations?: (
    model: ModelDefinition<ResolveColumns<TColumnsInput>, EmptyModelRelations>,
  ) => TRelations;
  readonly plugins?: readonly ObjxPlugin[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function withColumnDbName<TColumn extends AnyColumnDefinition>(
  definition: TColumn,
  dbName: string,
): TColumn {
  return deepFreeze({
    ...definition,
    config: {
      ...definition.config,
      dbName,
    },
  }) as TColumn;
}

function applyModelDefinePlugins(
  modelName: string,
  table: string,
  dbTable: string,
  columns: Record<string, AnyColumnDefinition>,
  plugins: readonly ObjxPlugin[],
) {
  if (plugins.length === 0) {
    return {
      dbTable,
      columns,
    };
  }

  const dbNameOverrides = new Map<string, string>();
  let resolvedDbTable = dbTable;
  const context: ModelDefinePluginContext = {
    modelName,
    table,
    dbTable,
    columnDefinitions: columns,
    setTableDbName(nextDbTable) {
      const normalizedDbTable = nextDbTable.trim();

      if (!normalizedDbTable) {
        throw new Error(`Model "${modelName}" cannot map to an empty database table name.`);
      }

      resolvedDbTable = normalizedDbTable;
    },
    getTableDbName() {
      return resolvedDbTable;
    },
    setColumnDbName(columnKey, dbName) {
      if (!(columnKey in columns)) {
        throw new Error(
          `Column "${columnKey}" was not found on model "${modelName}" while applying naming overrides.`,
        );
      }

      const normalizedDbName = dbName.trim();

      if (!normalizedDbName) {
        throw new Error(
          `Column "${columnKey}" on model "${modelName}" cannot map to an empty database name.`,
        );
      }

      dbNameOverrides.set(columnKey, normalizedDbName);
    },
    getColumnDbName(columnKey) {
      const definition = columns[columnKey];

      if (!definition) {
        return undefined;
      }

      const configuredDbName = definition.config.dbName;
      return typeof configuredDbName === 'string' ? configuredDbName : undefined;
    },
  };

  for (const plugin of plugins) {
    plugin.hooks?.onModelDefine?.(context);
  }

  if (dbNameOverrides.size === 0) {
    return {
      dbTable: resolvedDbTable,
      columns,
    };
  }

  const nextColumns: Record<string, AnyColumnDefinition> = {};

  for (const [columnKey, definition] of Object.entries(columns)) {
    const dbName = dbNameOverrides.get(columnKey);
    nextColumns[columnKey] = dbName ? withColumnDbName(definition, dbName) : definition;
  }

  return {
    dbTable: resolvedDbTable,
    columns: nextColumns,
  };
}

function createColumnReference<
  TModel extends AnyModelDefinition,
  TKey extends string,
  TValue,
>(
  model: TModel,
  key: TKey,
  definition: ColumnDefinition<TValue>,
): ModelColumnReference<TModel, TKey, TValue> {
  return Object.freeze({
    kind: 'objx:column-ref',
    model,
    key,
    table: model.dbTable,
    definition,
    toString() {
      return `${model.dbTable}.${key}`;
    },
  });
}

function createRelationDefinition<TTarget extends AnyModelDefinition>(
  kind: RelationKind,
  target: () => TTarget,
  options: RelationOptions | ManyToManyRelationOptions,
): RelationDefinition<TTarget> {
  return Object.freeze({
    kind,
    target,
    from: options.from,
    to: options.to,
    through: 'through' in options ? options.through : undefined,
    metadata: deepFreeze({
      ...(options.metadata ?? {}),
    }),
  }) as RelationDefinition<TTarget>;
}

export function hasOne<TTarget extends AnyModelDefinition>(
  target: () => TTarget,
  options: RelationOptions,
): RelationDefinition<TTarget> {
  return createRelationDefinition('hasOne', target, options);
}

export function hasMany<TTarget extends AnyModelDefinition>(
  target: () => TTarget,
  options: RelationOptions,
): RelationDefinition<TTarget> {
  return createRelationDefinition('hasMany', target, options);
}

export function belongsToOne<TTarget extends AnyModelDefinition>(
  target: () => TTarget,
  options: RelationOptions,
): RelationDefinition<TTarget> {
  return createRelationDefinition('belongsToOne', target, options);
}

export function manyToMany<TTarget extends AnyModelDefinition>(
  target: () => TTarget,
  options: ManyToManyRelationOptions,
): RelationDefinition<TTarget> {
  return createRelationDefinition('manyToMany', target, options);
}

export function defineModel<
  TColumnsInput extends ModelColumnsInput,
  TRelations extends ModelRelations = EmptyModelRelations,
>(
  config: ModelDefinitionConfig<TColumnsInput, TRelations>,
): ModelDefinition<ResolveColumns<TColumnsInput>, TRelations> {
  const initialColumns = Object.fromEntries(
    Object.entries(config.columns).map(([key, value]) => [key, resolveColumnInput(value)]),
  ) as ResolveColumns<TColumnsInput>;
  const resolvedModelShape = applyModelDefinePlugins(
    config.name ?? config.table,
    config.table,
    config.dbTable ?? config.table,
    initialColumns as Record<string, AnyColumnDefinition>,
    config.plugins ?? [],
  );
  const resolvedColumns = resolvedModelShape.columns as ResolveColumns<TColumnsInput>;

  const modelShell = {
    kind: 'objx:model' as const,
    id: createInternalId('model'),
    name: config.name ?? config.table,
    table: config.table,
    dbTable: resolvedModelShape.dbTable,
    columnDefinitions: resolvedColumns,
    columns: {} as ModelColumnReferenceMap<ResolveColumns<TColumnsInput>, AnyModelDefinition>,
    relations: {} as TRelations,
    plugins: deepFreeze([...(config.plugins ?? [])]),
    metadata: deepFreeze({
      ...(config.metadata ?? {}),
    }),
    query() {
      return createSelectQueryBuilder(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
      );
    },
    insert(
      values:
        | InferInsertShape<ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>>
        | readonly InferInsertShape<ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>>[],
    ) {
      return createInsertQueryBuilder(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
        values,
      );
    },
    insertMany(
      values: readonly InferInsertShape<ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>>[],
    ) {
      return createInsertQueryBuilder(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
        values,
      );
    },
    update(
      values: InferUpdateShape<ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>>,
    ) {
      return createUpdateQueryBuilder(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
        values,
      );
    },
    delete() {
      return createDeleteQueryBuilder(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
      );
    },
  };

  const columnReferences = Object.fromEntries(
    Object.entries(resolvedColumns).map(([key, definition]) => [
      key,
      createColumnReference(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
        key,
        definition,
      ),
    ]),
  ) as ModelColumnReferenceMap<ResolveColumns<TColumnsInput>, ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>>;

  modelShell.columns = Object.freeze(columnReferences) as ModelColumnReferenceMap<
    ResolveColumns<TColumnsInput>,
    AnyModelDefinition
  >;

  const relations = config.relations
    ? config.relations(
        modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, EmptyModelRelations>,
      )
    : ({} as TRelations);

  modelShell.relations = Object.freeze(relations);

  return deepFreeze(
    modelShell as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>,
  ) as ModelDefinition<ResolveColumns<TColumnsInput>, TRelations>;
}

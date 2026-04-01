import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export type CodegenDialect = 'sqlite3' | 'postgres' | 'mysql';
export type StarterTemplateName = 'sqlite-starter' | 'postgres-starter' | 'mysql-starter';
export type TemplateName = StarterTemplateName | 'migration-seed-schemas';

export interface IntrospectedColumn {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly primary?: boolean;
  readonly defaultValue?: string;
}

export interface IntrospectedTable {
  readonly name: string;
  readonly columns: readonly IntrospectedColumn[];
}

export interface DatabaseIntrospection {
  readonly dialect: string;
  readonly tables: readonly IntrospectedTable[];
}

export interface GeneratedFile {
  readonly path: string;
  readonly contents: string;
}

export interface ModelGenerator<TOptions = unknown> {
  readonly name: string;
  generate(
    introspection: DatabaseIntrospection,
    options?: TOptions,
  ): Promise<readonly GeneratedFile[]> | readonly GeneratedFile[];
}

export interface TemplateGenerator<TOptions = unknown> {
  readonly name: string;
  generate(options?: TOptions): Promise<readonly GeneratedFile[]> | readonly GeneratedFile[];
}

type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface SqlSchemaExecutionContext {
  readonly dialect: string;
  execute(sqlText: string): MaybePromise<void>;
}

export type MigrationSchemaOperation =
  | readonly string[]
  | ((context: SqlSchemaExecutionContext) => MaybePromise<void>);

export interface MigrationSchema {
  readonly name: string;
  readonly description?: string;
  readonly up: MigrationSchemaOperation;
  readonly down?: MigrationSchemaOperation;
}

export interface SeedSchema {
  readonly name: string;
  readonly description?: string;
  readonly run: MigrationSchemaOperation;
  readonly revert?: MigrationSchemaOperation;
}

export type MigrationDirection = 'up' | 'down';
export type SeedDirection = 'run' | 'revert';

export interface ObjxModelGeneratorOptions {
  readonly outDir?: string;
  readonly includeIndex?: boolean;
}

export interface CodegenCliEnvironment {
  readonly cwd?: string;
  readonly moduleLoader?: ModuleLoader;
  stdout?(message: string): void;
  stderr?(message: string): void;
}

export type ModuleLoader = (specifier: string) => Promise<unknown>;

export interface GenerateCliOptions {
  readonly command: 'generate';
  readonly inputPath: string;
  readonly outDir: string;
}

export interface IntrospectCliOptions {
  readonly command: 'introspect';
  readonly dialect: CodegenDialect;
  readonly databasePath: string;
  readonly outPath: string;
}

export interface TemplateCliOptions {
  readonly command: 'template';
  readonly templateName: TemplateName;
  readonly outDir: string;
  readonly packageName?: string;
  readonly dialect?: CodegenDialect;
}

export interface MigrateCliOptions {
  readonly command: 'migrate';
  readonly dialect: CodegenDialect;
  readonly databasePath: string;
  readonly directoryPath: string;
  readonly direction: MigrationDirection;
  readonly steps?: number;
}

export interface SeedCliOptions {
  readonly command: 'seed';
  readonly dialect: CodegenDialect;
  readonly databasePath: string;
  readonly directoryPath: string;
  readonly direction: SeedDirection;
  readonly steps?: number;
}

export type CodegenCliOptions =
  | GenerateCliOptions
  | IntrospectCliOptions
  | TemplateCliOptions
  | MigrateCliOptions
  | SeedCliOptions;

export interface IntrospectSqliteDatabaseOptions {
  readonly databasePath: string;
  readonly includeTables?: readonly string[];
  readonly excludeTables?: readonly string[];
}

interface ExternalModuleLoaderOptions {
  readonly moduleLoader?: ModuleLoader;
}

export type CodegenPostgresQueryResultRow = Record<string, unknown>;

export interface CodegenPostgresQueryResult<
  TRow extends CodegenPostgresQueryResultRow = CodegenPostgresQueryResultRow,
> {
  readonly rows: readonly TRow[];
  readonly rowCount?: number | null;
  readonly command?: string;
}

export interface CodegenPostgresQueryExecutor {
  query(
    sqlText: string,
    parameters?: readonly unknown[],
  ): Promise<CodegenPostgresQueryResult>;
}

export interface CodegenPostgresPoolClient extends CodegenPostgresQueryExecutor {
  release(error?: Error | boolean): void;
}

export interface CodegenPostgresPool extends CodegenPostgresQueryExecutor {
  connect(): Promise<CodegenPostgresPoolClient>;
  end?(): Promise<void>;
}

export interface IntrospectPostgresDatabaseOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenPostgresPool;
  readonly client?: CodegenPostgresQueryExecutor;
  readonly schema?: string;
  readonly includeTables?: readonly string[];
  readonly excludeTables?: readonly string[];
}

export interface CodegenMySqlQueryExecutor {
  query(sqlText: string, parameters?: readonly unknown[]): Promise<unknown>;
}

export interface CodegenMySqlPoolConnection extends CodegenMySqlQueryExecutor {
  release(): void;
}

export interface CodegenMySqlPool extends CodegenMySqlQueryExecutor {
  getConnection(): Promise<CodegenMySqlPoolConnection>;
  end?(): Promise<void>;
}

export interface IntrospectMySqlDatabaseOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenMySqlPool;
  readonly client?: CodegenMySqlQueryExecutor;
  readonly databaseName?: string;
  readonly includeTables?: readonly string[];
  readonly excludeTables?: readonly string[];
}

export interface SqliteStarterTemplateOptions {
  readonly outDir?: string;
  readonly packageName?: string;
}

export interface PostgresStarterTemplateOptions {
  readonly outDir?: string;
  readonly packageName?: string;
}

export interface MySqlStarterTemplateOptions {
  readonly outDir?: string;
  readonly packageName?: string;
}

export interface MigrationSeedSchemaTemplateOptions {
  readonly outDir?: string;
  readonly dialect?: CodegenDialect;
}

export interface RunSqliteMigrationsOptions {
  readonly databasePath: string;
  readonly directoryPath: string;
  readonly direction?: MigrationDirection;
  readonly steps?: number;
}

export interface RunSqliteSeedsOptions {
  readonly databasePath: string;
  readonly directoryPath: string;
  readonly direction?: SeedDirection;
  readonly steps?: number;
}

export interface RunPostgresMigrationsOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenPostgresPool;
  readonly client?: CodegenPostgresQueryExecutor;
  readonly schema?: string;
  readonly directoryPath: string;
  readonly direction?: MigrationDirection;
  readonly steps?: number;
}

export interface RunPostgresSeedsOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenPostgresPool;
  readonly client?: CodegenPostgresQueryExecutor;
  readonly schema?: string;
  readonly directoryPath: string;
  readonly direction?: SeedDirection;
  readonly steps?: number;
}

export interface RunMySqlMigrationsOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenMySqlPool;
  readonly client?: CodegenMySqlQueryExecutor;
  readonly databaseName?: string;
  readonly directoryPath: string;
  readonly direction?: MigrationDirection;
  readonly steps?: number;
}

export interface RunMySqlSeedsOptions extends ExternalModuleLoaderOptions {
  readonly connectionString?: string;
  readonly pool?: CodegenMySqlPool;
  readonly client?: CodegenMySqlQueryExecutor;
  readonly databaseName?: string;
  readonly directoryPath: string;
  readonly direction?: SeedDirection;
  readonly steps?: number;
}

export interface SqliteSchemaRunResult<TDirection extends string> {
  readonly direction: TDirection;
  readonly executed: readonly string[];
  readonly totalCandidates: number;
}

export function defineGenerator<TOptions>(
  generator: ModelGenerator<TOptions>,
): ModelGenerator<TOptions> {
  return generator;
}

export function defineTemplate<TOptions>(
  template: TemplateGenerator<TOptions>,
): TemplateGenerator<TOptions> {
  return template;
}

export function defineMigration<TSchema extends MigrationSchema>(
  schema: TSchema,
): TSchema {
  return schema;
}

export function defineSeed<TSchema extends SeedSchema>(
  schema: TSchema,
): TSchema {
  return schema;
}

function isSchemaOperationCallback(
  operation: MigrationSchemaOperation,
): operation is (context: SqlSchemaExecutionContext) => MaybePromise<void> {
  return typeof operation === 'function';
}

async function runSchemaOperation(
  operation: MigrationSchemaOperation | undefined,
  context: SqlSchemaExecutionContext,
): Promise<void> {
  if (!operation) {
    return;
  }

  if (Array.isArray(operation)) {
    for (const statement of operation) {
      await context.execute(statement);
    }
    return;
  }

  if (!isSchemaOperationCallback(operation)) {
    throw new TypeError('Invalid schema operation: expected SQL statements or callback.');
  }

  await operation(context);
}

export async function runMigrationSchema(
  schema: MigrationSchema,
  context: SqlSchemaExecutionContext,
  direction: MigrationDirection = 'up',
): Promise<void> {
  if (direction === 'up') {
    await runSchemaOperation(schema.up, context);
    return;
  }

  if (!schema.down) {
    throw new Error(`Migration "${schema.name}" does not define a "down" operation.`);
  }

  await runSchemaOperation(schema.down, context);
}

export async function runSeedSchema(
  schema: SeedSchema,
  context: SqlSchemaExecutionContext,
  direction: SeedDirection = 'run',
): Promise<void> {
  if (direction === 'run') {
    await runSchemaOperation(schema.run, context);
    return;
  }

  if (!schema.revert) {
    throw new Error(`Seed "${schema.name}" does not define a "revert" operation.`);
  }

  await runSchemaOperation(schema.revert, context);
}

export function createSqliteSchemaExecutionContext(
  database: DatabaseSync,
  options: {
    readonly dialect?: string;
  } = {},
): SqlSchemaExecutionContext {
  return {
    dialect: options.dialect ?? 'sqlite3',
    execute(sqlText) {
      database.exec(sqlText);
    },
  };
}

const SQLITE_MIGRATION_HISTORY_TABLE = 'objx_migration_history';
const SQLITE_SEED_HISTORY_TABLE = 'objx_seed_history';
const POSTGRES_MIGRATION_HISTORY_TABLE = 'objx_migration_history';
const POSTGRES_SEED_HISTORY_TABLE = 'objx_seed_history';
const MYSQL_MIGRATION_HISTORY_TABLE = 'objx_migration_history';
const MYSQL_SEED_HISTORY_TABLE = 'objx_seed_history';
const SUPPORTED_SCHEMA_MODULE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

interface LoadedMigrationSchemaEntry {
  readonly fileName: string;
  readonly filePath: string;
  readonly schema: MigrationSchema;
}

interface LoadedSeedSchemaEntry {
  readonly fileName: string;
  readonly filePath: string;
  readonly schema: SeedSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFunction<TFunction extends (...args: never[]) => unknown>(
  value: unknown,
): value is TFunction {
  return typeof value === 'function';
}

function normalizeCodegenDialect(value: string): CodegenDialect {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'sqlite' || normalized === 'sqlite3' || normalized === 'better-sqlite3') {
    return 'sqlite3';
  }

  if (normalized === 'postgres' || normalized === 'postgresql' || normalized === 'pg') {
    return 'postgres';
  }

  if (normalized === 'mysql' || normalized === 'mysql2') {
    return 'mysql';
  }

  throw new Error(
    'Unsupported dialect. Use "--dialect sqlite3", "--dialect postgres" or "--dialect mysql".',
  );
}

function requireCodegenDialect(value: string): CodegenDialect {
  if (!value.trim()) {
    throw new Error('Missing required argument "--dialect <sqlite3|postgres|mysql>".');
  }

  return normalizeCodegenDialect(value);
}

function asString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${context} to be a string.`);
  }

  return value;
}

function asNullableString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'YES' || value === 'yes' || value === 't' || value === 'true';
}

function isRowArray(value: unknown): value is readonly Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

async function loadExternalModule(
  specifier: string,
  moduleLoader?: ModuleLoader,
): Promise<Record<string, unknown>> {
  const loaded = await (moduleLoader ?? ((pathValue: string) => import(pathValue)))(specifier);

  if (isRecord(loaded)) {
    return loaded;
  }

  return {
    default: loaded,
  };
}

function resolveModuleExport<TValue>(
  moduleExports: Record<string, unknown>,
  exportName: string,
): TValue | undefined {
  const direct = moduleExports[exportName];

  if (direct !== undefined) {
    return direct as TValue;
  }

  const defaultExport = moduleExports.default;

  if (isRecord(defaultExport) && exportName in defaultExport) {
    return defaultExport[exportName] as TValue;
  }

  return undefined;
}

function normalizePostgresQueryResult(raw: unknown): CodegenPostgresQueryResult {
  if (isRecord(raw) && 'rows' in raw && isRowArray(raw.rows)) {
    return {
      rows: raw.rows,
      rowCount:
        typeof raw.rowCount === 'number' || raw.rowCount === null
          ? raw.rowCount
          : raw.rows.length,
      ...(typeof raw.command === 'string' ? { command: raw.command } : {}),
    };
  }

  if (isRowArray(raw)) {
    return {
      rows: raw,
      rowCount: raw.length,
    };
  }

  throw new TypeError('Unsupported PostgreSQL query result shape returned by query executor.');
}

function normalizeMySqlQueryRows(raw: unknown): readonly Record<string, unknown>[] {
  if (isRowArray(raw)) {
    return raw;
  }

  if (Array.isArray(raw) && raw.length > 0 && isRowArray(raw[0])) {
    return raw[0];
  }

  if (isRecord(raw) && 'rows' in raw && isRowArray(raw.rows)) {
    return raw.rows;
  }

  return [];
}

interface PostgresCodegenRuntime {
  query(
    sqlText: string,
    parameters?: readonly unknown[],
  ): Promise<CodegenPostgresQueryResult>;
  withTransactionClient<TResult>(
    callback: (client: CodegenPostgresQueryExecutor) => Promise<TResult>,
  ): Promise<TResult>;
  close(): Promise<void>;
}

async function createPostgresPoolFromConnectionString(
  connectionString: string,
  moduleLoader?: ModuleLoader,
): Promise<CodegenPostgresPool> {
  const moduleExports = await loadExternalModule('pg', moduleLoader);
  const PoolConstructor = resolveModuleExport<new (options: { connectionString: string }) => unknown>(
    moduleExports,
    'Pool',
  );

  if (!isFunction(PoolConstructor)) {
    throw new Error(
      'Unable to load "pg". Install it to use PostgreSQL introspection, migrations and seeds.',
    );
  }

  const pool = new PoolConstructor({
    connectionString,
  });

  if (!isRecord(pool) || !isFunction(pool.query) || !isFunction(pool.connect)) {
    throw new Error('Loaded "pg" Pool does not implement the expected query/connect API.');
  }

  return pool as unknown as CodegenPostgresPool;
}

async function resolvePostgresCodegenRuntime(
  options: {
    readonly connectionString?: string;
    readonly pool?: CodegenPostgresPool;
    readonly client?: CodegenPostgresQueryExecutor;
    readonly moduleLoader?: ModuleLoader;
  },
): Promise<PostgresCodegenRuntime> {
  if (options.pool && options.client) {
    throw new Error('Provide either "pool" or "client" for PostgreSQL codegen, but not both.');
  }

  if (options.pool) {
    return {
      async query(sqlText, parameters = []) {
        return normalizePostgresQueryResult(
          await options.pool!.query(sqlText, parameters),
        );
      },
      async withTransactionClient(callback) {
        const client = await options.pool!.connect();

        try {
          return await callback(client);
        } finally {
          client.release();
        }
      },
      async close() {},
    };
  }

  if (options.client) {
    return {
      async query(sqlText, parameters = []) {
        return normalizePostgresQueryResult(
          await options.client!.query(sqlText, parameters),
        );
      },
      async withTransactionClient(callback) {
        return callback(options.client!);
      },
      async close() {},
    };
  }

  if (!options.connectionString) {
    throw new Error(
      'PostgreSQL codegen requires a "connectionString", "pool" or "client".',
    );
  }

  const pool = await createPostgresPoolFromConnectionString(
    options.connectionString,
    options.moduleLoader,
  );

  return {
    async query(sqlText, parameters = []) {
      return normalizePostgresQueryResult(await pool.query(sqlText, parameters));
    },
    async withTransactionClient(callback) {
      const client = await pool.connect();

      try {
        return await callback(client);
      } finally {
        client.release();
      }
    },
    async close() {
      if (isFunction(pool.end)) {
        await pool.end();
      }
    },
  };
}

interface MySqlCodegenRuntime {
  query(sqlText: string, parameters?: readonly unknown[]): Promise<unknown>;
  withTransactionClient<TResult>(
    callback: (client: CodegenMySqlQueryExecutor) => Promise<TResult>,
  ): Promise<TResult>;
  close(): Promise<void>;
}

async function createMySqlPoolFromConnectionString(
  connectionString: string,
  moduleLoader?: ModuleLoader,
): Promise<CodegenMySqlPool> {
  const moduleExports = await loadExternalModule('mysql2/promise', moduleLoader);
  const createPool = resolveModuleExport<
    (connection: string | { uri: string }) => unknown
  >(moduleExports, 'createPool');

  if (!isFunction(createPool)) {
    throw new Error(
      'Unable to load "mysql2/promise". Install it to use MySQL introspection, migrations and seeds.',
    );
  }

  const pool = createPool(connectionString);

  if (!isRecord(pool) || !isFunction(pool.query) || !isFunction(pool.getConnection)) {
    throw new Error(
      'Loaded "mysql2/promise" pool does not implement the expected query/getConnection API.',
    );
  }

  return pool as unknown as CodegenMySqlPool;
}

async function resolveMySqlCodegenRuntime(
  options: {
    readonly connectionString?: string;
    readonly pool?: CodegenMySqlPool;
    readonly client?: CodegenMySqlQueryExecutor;
    readonly moduleLoader?: ModuleLoader;
  },
): Promise<MySqlCodegenRuntime> {
  if (options.pool && options.client) {
    throw new Error('Provide either "pool" or "client" for MySQL codegen, but not both.');
  }

  if (options.pool) {
    return {
      async query(sqlText, parameters = []) {
        return options.pool!.query(sqlText, parameters);
      },
      async withTransactionClient(callback) {
        const connection = await options.pool!.getConnection();

        try {
          return await callback(connection);
        } finally {
          connection.release();
        }
      },
      async close() {},
    };
  }

  if (options.client) {
    return {
      async query(sqlText, parameters = []) {
        return options.client!.query(sqlText, parameters);
      },
      async withTransactionClient(callback) {
        return callback(options.client!);
      },
      async close() {},
    };
  }

  if (!options.connectionString) {
    throw new Error('MySQL codegen requires a "connectionString", "pool" or "client".');
  }

  const pool = await createMySqlPoolFromConnectionString(
    options.connectionString,
    options.moduleLoader,
  );

  return {
    async query(sqlText, parameters = []) {
      return pool.query(sqlText, parameters);
    },
    async withTransactionClient(callback) {
      const connection = await pool.getConnection();

      try {
        return await callback(connection);
      } finally {
        connection.release();
      }
    },
    async close() {
      if (isFunction(pool.end)) {
        await pool.end();
      }
    },
  };
}

interface SchemaTransactionContext {
  readonly context: SqlSchemaExecutionContext;
  insertAppliedName(name: string): Promise<void>;
  deleteAppliedName(name: string): Promise<void>;
}

interface SchemaHistoryAdapter {
  ensureHistoryTable(): Promise<void>;
  listAppliedNames(order: 'asc' | 'desc'): Promise<readonly string[]>;
  runInTransaction<TResult>(
    callback: (transaction: SchemaTransactionContext) => Promise<TResult>,
  ): Promise<TResult>;
  close(): Promise<void>;
}

interface RunSchemaSetOptions<
  TEntry extends LoadedMigrationSchemaEntry | LoadedSeedSchemaEntry,
  TDirection extends string,
> {
  readonly adapter: SchemaHistoryAdapter;
  readonly directoryPath: string;
  readonly direction: TDirection;
  readonly steps?: number;
  readonly forwardDirection: TDirection;
  readonly loadEntries: (directoryPath: string) => Promise<readonly TEntry[]>;
  readonly runSchema: (
    schema: TEntry['schema'],
    context: SqlSchemaExecutionContext,
    direction: TDirection,
  ) => Promise<void>;
  readonly missingSchemaMessage: (name: string, directoryPath: string) => string;
}

async function runSchemaSet<
  TEntry extends LoadedMigrationSchemaEntry | LoadedSeedSchemaEntry,
  TDirection extends string,
>(
  options: RunSchemaSetOptions<TEntry, TDirection>,
): Promise<SqliteSchemaRunResult<TDirection>> {
  const loadedSchemas = await options.loadEntries(options.directoryPath);
  const executed: string[] = [];
  const allByName = new Map(loadedSchemas.map((entry) => [entry.schema.name, entry] as const));

  await options.adapter.ensureHistoryTable();

  if (options.direction === options.forwardDirection) {
    const appliedNames = new Set(await options.adapter.listAppliedNames('asc'));
    const pending = loadedSchemas.filter((entry) => !appliedNames.has(entry.schema.name));
    const targets = options.steps !== undefined ? pending.slice(0, options.steps) : pending;

    for (const target of targets) {
      await options.adapter.runInTransaction(async (transaction) => {
        await options.runSchema(target.schema, transaction.context, options.forwardDirection);
        await transaction.insertAppliedName(target.schema.name);
      });
      executed.push(target.schema.name);
    }
  } else {
    const appliedNames = await options.adapter.listAppliedNames('desc');
    const targets = appliedNames.slice(0, resolveDownOrRevertStepCount(options.steps));

    for (const targetName of targets) {
      const schemaEntry = allByName.get(targetName);

      if (!schemaEntry) {
        throw new Error(options.missingSchemaMessage(targetName, options.directoryPath));
      }

      await options.adapter.runInTransaction(async (transaction) => {
        await options.runSchema(schemaEntry.schema, transaction.context, options.direction);
        await transaction.deleteAppliedName(schemaEntry.schema.name);
      });
      executed.push(schemaEntry.schema.name);
    }
  }

  return {
    direction: options.direction,
    executed,
    totalCandidates: loadedSchemas.length,
  };
}

function parsePositiveInteger(value: string, argument: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for "${argument}": ${value}. Expected a positive integer.`);
  }

  return parsed;
}

function isMigrationSchemaOperation(value: unknown): value is MigrationSchemaOperation {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'string');
  }

  return typeof value === 'function';
}

function resolveSchemaModuleExport(
  moduleExports: Record<string, unknown>,
  preferredName: 'migration' | 'seed',
): unknown {
  if ('default' in moduleExports) {
    return moduleExports.default;
  }

  if (preferredName in moduleExports) {
    return moduleExports[preferredName];
  }

  if ('schema' in moduleExports) {
    return moduleExports.schema;
  }

  return undefined;
}

function assertMigrationSchema(value: unknown, filePath: string): MigrationSchema {
  if (!isRecord(value)) {
    throw new Error(`Migration module "${filePath}" does not export a migration object.`);
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new Error(`Migration module "${filePath}" must export a non-empty "name".`);
  }

  const up = value.up;

  if (!isMigrationSchemaOperation(up)) {
    throw new Error(`Migration "${value.name}" in "${filePath}" must define a valid "up" operation.`);
  }

  const down = value.down;

  if (down !== undefined && !isMigrationSchemaOperation(down)) {
    throw new Error(
      `Migration "${value.name}" in "${filePath}" has an invalid "down" operation.`,
    );
  }

  if ('description' in value && value.description !== undefined && typeof value.description !== 'string') {
    throw new Error(
      `Migration "${value.name}" in "${filePath}" has an invalid "description" value.`,
    );
  }

  const schema: {
    name: string;
    up: MigrationSchemaOperation;
    description?: string;
    down?: MigrationSchemaOperation;
  } = {
    name: value.name,
    up,
  };

  if (typeof value.description === 'string') {
    schema.description = value.description;
  }

  if (down !== undefined) {
    schema.down = down;
  }

  return schema;
}

function assertSeedSchema(value: unknown, filePath: string): SeedSchema {
  if (!isRecord(value)) {
    throw new Error(`Seed module "${filePath}" does not export a seed object.`);
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new Error(`Seed module "${filePath}" must export a non-empty "name".`);
  }

  const run = value.run;

  if (!isMigrationSchemaOperation(run)) {
    throw new Error(`Seed "${value.name}" in "${filePath}" must define a valid "run" operation.`);
  }

  const revert = value.revert;

  if (revert !== undefined && !isMigrationSchemaOperation(revert)) {
    throw new Error(
      `Seed "${value.name}" in "${filePath}" has an invalid "revert" operation.`,
    );
  }

  if ('description' in value && value.description !== undefined && typeof value.description !== 'string') {
    throw new Error(
      `Seed "${value.name}" in "${filePath}" has an invalid "description" value.`,
    );
  }

  const schema: {
    name: string;
    run: MigrationSchemaOperation;
    description?: string;
    revert?: MigrationSchemaOperation;
  } = {
    name: value.name,
    run,
  };

  if (typeof value.description === 'string') {
    schema.description = value.description;
  }

  if (revert !== undefined) {
    schema.revert = revert;
  }

  return schema;
}

function readSqliteHistoryNameRows(
  database: DatabaseSync,
  sqlText: string,
): readonly { name: string }[] {
  const rawRows = database.prepare(sqlText).all() as readonly Record<string, unknown>[];

  return rawRows.map((row, index) => {
    if (typeof row.name !== 'string') {
      throw new Error(
        `Expected "name" column as string when reading schema history (row ${index + 1}).`,
      );
    }

    return {
      name: row.name,
    };
  });
}

async function importSchemaModule(filePath: string): Promise<Record<string, unknown>> {
  try {
    const moduleUrl = new URL(pathToFileURL(filePath).href);
    moduleUrl.searchParams.set(
      'objx_runner_cache_bust',
      `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    );
    return (await import(moduleUrl.href)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to import schema module "${filePath}". ` +
        'Use JavaScript modules (.js, .mjs or .cjs) for migration/seed execution.',
      {
        cause: error instanceof Error ? error : undefined,
      },
    );
  }
}

async function listSchemaModuleFiles(directoryPath: string): Promise<readonly { name: string; path: string }[]> {
  let entries: readonly { name: string; path: string }[] = [];

  try {
    const directoryEntries = await readdir(directoryPath, {
      withFileTypes: true,
    });

    entries = directoryEntries
      .filter((entry) => {
        if (!entry.isFile()) {
          return false;
        }

        const extension = path.extname(entry.name).toLowerCase();
        return SUPPORTED_SCHEMA_MODULE_EXTENSIONS.has(extension);
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(directoryPath, entry.name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    throw new Error(`Unable to read schema directory "${directoryPath}".`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  return entries;
}

function assertUniqueSchemaNames(
  entries: readonly { schema: { name: string }; filePath: string }[],
  schemaKind: 'migration' | 'seed',
): void {
  const byName = new Map<string, string>();

  for (const entry of entries) {
    const existing = byName.get(entry.schema.name);

    if (existing) {
      throw new Error(
        `Duplicate ${schemaKind} schema name "${entry.schema.name}" in "${existing}" and "${entry.filePath}".`,
      );
    }

    byName.set(entry.schema.name, entry.filePath);
  }
}

async function loadMigrationSchemasFromDirectory(
  directoryPath: string,
): Promise<readonly LoadedMigrationSchemaEntry[]> {
  const schemaFiles = await listSchemaModuleFiles(directoryPath);
  const loaded: LoadedMigrationSchemaEntry[] = [];

  for (const schemaFile of schemaFiles) {
    const moduleExports = await importSchemaModule(schemaFile.path);
    const schema = assertMigrationSchema(
      resolveSchemaModuleExport(moduleExports, 'migration'),
      schemaFile.path,
    );

    loaded.push({
      fileName: schemaFile.name,
      filePath: schemaFile.path,
      schema,
    });
  }

  assertUniqueSchemaNames(loaded, 'migration');
  return loaded;
}

async function loadSeedSchemasFromDirectory(
  directoryPath: string,
): Promise<readonly LoadedSeedSchemaEntry[]> {
  const schemaFiles = await listSchemaModuleFiles(directoryPath);
  const loaded: LoadedSeedSchemaEntry[] = [];

  for (const schemaFile of schemaFiles) {
    const moduleExports = await importSchemaModule(schemaFile.path);
    const schema = assertSeedSchema(
      resolveSchemaModuleExport(moduleExports, 'seed'),
      schemaFile.path,
    );

    loaded.push({
      fileName: schemaFile.name,
      filePath: schemaFile.path,
      schema,
    });
  }

  assertUniqueSchemaNames(loaded, 'seed');
  return loaded;
}

function createPostgresSchemaExecutionContext(
  client: CodegenPostgresQueryExecutor,
): SqlSchemaExecutionContext {
  return {
    dialect: 'postgres',
    async execute(sqlText) {
      await client.query(sqlText);
    },
  };
}

function createPostgresHistoryAdapter(
  runtime: PostgresCodegenRuntime,
  historyTableName: string,
  schemaName: string,
): SchemaHistoryAdapter {
  const historyTable = `${quotePostgresIdentifier(schemaName)}.${quotePostgresIdentifier(historyTableName)}`;

  return {
    async ensureHistoryTable() {
      await runtime.query(
        `create table if not exists ${historyTable} (
          id bigserial primary key,
          name text not null unique,
          executedAt timestamptz not null
        )`,
      );
    },
    async listAppliedNames(order) {
      const result = await runtime.query(
        `select name from ${historyTable} order by id ${order}`,
      );

      return result.rows.map((row, index) =>
        asString(row.name, `PostgreSQL history row ${index + 1}.name`),
      );
    },
    async runInTransaction(callback) {
      return runtime.withTransactionClient(async (client) => {
        await client.query('begin');

        try {
          const transactionContext: SchemaTransactionContext = {
            context: createPostgresSchemaExecutionContext(client),
            async insertAppliedName(name) {
              await client.query(
                `insert into ${historyTable} (name, executedAt) values ($1, $2)`,
                [name, new Date().toISOString()],
              );
            },
            async deleteAppliedName(name) {
              await client.query(
                `delete from ${historyTable} where name = $1`,
                [name],
              );
            },
          };

          const result = await callback(transactionContext);
          await client.query('commit');
          return result;
        } catch (error) {
          try {
            await client.query('rollback');
          } catch {
            // Preserve the original failure.
          }

          throw error;
        }
      });
    },
    async close() {
      await runtime.close();
    },
  };
}

function createMySqlSchemaExecutionContext(
  client: CodegenMySqlQueryExecutor,
): SqlSchemaExecutionContext {
  return {
    dialect: 'mysql',
    async execute(sqlText) {
      await client.query(sqlText);
    },
  };
}

function createMySqlHistoryAdapter(
  runtime: MySqlCodegenRuntime,
  historyTableName: string,
): SchemaHistoryAdapter {
  const historyTable = quoteMySqlIdentifier(historyTableName);

  return {
    async ensureHistoryTable() {
      await runtime.query(
        `create table if not exists ${historyTable} (
          id bigint unsigned not null auto_increment primary key,
          name varchar(255) not null unique,
          executedAt datetime(3) not null
        )`,
      );
    },
    async listAppliedNames(order) {
      const rows = normalizeMySqlQueryRows(
        await runtime.query(
          `select name from ${historyTable} order by id ${order}`,
        ),
      );

      return rows.map((row, index) =>
        asString(row.name, `MySQL history row ${index + 1}.name`),
      );
    },
    async runInTransaction(callback) {
      return runtime.withTransactionClient(async (client) => {
        await client.query('start transaction');

        try {
          const transactionContext: SchemaTransactionContext = {
            context: createMySqlSchemaExecutionContext(client),
            async insertAppliedName(name) {
              await client.query(
                `insert into ${historyTable} (name, executedAt) values (?, ?)`,
                [name, new Date().toISOString()],
              );
            },
            async deleteAppliedName(name) {
              await client.query(
                `delete from ${historyTable} where name = ?`,
                [name],
              );
            },
          };

          const result = await callback(transactionContext);
          await client.query('commit');
          return result;
        } catch (error) {
          try {
            await client.query('rollback');
          } catch {
            // Preserve the original failure.
          }

          throw error;
        }
      });
    },
    async close() {
      await runtime.close();
    },
  };
}

async function runInSqliteTransaction(
  database: DatabaseSync,
  callback: () => Promise<void>,
): Promise<void> {
  database.exec('begin');

  try {
    await callback();
    database.exec('commit');
  } catch (error) {
    try {
      database.exec('rollback');
    } catch {
      // Preserve the original failure.
    }

    throw error;
  }
}

function ensureSqliteMigrationHistoryTable(database: DatabaseSync): void {
  database.exec(
    `create table if not exists ${quoteSqliteIdentifier(SQLITE_MIGRATION_HISTORY_TABLE)} (
      name text primary key,
      executedAt text not null
    );`,
  );
}

function ensureSqliteSeedHistoryTable(database: DatabaseSync): void {
  database.exec(
    `create table if not exists ${quoteSqliteIdentifier(SQLITE_SEED_HISTORY_TABLE)} (
      name text primary key,
      executedAt text not null
    );`,
  );
}

function resolveDownOrRevertStepCount(steps: number | undefined): number {
  if (steps === undefined) {
    return 1;
  }

  return steps;
}

export async function runSqliteMigrations(
  options: RunSqliteMigrationsOptions,
): Promise<SqliteSchemaRunResult<MigrationDirection>> {
  const direction = options.direction ?? 'up';
  const database = new DatabaseSync(options.databasePath);

  try {
    ensureSqliteMigrationHistoryTable(database);

    const loadedSchemas = await loadMigrationSchemasFromDirectory(options.directoryPath);
    const context = createSqliteSchemaExecutionContext(database);
    const executed: string[] = [];
    const allByName = new Map(loadedSchemas.map((entry) => [entry.schema.name, entry] as const));

    if (direction === 'up') {
      const appliedRows = readSqliteHistoryNameRows(
        database,
        `select name from ${quoteSqliteIdentifier(SQLITE_MIGRATION_HISTORY_TABLE)} order by executedAt asc, rowid asc`,
      );
      const appliedNames = new Set(appliedRows.map((row) => row.name));
      const pending = loadedSchemas.filter((entry) => !appliedNames.has(entry.schema.name));
      const targets = options.steps !== undefined ? pending.slice(0, options.steps) : pending;
      const insertStatement = database.prepare(
        `insert into ${quoteSqliteIdentifier(SQLITE_MIGRATION_HISTORY_TABLE)} (name, executedAt) values (?, ?)`,
      );

      for (const target of targets) {
        await runInSqliteTransaction(database, async () => {
          await runMigrationSchema(target.schema, context, 'up');
          insertStatement.run(target.schema.name, new Date().toISOString());
        });

        executed.push(target.schema.name);
      }
    } else {
      const appliedRows = readSqliteHistoryNameRows(
        database,
        `select name from ${quoteSqliteIdentifier(SQLITE_MIGRATION_HISTORY_TABLE)} order by executedAt desc, rowid desc`,
      );
      const stepCount = resolveDownOrRevertStepCount(options.steps);
      const targets = appliedRows.slice(0, stepCount);
      const deleteStatement = database.prepare(
        `delete from ${quoteSqliteIdentifier(SQLITE_MIGRATION_HISTORY_TABLE)} where name = ?`,
      );

      for (const target of targets) {
        const schemaEntry = allByName.get(target.name);

        if (!schemaEntry) {
          throw new Error(
            `Migration "${target.name}" was applied but its schema file was not found in "${options.directoryPath}".`,
          );
        }

        await runInSqliteTransaction(database, async () => {
          await runMigrationSchema(schemaEntry.schema, context, 'down');
          deleteStatement.run(schemaEntry.schema.name);
        });

        executed.push(schemaEntry.schema.name);
      }
    }

    return {
      direction,
      executed,
      totalCandidates: loadedSchemas.length,
    };
  } finally {
    database.close();
  }
}

export async function runSqliteSeeds(
  options: RunSqliteSeedsOptions,
): Promise<SqliteSchemaRunResult<SeedDirection>> {
  const direction = options.direction ?? 'run';
  const database = new DatabaseSync(options.databasePath);

  try {
    ensureSqliteSeedHistoryTable(database);

    const loadedSchemas = await loadSeedSchemasFromDirectory(options.directoryPath);
    const context = createSqliteSchemaExecutionContext(database);
    const executed: string[] = [];
    const allByName = new Map(loadedSchemas.map((entry) => [entry.schema.name, entry] as const));

    if (direction === 'run') {
      const appliedRows = readSqliteHistoryNameRows(
        database,
        `select name from ${quoteSqliteIdentifier(SQLITE_SEED_HISTORY_TABLE)} order by executedAt asc, rowid asc`,
      );
      const appliedNames = new Set(appliedRows.map((row) => row.name));
      const pending = loadedSchemas.filter((entry) => !appliedNames.has(entry.schema.name));
      const targets = options.steps !== undefined ? pending.slice(0, options.steps) : pending;
      const insertStatement = database.prepare(
        `insert into ${quoteSqliteIdentifier(SQLITE_SEED_HISTORY_TABLE)} (name, executedAt) values (?, ?)`,
      );

      for (const target of targets) {
        await runInSqliteTransaction(database, async () => {
          await runSeedSchema(target.schema, context, 'run');
          insertStatement.run(target.schema.name, new Date().toISOString());
        });

        executed.push(target.schema.name);
      }
    } else {
      const appliedRows = readSqliteHistoryNameRows(
        database,
        `select name from ${quoteSqliteIdentifier(SQLITE_SEED_HISTORY_TABLE)} order by executedAt desc, rowid desc`,
      );
      const stepCount = resolveDownOrRevertStepCount(options.steps);
      const targets = appliedRows.slice(0, stepCount);
      const deleteStatement = database.prepare(
        `delete from ${quoteSqliteIdentifier(SQLITE_SEED_HISTORY_TABLE)} where name = ?`,
      );

      for (const target of targets) {
        const schemaEntry = allByName.get(target.name);

        if (!schemaEntry) {
          throw new Error(
            `Seed "${target.name}" was applied but its schema file was not found in "${options.directoryPath}".`,
          );
        }

        await runInSqliteTransaction(database, async () => {
          await runSeedSchema(schemaEntry.schema, context, 'revert');
          deleteStatement.run(schemaEntry.schema.name);
        });

        executed.push(schemaEntry.schema.name);
      }
    }

    return {
      direction,
      executed,
      totalCandidates: loadedSchemas.length,
    };
  } finally {
    database.close();
  }
}

export async function runPostgresMigrations(
  options: RunPostgresMigrationsOptions,
): Promise<SqliteSchemaRunResult<MigrationDirection>> {
  const runtime = await resolvePostgresCodegenRuntime(options);
  const adapter = createPostgresHistoryAdapter(
    runtime,
    POSTGRES_MIGRATION_HISTORY_TABLE,
    options.schema ?? 'public',
  );

  return runSchemaSet({
    adapter,
    directoryPath: options.directoryPath,
    direction: options.direction ?? 'up',
    forwardDirection: 'up',
    loadEntries: loadMigrationSchemasFromDirectory,
    runSchema: runMigrationSchema,
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    missingSchemaMessage(name, directoryPath) {
      return `Migration "${name}" was applied but its schema file was not found in "${directoryPath}".`;
    },
  }).finally(async () => {
    await adapter.close();
  });
}

export async function runPostgresSeeds(
  options: RunPostgresSeedsOptions,
): Promise<SqliteSchemaRunResult<SeedDirection>> {
  const runtime = await resolvePostgresCodegenRuntime(options);
  const adapter = createPostgresHistoryAdapter(
    runtime,
    POSTGRES_SEED_HISTORY_TABLE,
    options.schema ?? 'public',
  );

  return runSchemaSet({
    adapter,
    directoryPath: options.directoryPath,
    direction: options.direction ?? 'run',
    forwardDirection: 'run',
    loadEntries: loadSeedSchemasFromDirectory,
    runSchema: runSeedSchema,
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    missingSchemaMessage(name, directoryPath) {
      return `Seed "${name}" was applied but its schema file was not found in "${directoryPath}".`;
    },
  }).finally(async () => {
    await adapter.close();
  });
}

export async function runMySqlMigrations(
  options: RunMySqlMigrationsOptions,
): Promise<SqliteSchemaRunResult<MigrationDirection>> {
  const runtime = await resolveMySqlCodegenRuntime(options);
  const adapter = createMySqlHistoryAdapter(runtime, MYSQL_MIGRATION_HISTORY_TABLE);

  return runSchemaSet({
    adapter,
    directoryPath: options.directoryPath,
    direction: options.direction ?? 'up',
    forwardDirection: 'up',
    loadEntries: loadMigrationSchemasFromDirectory,
    runSchema: runMigrationSchema,
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    missingSchemaMessage(name, directoryPath) {
      return `Migration "${name}" was applied but its schema file was not found in "${directoryPath}".`;
    },
  }).finally(async () => {
    await adapter.close();
  });
}

export async function runMySqlSeeds(
  options: RunMySqlSeedsOptions,
): Promise<SqliteSchemaRunResult<SeedDirection>> {
  const runtime = await resolveMySqlCodegenRuntime(options);
  const adapter = createMySqlHistoryAdapter(runtime, MYSQL_SEED_HISTORY_TABLE);

  return runSchemaSet({
    adapter,
    directoryPath: options.directoryPath,
    direction: options.direction ?? 'run',
    forwardDirection: 'run',
    loadEntries: loadSeedSchemasFromDirectory,
    runSchema: runSeedSchema,
    ...(options.steps !== undefined ? { steps: options.steps } : {}),
    missingSchemaMessage(name, directoryPath) {
      return `Seed "${name}" was applied but its schema file was not found in "${directoryPath}".`;
    },
  }).finally(async () => {
    await adapter.close();
  });
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteMySqlIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll('`', '``')}\``;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('');
}

function inferPackageName(outDir: string, fallback = 'objx-sqlite-starter'): string {
  const normalized = outDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = normalized.split('/').filter(Boolean).at(-1);
  return base && base !== '.' ? base : fallback;
}

function renderColumnBuilder(column: IntrospectedColumn): string {
  const normalizedType = column.type.trim().toLowerCase();
  let builder =
    normalizedType === 'int' ||
    normalizedType === 'integer' ||
    normalizedType === 'bigint' ||
    normalizedType === 'smallint'
      ? 'col.int()'
      : normalizedType === 'text' ||
          normalizedType === 'varchar' ||
          normalizedType === 'character varying' ||
          normalizedType === 'char' ||
          normalizedType === 'string'
        ? 'col.text()'
        : normalizedType === 'boolean' || normalizedType === 'bool'
          ? 'col.boolean()'
          : normalizedType === 'json' || normalizedType === 'jsonb'
            ? 'col.json()'
            : normalizedType === 'uuid'
              ? 'col.uuid()'
              : normalizedType === 'timestamp' ||
                  normalizedType === 'timestamptz' ||
                  normalizedType === 'datetime' ||
                  normalizedType === 'date'
                ? 'col.timestamp()'
                : `col.custom<unknown>(${JSON.stringify(column.type)})`;

  if (column.nullable) {
    builder += '.nullable()';
  }

  if (column.primary) {
    builder += '.primary()';
  }

  return builder;
}

function renderModelFile(table: IntrospectedTable): string {
  const modelName = toPascalCase(table.name);
  const columns = table.columns
    .map((column) => `    ${column.name}: ${renderColumnBuilder(column)},`)
    .join('\n');

  return `import { col, defineModel } from '@objx/core';

export const ${modelName} = defineModel({
  name: '${modelName}',
  table: '${table.name}',
  columns: {
${columns}
  },
});
`;
}

export function createObjxModelGenerator(
  options: ObjxModelGeneratorOptions = {},
): ModelGenerator<ObjxModelGeneratorOptions> {
  const outDir = options.outDir ?? 'generated/models';
  const includeIndex = options.includeIndex ?? true;

  return defineGenerator({
    name: 'objx-models',
    async generate(introspection) {
      const files: GeneratedFile[] = introspection.tables.map((table) => ({
        path: path.posix.join(outDir, `${table.name}.model.ts`),
        contents: renderModelFile(table),
      }));

      if (includeIndex) {
        files.push({
          path: path.posix.join(outDir, 'index.ts'),
          contents: introspection.tables
            .map((table) => {
              const modelName = toPascalCase(table.name);
              return `export { ${modelName} } from './${table.name}.model.js';`;
            })
            .join('\n')
            .concat('\n'),
        });
      }

      return files;
    },
  });
}

export async function writeGeneratedFiles(
  files: readonly GeneratedFile[],
  cwd = process.cwd(),
): Promise<void> {
  for (const file of files) {
    const targetPath = path.resolve(cwd, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.contents, 'utf8');
  }
}

export async function introspectSqliteDatabase(
  options: IntrospectSqliteDatabaseOptions,
): Promise<DatabaseIntrospection> {
  const database = new DatabaseSync(options.databasePath);

  try {
    const includeTables = options.includeTables ? new Set(options.includeTables) : undefined;
    const excludeTables = new Set(options.excludeTables ?? []);
    const tables = database
      .prepare(
        `select name
           from sqlite_master
          where type = 'table'
            and name not like 'sqlite_%'
          order by name`,
      )
      .all() as unknown as readonly { name: string }[];
    const introspectedTables: IntrospectedTable[] = [];

    for (const table of tables) {
      if (includeTables && !includeTables.has(table.name)) {
        continue;
      }

      if (excludeTables.has(table.name)) {
        continue;
      }

      const columns = database
        .prepare(`pragma table_info(${quoteSqliteIdentifier(table.name)})`)
        .all() as unknown as readonly {
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }[];

      introspectedTables.push({
        name: table.name,
        columns: columns.map((column) => {
          const definition: {
            name: string;
            type: string;
            nullable: boolean;
            primary: boolean;
            defaultValue?: string;
          } = {
            name: column.name,
            type: column.type || 'text',
            nullable: column.notnull === 0 && column.pk === 0,
            primary: column.pk > 0,
          };

          if (column.dflt_value !== null) {
            definition.defaultValue = column.dflt_value;
          }

          return definition;
        }),
      });
    }

    return {
      dialect: 'sqlite3',
      tables: introspectedTables,
    };
  } finally {
    database.close();
  }
}

export async function introspectPostgresDatabase(
  options: IntrospectPostgresDatabaseOptions,
): Promise<DatabaseIntrospection> {
  const runtime = await resolvePostgresCodegenRuntime(options);
  const schemaName = options.schema ?? 'public';

  try {
    const includeTables = options.includeTables ? new Set(options.includeTables) : undefined;
    const excludeTables = new Set(options.excludeTables ?? []);
    const tableResult = await runtime.query(
      `select table_name as name
         from information_schema.tables
        where table_schema = $1
          and table_type = 'BASE TABLE'
        order by table_name`,
      [schemaName],
    );
    const tableNames = tableResult.rows
      .map((row, index) => asString(row.name, `PostgreSQL table row ${index + 1}.name`))
      .filter((tableName) => {
        if (includeTables && !includeTables.has(tableName)) {
          return false;
        }

        return !excludeTables.has(tableName);
      });
    const selectedTables = new Set(tableNames);
    const columnResult = await runtime.query(
      `select
         columns.table_name as "tableName",
         columns.column_name as "name",
         columns.data_type as "dataType",
         columns.udt_name as "udtName",
         columns.is_nullable as "isNullable",
         columns.column_default as "defaultValue",
         case when primary_keys.column_name is null then false else true end as "isPrimary"
       from information_schema.columns as columns
       left join (
         select
           key_usage.table_schema,
           key_usage.table_name,
           key_usage.column_name
         from information_schema.table_constraints as constraints
         inner join information_schema.key_column_usage as key_usage
            on constraints.constraint_name = key_usage.constraint_name
           and constraints.table_schema = key_usage.table_schema
           and constraints.table_name = key_usage.table_name
        where constraints.constraint_type = 'PRIMARY KEY'
       ) as primary_keys
          on primary_keys.table_schema = columns.table_schema
         and primary_keys.table_name = columns.table_name
         and primary_keys.column_name = columns.column_name
      where columns.table_schema = $1
      order by columns.table_name, columns.ordinal_position`,
      [schemaName],
    );
    const columnsByTable = new Map<string, IntrospectedColumn[]>();

    for (const row of columnResult.rows) {
      const tableName = asString(row.tableName, 'PostgreSQL column row.tableName');

      if (!selectedTables.has(tableName)) {
        continue;
      }

      const columns = columnsByTable.get(tableName) ?? [];
      const dataType = asString(row.dataType, `PostgreSQL column ${tableName}.dataType`);
      const udtName = asNullableString(row.udtName);
      const resolvedType =
        dataType === 'USER-DEFINED' || dataType === 'ARRAY'
          ? udtName ?? dataType
          : dataType;
      const column: {
        name: string;
        type: string;
        nullable: boolean;
        primary: boolean;
        defaultValue?: string;
      } = {
        name: asString(row.name, `PostgreSQL column ${tableName}.name`),
        type: resolvedType,
        nullable: asString(row.isNullable, `PostgreSQL column ${tableName}.isNullable`) === 'YES',
        primary: asBoolean(row.isPrimary),
      };

      if (typeof row.defaultValue === 'string') {
        column.defaultValue = row.defaultValue;
      }

      columns.push(column);
      columnsByTable.set(tableName, columns);
    }

    return {
      dialect: 'postgres',
      tables: tableNames.map((tableName) => ({
        name: tableName,
        columns: columnsByTable.get(tableName) ?? [],
      })),
    };
  } finally {
    await runtime.close();
  }
}

export async function introspectMySqlDatabase(
  options: IntrospectMySqlDatabaseOptions,
): Promise<DatabaseIntrospection> {
  const runtime = await resolveMySqlCodegenRuntime(options);

  try {
    const includeTables = options.includeTables ? new Set(options.includeTables) : undefined;
    const excludeTables = new Set(options.excludeTables ?? []);
    let databaseName = options.databaseName;

    if (!databaseName) {
      const databaseRows = normalizeMySqlQueryRows(
        await runtime.query('select database() as name'),
      );
      databaseName = asString(databaseRows[0]?.name, 'MySQL current database name');
    }

    const tableRows = normalizeMySqlQueryRows(
      await runtime.query(
        `select table_name as name
           from information_schema.tables
          where table_schema = ?
            and table_type = 'BASE TABLE'
          order by table_name`,
        [databaseName],
      ),
    );
    const tableNames = tableRows
      .map((row, index) => asString(row.name, `MySQL table row ${index + 1}.name`))
      .filter((tableName) => {
        if (includeTables && !includeTables.has(tableName)) {
          return false;
        }

        return !excludeTables.has(tableName);
      });
    const selectedTables = new Set(tableNames);
    const columnRows = normalizeMySqlQueryRows(
      await runtime.query(
        `select
           table_name as tableName,
           column_name as name,
           column_type as columnType,
           is_nullable as isNullable,
           column_key as columnKey,
           column_default as defaultValue
         from information_schema.columns
        where table_schema = ?
        order by table_name, ordinal_position`,
        [databaseName],
      ),
    );
    const columnsByTable = new Map<string, IntrospectedColumn[]>();

    for (const row of columnRows) {
      const tableName = asString(row.tableName, 'MySQL column row.tableName');

      if (!selectedTables.has(tableName)) {
        continue;
      }

      const columns = columnsByTable.get(tableName) ?? [];
      const column: {
        name: string;
        type: string;
        nullable: boolean;
        primary: boolean;
        defaultValue?: string;
      } = {
        name: asString(row.name, `MySQL column ${tableName}.name`),
        type: asString(row.columnType, `MySQL column ${tableName}.columnType`),
        nullable: asString(row.isNullable, `MySQL column ${tableName}.isNullable`) === 'YES',
        primary: asString(row.columnKey, `MySQL column ${tableName}.columnKey`) === 'PRI',
      };

      if (typeof row.defaultValue === 'string') {
        column.defaultValue = row.defaultValue;
      }

      columns.push(column);
      columnsByTable.set(tableName, columns);
    }

    return {
      dialect: 'mysql',
      tables: tableNames.map((tableName) => ({
        name: tableName,
        columns: columnsByTable.get(tableName) ?? [],
      })),
    };
  } finally {
    await runtime.close();
  }
}

export async function writeIntrospectionFile(
  introspection: DatabaseIntrospection,
  filePath: string,
  cwd = process.cwd(),
): Promise<void> {
  const targetPath = path.resolve(cwd, filePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(introspection, null, 2).concat('\n'), 'utf8');
}

export function createSqliteStarterTemplate(
  options: SqliteStarterTemplateOptions = {},
): TemplateGenerator<SqliteStarterTemplateOptions> {
  const outDir = options.outDir ?? 'templates/sqlite-starter';
  const packageName = options.packageName ?? inferPackageName(outDir, 'objx-sqlite-starter');

  return defineTemplate({
    name: 'sqlite-starter',
    async generate() {
      return [
        {
          path: path.posix.join(outDir, 'package.json'),
          contents: JSON.stringify(
            {
              name: packageName,
              private: true,
              type: 'module',
              scripts: {
                dev: 'node src/app.mjs',
              },
              dependencies: {
                '@objx/core': '0.1.0',
                '@objx/sql-engine': '0.1.0',
                '@objx/plugins': '0.1.0',
                '@objx/sqlite-driver': '0.1.0',
              },
            },
            null,
            2,
          ).concat('\n'),
        },
        {
          path: path.posix.join(outDir, 'README.md'),
          contents: `# ${packageName}

Starter SQLite service for OBJX.

## Files

- \`schema.sql\`: bootstrap schema
- \`src/models.mjs\`: OBJX model definitions
- \`src/app.mjs\`: sample read/write flow with tenant scope and soft delete using \`@objx/sqlite-driver\`

## Run

1. Apply \`schema.sql\` to a SQLite database file.
2. Install OBJX packages.
3. Run \`npm run dev\`.
`,
        },
        {
          path: path.posix.join(outDir, 'schema.sql'),
          contents: `create table if not exists projects (
  id integer primary key,
  name text not null,
  tenantId text not null,
  deletedAt text
);
`,
        },
        {
          path: path.posix.join(outDir, 'src/models.mjs'),
          contents: `import { col, defineModel } from '@objx/core';
import { createSoftDeletePlugin, createTenantScopePlugin } from '@objx/plugins';

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
  ],
});
`,
        },
        {
          path: path.posix.join(outDir, 'src/app.mjs'),
          contents: `import { createExecutionContextManager } from '@objx/core';
import { createSqliteSession } from '@objx/sqlite-driver';
import { Project } from './models.mjs';

const executionContextManager = createExecutionContextManager();
const session = createSqliteSession({
  databasePath: './app.sqlite',
  executionContextManager,
});

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  async () => {
    await session.execute(
      Project.insert({
        name: 'OBJX Alpha',
      }),
    );

    const rows = await session.execute(Project.query(), {
      hydrate: true,
    });

    console.log(rows);
  },
);
`,
        },
      ];
    },
  });
}

export function createPostgresStarterTemplate(
  options: PostgresStarterTemplateOptions = {},
): TemplateGenerator<PostgresStarterTemplateOptions> {
  const outDir = options.outDir ?? 'templates/postgres-starter';
  const packageName = options.packageName ?? inferPackageName(outDir, 'objx-postgres-starter');

  return defineTemplate({
    name: 'postgres-starter',
    async generate() {
      return [
        {
          path: path.posix.join(outDir, 'package.json'),
          contents: JSON.stringify(
            {
              name: packageName,
              private: true,
              type: 'module',
              scripts: {
                dev: 'node src/app.mjs',
              },
              dependencies: {
                '@objx/core': '0.1.0',
                '@objx/sql-engine': '0.1.0',
                '@objx/plugins': '0.1.0',
                '@objx/postgres-driver': '0.1.0',
                pg: '^8.0.0',
              },
            },
            null,
            2,
          ).concat('\n'),
        },
        {
          path: path.posix.join(outDir, 'README.md'),
          contents: `# ${packageName}

Starter PostgreSQL service for OBJX.

## Files

- \`schema.sql\`: bootstrap schema
- \`src/models.mjs\`: OBJX model definitions
- \`src/app.mjs\`: sample read/write flow with tenant scope and soft delete using \`@objx/postgres-driver\`

## Run

1. Apply \`schema.sql\` to a PostgreSQL database.
2. Install dependencies.
3. Set \`DATABASE_URL\` or use the default local connection string.
4. Run \`npm run dev\`.
`,
        },
        {
          path: path.posix.join(outDir, 'schema.sql'),
          contents: `create table if not exists projects (
  id integer generated always as identity primary key,
  name text not null,
  tenantId text not null,
  deletedAt timestamptz
);
`,
        },
        {
          path: path.posix.join(outDir, 'src/models.mjs'),
          contents: `import { col, defineModel } from '@objx/core';
import { createSoftDeletePlugin, createTenantScopePlugin } from '@objx/plugins';

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
  ],
});
`,
        },
        {
          path: path.posix.join(outDir, 'src/app.mjs'),
          contents: `import { Pool } from 'pg';
import { createExecutionContextManager } from '@objx/core';
import { createPostgresSession } from '@objx/postgres-driver';
import { Project } from './models.mjs';

const executionContextManager = createExecutionContextManager();
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/objx_app',
});
const session = createPostgresSession({
  pool,
  executionContextManager,
});

try {
  await executionContextManager.run(
    {
      values: {
        tenantId: 'tenant_a',
      },
    },
    async () => {
      await session.execute(
        Project.insert({
          name: 'OBJX Alpha',
        }),
      );

      const rows = await session.execute(Project.query(), {
        hydrate: true,
      });

      console.log(rows);
    },
  );
} finally {
  await pool.end();
}
`,
        },
      ];
    },
  });
}

export function createMySqlStarterTemplate(
  options: MySqlStarterTemplateOptions = {},
): TemplateGenerator<MySqlStarterTemplateOptions> {
  const outDir = options.outDir ?? 'templates/mysql-starter';
  const packageName = options.packageName ?? inferPackageName(outDir, 'objx-mysql-starter');

  return defineTemplate({
    name: 'mysql-starter',
    async generate() {
      return [
        {
          path: path.posix.join(outDir, 'package.json'),
          contents: JSON.stringify(
            {
              name: packageName,
              private: true,
              type: 'module',
              scripts: {
                dev: 'node src/app.mjs',
              },
              dependencies: {
                '@objx/core': '0.1.0',
                '@objx/sql-engine': '0.1.0',
                '@objx/plugins': '0.1.0',
                '@objx/mysql-driver': '0.1.0',
                mysql2: '^3.0.0',
              },
            },
            null,
            2,
          ).concat('\n'),
        },
        {
          path: path.posix.join(outDir, 'README.md'),
          contents: `# ${packageName}

Starter MySQL service for OBJX.

## Files

- \`schema.sql\`: bootstrap schema
- \`src/models.mjs\`: OBJX model definitions
- \`src/app.mjs\`: sample read/write flow with tenant scope and soft delete using \`@objx/mysql-driver\`

## Run

1. Apply \`schema.sql\` to a MySQL database.
2. Install dependencies.
3. Set \`DATABASE_URL\` or use the default local connection string.
4. Run \`npm run dev\`.
`,
        },
        {
          path: path.posix.join(outDir, 'schema.sql'),
          contents: `create table if not exists projects (
  id integer not null auto_increment primary key,
  name varchar(255) not null,
  tenantId varchar(255) not null,
  deletedAt datetime(3) null
);
`,
        },
        {
          path: path.posix.join(outDir, 'src/models.mjs'),
          contents: `import { col, defineModel } from '@objx/core';
import { createSoftDeletePlugin, createTenantScopePlugin } from '@objx/plugins';

export const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
  ],
});
`,
        },
        {
          path: path.posix.join(outDir, 'src/app.mjs'),
          contents: `import mysql from 'mysql2/promise';
import { createExecutionContextManager } from '@objx/core';
import { createMySqlSession } from '@objx/mysql-driver';
import { Project } from './models.mjs';

const executionContextManager = createExecutionContextManager();
const pool = mysql.createPool(
  process.env.DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/objx_app',
);
const session = createMySqlSession({
  pool,
  executionContextManager,
});

try {
  await executionContextManager.run(
    {
      values: {
        tenantId: 'tenant_a',
      },
    },
    async () => {
      await session.execute(
        Project.insert({
          name: 'OBJX Alpha',
        }),
      );

      const rows = await session.execute(Project.query(), {
        hydrate: true,
      });

      console.log(rows);
    },
  );
} finally {
  await pool.end();
}
`,
        },
      ];
    },
  });
}

export function createMigrationSeedSchemasTemplate(
  options: MigrationSeedSchemaTemplateOptions = {},
): TemplateGenerator<MigrationSeedSchemaTemplateOptions> {
  const outDir = options.outDir ?? 'db';
  const dialect = options.dialect ?? 'sqlite3';
  const databaseExample =
    dialect === 'postgres'
      ? 'postgresql://postgres:postgres@127.0.0.1:5432/objx_app'
      : dialect === 'mysql'
        ? 'mysql://root:root@127.0.0.1:3306/objx_app'
        : './app.sqlite';
  const migrationSql =
    dialect === 'postgres'
      ? `create table if not exists projects (
      id integer generated always as identity primary key,
      name text not null,
      tenantId text not null
    );`
      : dialect === 'mysql'
        ? `create table if not exists projects (
      id integer not null auto_increment primary key,
      name varchar(255) not null,
      tenantId varchar(255) not null
    );`
        : `create table if not exists projects (
      id integer primary key,
      name text not null,
      tenantId text not null
    );`;
  const seedSql =
    dialect === 'sqlite3'
      ? `insert into projects (id, name, tenantId)
     values (1, 'OBJX Alpha', 'tenant_a');`
      : `insert into projects (name, tenantId)
     values ('OBJX Alpha', 'tenant_a');`;
  const revertSql =
    dialect === 'sqlite3'
      ? "delete from projects where id = 1;"
      : "delete from projects where name = 'OBJX Alpha' and tenantId = 'tenant_a';";

  return defineTemplate({
    name: 'migration-seed-schemas',
    async generate() {
      return [
        {
          path: path.posix.join(outDir, 'README.md'),
          contents: `# Database Schemas

This folder contains typed OBJX migration and seed schemas.

## Conventions

- migrations: \`migrations/*.migration.mjs\`
- seeds: \`seeds/*.seed.mjs\`

## Exports Used

- \`defineMigration\`
- \`defineSeed\`
- \`runMigrationSchema\`
- \`runSeedSchema\`

## CLI

- apply migrations: \`npm run codegen -- migrate --dialect ${dialect} --database ${databaseExample} --dir ./db/migrations --direction up\`
- revert migrations: \`npm run codegen -- migrate --dialect ${dialect} --database ${databaseExample} --dir ./db/migrations --direction down\`
- run seeds: \`npm run codegen -- seed --dialect ${dialect} --database ${databaseExample} --dir ./db/seeds --direction run\`
- revert seeds: \`npm run codegen -- seed --dialect ${dialect} --database ${databaseExample} --dir ./db/seeds --direction revert\`
`,
        },
        {
          path: path.posix.join(outDir, 'migrations', '000001_init.migration.mjs'),
          contents: `import { defineMigration } from '@objx/codegen';

export default defineMigration({
  name: '000001_init',
  description: 'bootstrap tables',
  up: [
    \`${migrationSql}\`,
  ],
  down: [
    'drop table if exists projects;',
  ],
});
`,
        },
        {
          path: path.posix.join(outDir, 'seeds', '000001_projects.seed.mjs'),
          contents: `import { defineSeed } from '@objx/codegen';

export default defineSeed({
  name: '000001_projects',
  description: 'seed initial projects',
  run: [
    \`${seedSql}\`,
  ],
  revert: [
    "${revertSql}",
  ],
});
`,
        },
      ];
    },
  });
}

export function parseCodegenCliArgs(argv: readonly string[]): CodegenCliOptions {
  if (
    argv[0] !== 'generate' &&
    argv[0] !== 'introspect' &&
    argv[0] !== 'template' &&
    argv[0] !== 'migrate' &&
    argv[0] !== 'seed'
  ) {
    throw new Error(
      'Unsupported codegen command. Use "generate", "introspect", "template", "migrate" or "seed".',
    );
  }

  if (argv[0] === 'generate') {
    let inputPath = '';
    let outDir = 'generated/models';

    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      const next = argv[index + 1];

      if ((argument === '--input' || argument === '-i') && next) {
        inputPath = next;
        index += 1;
        continue;
      }

      if ((argument === '--out' || argument === '-o') && next) {
        outDir = next;
        index += 1;
        continue;
      }
    }

    if (!inputPath) {
      throw new Error('Missing required argument "--input <path>".');
    }

    return {
      command: 'generate',
      inputPath,
      outDir,
    };
  }

  if (argv[0] === 'template') {
    let templateName = '';
    let outDir = 'templates/sqlite-starter';
    let packageName = '';
    let dialect = '';

    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      const next = argv[index + 1];

      if (argument === '--template' && next) {
        templateName = next;
        index += 1;
        continue;
      }

      if ((argument === '--out' || argument === '-o') && next) {
        outDir = next;
        index += 1;
        continue;
      }

      if (argument === '--package-name' && next) {
        packageName = next;
        index += 1;
        continue;
      }

      if (argument === '--dialect' && next) {
        dialect = next;
        index += 1;
      }
    }

    if (
      templateName !== 'sqlite-starter' &&
      templateName !== 'postgres-starter' &&
      templateName !== 'mysql-starter' &&
      templateName !== 'migration-seed-schemas'
    ) {
      throw new Error(
        'Unsupported template. Use "--template sqlite-starter", "--template postgres-starter", "--template mysql-starter" or "--template migration-seed-schemas".',
      );
    }

    const options: {
      command: 'template';
      templateName: TemplateName;
      outDir: string;
      packageName?: string;
      dialect?: CodegenDialect;
    } = {
      command: 'template',
      templateName,
      outDir,
    };

    if (packageName) {
      options.packageName = packageName;
    }

    if (templateName === 'migration-seed-schemas') {
      options.dialect = dialect ? normalizeCodegenDialect(dialect) : 'sqlite3';
    }

    return options;
  }

  if (argv[0] === 'migrate' || argv[0] === 'seed') {
    let dialect = '';
    let databasePath = '';
    let directoryPath = argv[0] === 'migrate' ? 'db/migrations' : 'db/seeds';
    let direction: MigrationDirection | SeedDirection = argv[0] === 'migrate' ? 'up' : 'run';
    let steps: number | undefined;

    for (let index = 1; index < argv.length; index += 1) {
      const argument = argv[index];
      const next = argv[index + 1];

      if (argument === '--dialect' && next) {
        dialect = next;
        index += 1;
        continue;
      }

      if ((argument === '--database' || argument === '-d') && next) {
        databasePath = next;
        index += 1;
        continue;
      }

      if ((argument === '--dir' || argument === '--directory') && next) {
        directoryPath = next;
        index += 1;
        continue;
      }

      if (argument === '--direction' && next) {
        direction = next as MigrationDirection | SeedDirection;
        index += 1;
        continue;
      }

      if (argument === '--steps' && next) {
        steps = parsePositiveInteger(next, '--steps');
        index += 1;
      }
    }

    if (!databasePath) {
      throw new Error('Missing required argument "--database <path>".');
    }

    if (argv[0] === 'migrate') {
      if (direction !== 'up' && direction !== 'down') {
        throw new Error('Migration direction must be "--direction up" or "--direction down".');
      }

      return {
        command: 'migrate',
        dialect: requireCodegenDialect(dialect),
        databasePath,
        directoryPath,
        direction,
        ...(steps !== undefined ? { steps } : {}),
      };
    }

    if (direction !== 'run' && direction !== 'revert') {
      throw new Error('Seed direction must be "--direction run" or "--direction revert".');
    }

    return {
      command: 'seed',
      dialect: requireCodegenDialect(dialect),
      databasePath,
      directoryPath,
      direction,
      ...(steps !== undefined ? { steps } : {}),
    };
  }

  let dialect = '';
  let databasePath = '';
  let outPath = 'generated/introspection.json';

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === '--dialect' && next) {
      dialect = next;
      index += 1;
      continue;
    }

    if ((argument === '--database' || argument === '-d') && next) {
      databasePath = next;
      index += 1;
      continue;
    }

    if ((argument === '--out' || argument === '-o') && next) {
      outPath = next;
      index += 1;
      continue;
    }
  }

  if (!databasePath) {
    throw new Error('Missing required argument "--database <path>".');
  }

  return {
    command: 'introspect',
    dialect: requireCodegenDialect(dialect),
    databasePath,
    outPath,
  };
}

export async function runCodegenCli(
  argv: readonly string[],
  environment: CodegenCliEnvironment = {},
): Promise<number> {
  const stdout = environment.stdout ?? (() => undefined);
  const stderr = environment.stderr ?? (() => undefined);
  const cwd = environment.cwd ?? process.cwd();

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    stdout('Usage: objx-codegen generate --input <introspection.json> --out <dir>');
    stdout('       objx-codegen introspect --dialect <sqlite3|postgres|mysql> --database <target> --out <schema.json>');
    stdout('       objx-codegen template --template <sqlite-starter|postgres-starter|mysql-starter> --out <dir>');
    stdout('       objx-codegen template --template migration-seed-schemas --dialect <sqlite3|postgres|mysql> --out <dir>');
    stdout('       objx-codegen migrate --dialect <sqlite3|postgres|mysql> --database <target> --dir <migrations-dir> [--direction up|down] [--steps n]');
    stdout('       objx-codegen seed --dialect <sqlite3|postgres|mysql> --database <target> --dir <seeds-dir> [--direction run|revert] [--steps n]');
    return 0;
  }

  try {
    const options = parseCodegenCliArgs(argv);

    if (options.command === 'generate') {
      const introspectionPath = path.resolve(cwd, options.inputPath);
      const introspection = JSON.parse(
        await readFile(introspectionPath, 'utf8'),
      ) as DatabaseIntrospection;
      const generator = createObjxModelGenerator({
        outDir: options.outDir,
      });
      const files = await generator.generate(introspection, {
        outDir: options.outDir,
      });

      await writeGeneratedFiles(files, cwd);
      stdout(`Generated ${files.length} files into ${options.outDir}.`);
      return 0;
    }

    if (options.command === 'template') {
      const templateOptions: {
        outDir: string;
        packageName?: string;
        dialect?: CodegenDialect;
      } = {
        outDir: options.outDir,
      };

      if (options.packageName) {
        templateOptions.packageName = options.packageName;
      }

      if (options.dialect) {
        templateOptions.dialect = options.dialect;
      }

      const template =
        options.templateName === 'migration-seed-schemas'
          ? createMigrationSeedSchemasTemplate({
              outDir: options.outDir,
              ...(options.dialect ? { dialect: options.dialect } : {}),
            })
          : options.templateName === 'postgres-starter'
            ? createPostgresStarterTemplate(templateOptions)
            : options.templateName === 'mysql-starter'
              ? createMySqlStarterTemplate(templateOptions)
              : createSqliteStarterTemplate(templateOptions);
      const files = await template.generate(templateOptions);
      await writeGeneratedFiles(files, cwd);
      stdout(`Generated template "${template.name}" into ${options.outDir}.`);
      return 0;
    }

    if (options.command === 'migrate') {
      const result =
        options.dialect === 'postgres'
          ? await runPostgresMigrations({
              connectionString: options.databasePath,
              directoryPath: path.resolve(cwd, options.directoryPath),
              direction: options.direction,
              ...(options.steps !== undefined ? { steps: options.steps } : {}),
              ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
            })
          : options.dialect === 'mysql'
            ? await runMySqlMigrations({
                connectionString: options.databasePath,
                directoryPath: path.resolve(cwd, options.directoryPath),
                direction: options.direction,
                ...(options.steps !== undefined ? { steps: options.steps } : {}),
                ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
              })
            : await runSqliteMigrations({
                databasePath: path.resolve(cwd, options.databasePath),
                directoryPath: path.resolve(cwd, options.directoryPath),
                direction: options.direction,
                ...(options.steps !== undefined ? { steps: options.steps } : {}),
              });

      stdout(
        `Migrations ${result.direction}: executed ${result.executed.length} of ${result.totalCandidates}.`,
      );

      if (result.executed.length > 0) {
        stdout(`Executed migrations: ${result.executed.join(', ')}`);
      }

      return 0;
    }

    if (options.command === 'seed') {
      const result =
        options.dialect === 'postgres'
          ? await runPostgresSeeds({
              connectionString: options.databasePath,
              directoryPath: path.resolve(cwd, options.directoryPath),
              direction: options.direction,
              ...(options.steps !== undefined ? { steps: options.steps } : {}),
              ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
            })
          : options.dialect === 'mysql'
            ? await runMySqlSeeds({
                connectionString: options.databasePath,
                directoryPath: path.resolve(cwd, options.directoryPath),
                direction: options.direction,
                ...(options.steps !== undefined ? { steps: options.steps } : {}),
                ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
              })
            : await runSqliteSeeds({
                databasePath: path.resolve(cwd, options.databasePath),
                directoryPath: path.resolve(cwd, options.directoryPath),
                direction: options.direction,
                ...(options.steps !== undefined ? { steps: options.steps } : {}),
              });

      stdout(
        `Seeds ${result.direction}: executed ${result.executed.length} of ${result.totalCandidates}.`,
      );

      if (result.executed.length > 0) {
        stdout(`Executed seeds: ${result.executed.join(', ')}`);
      }

      return 0;
    }

    const introspection =
      options.dialect === 'postgres'
        ? await introspectPostgresDatabase({
            connectionString: options.databasePath,
            ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
          })
        : options.dialect === 'mysql'
          ? await introspectMySqlDatabase({
              connectionString: options.databasePath,
              ...(environment.moduleLoader ? { moduleLoader: environment.moduleLoader } : {}),
            })
          : await introspectSqliteDatabase({
              databasePath: path.resolve(cwd, options.databasePath),
            });
    await writeIntrospectionFile(introspection, options.outPath, cwd);
    stdout(`Introspected ${introspection.tables.length} tables into ${options.outPath}.`);
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

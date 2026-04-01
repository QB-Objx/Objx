import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

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
  stdout?(message: string): void;
  stderr?(message: string): void;
}

export interface GenerateCliOptions {
  readonly command: 'generate';
  readonly inputPath: string;
  readonly outDir: string;
}

export interface IntrospectCliOptions {
  readonly command: 'introspect';
  readonly dialect: 'sqlite3';
  readonly databasePath: string;
  readonly outPath: string;
}

export interface TemplateCliOptions {
  readonly command: 'template';
  readonly templateName: 'sqlite-starter' | 'migration-seed-schemas';
  readonly outDir: string;
  readonly packageName?: string;
}

export interface MigrateCliOptions {
  readonly command: 'migrate';
  readonly dialect: 'sqlite3';
  readonly databasePath: string;
  readonly directoryPath: string;
  readonly direction: MigrationDirection;
  readonly steps?: number;
}

export interface SeedCliOptions {
  readonly command: 'seed';
  readonly dialect: 'sqlite3';
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

export interface SqliteStarterTemplateOptions {
  readonly outDir?: string;
  readonly packageName?: string;
}

export interface MigrationSeedSchemaTemplateOptions {
  readonly outDir?: string;
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

function normalizeSqliteDialect(value: string): 'sqlite3' {
  if (value === 'sqlite' || value === 'sqlite3' || value === 'better-sqlite3') {
    return 'sqlite3';
  }

  throw new Error('Schema runner currently supports only "--dialect sqlite3".');
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

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('');
}

function inferPackageName(outDir: string): string {
  const normalized = outDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = normalized.split('/').filter(Boolean).at(-1);
  return base && base !== '.' ? base : 'objx-sqlite-starter';
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
  const packageName = options.packageName ?? inferPackageName(outDir);

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

export function createMigrationSeedSchemasTemplate(
  options: MigrationSeedSchemaTemplateOptions = {},
): TemplateGenerator<MigrationSeedSchemaTemplateOptions> {
  const outDir = options.outDir ?? 'db';

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

- apply migrations: \`npm run codegen -- migrate --dialect sqlite3 --database ./app.sqlite --dir ./db/migrations --direction up\`
- revert migrations: \`npm run codegen -- migrate --dialect sqlite3 --database ./app.sqlite --dir ./db/migrations --direction down\`
- run seeds: \`npm run codegen -- seed --dialect sqlite3 --database ./app.sqlite --dir ./db/seeds --direction run\`
- revert seeds: \`npm run codegen -- seed --dialect sqlite3 --database ./app.sqlite --dir ./db/seeds --direction revert\`
`,
        },
        {
          path: path.posix.join(outDir, 'migrations', '000001_init.migration.mjs'),
          contents: `import { defineMigration } from '@objx/codegen';

export default defineMigration({
  name: '000001_init',
  description: 'bootstrap tables',
  up: [
    \`create table if not exists projects (
      id integer primary key,
      name text not null,
      tenantId text not null
    );\`,
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
    \`insert into projects (id, name, tenantId)
     values (1, 'OBJX Alpha', 'tenant_a');\`,
  ],
  revert: [
    "delete from projects where id = 1;",
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
      }
    }

    if (templateName !== 'sqlite-starter' && templateName !== 'migration-seed-schemas') {
      throw new Error(
        'Unsupported template. Use "--template sqlite-starter" or "--template migration-seed-schemas".',
      );
    }

    const options: {
      command: 'template';
      templateName: 'sqlite-starter' | 'migration-seed-schemas';
      outDir: string;
      packageName?: string;
    } = {
      command: 'template',
      templateName,
      outDir,
    };

    if (packageName) {
      options.packageName = packageName;
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
        dialect: normalizeSqliteDialect(dialect),
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
      dialect: normalizeSqliteDialect(dialect),
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

  if (dialect !== 'sqlite' && dialect !== 'sqlite3' && dialect !== 'better-sqlite3') {
    throw new Error('Introspection currently supports only "--dialect sqlite3".');
  }

  if (!databasePath) {
    throw new Error('Missing required argument "--database <path>".');
  }

  return {
    command: 'introspect',
    dialect: 'sqlite3',
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
    stdout('       objx-codegen introspect --dialect sqlite3 --database <file> --out <schema.json>');
    stdout('       objx-codegen template --template sqlite-starter --out <dir>');
    stdout('       objx-codegen template --template migration-seed-schemas --out <dir>');
    stdout('       objx-codegen migrate --dialect sqlite3 --database <file> --dir <migrations-dir> [--direction up|down] [--steps n]');
    stdout('       objx-codegen seed --dialect sqlite3 --database <file> --dir <seeds-dir> [--direction run|revert] [--steps n]');
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
      if (options.templateName === 'migration-seed-schemas') {
        const template = createMigrationSeedSchemasTemplate({
          outDir: options.outDir,
        });
        const files = await template.generate({
          outDir: options.outDir,
        });
        await writeGeneratedFiles(files, cwd);
        stdout(`Generated template "${template.name}" into ${options.outDir}.`);
        return 0;
      }

      const templateOptions: {
        outDir: string;
        packageName?: string;
      } = {
        outDir: options.outDir,
      };

      if (options.packageName) {
        templateOptions.packageName = options.packageName;
      }

      const template = createSqliteStarterTemplate(templateOptions);
      const files = await template.generate(templateOptions);
      await writeGeneratedFiles(files, cwd);
      stdout(`Generated template "${template.name}" into ${options.outDir}.`);
      return 0;
    }

    if (options.command === 'migrate') {
      const result = await runSqliteMigrations({
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
      const result = await runSqliteSeeds({
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

    const introspection = await introspectSqliteDatabase({
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

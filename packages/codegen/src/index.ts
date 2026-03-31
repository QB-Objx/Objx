import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
  readonly templateName: 'sqlite-starter';
  readonly outDir: string;
  readonly packageName?: string;
}

export type CodegenCliOptions = GenerateCliOptions | IntrospectCliOptions | TemplateCliOptions;

export interface IntrospectSqliteDatabaseOptions {
  readonly databasePath: string;
  readonly includeTables?: readonly string[];
  readonly excludeTables?: readonly string[];
}

export interface SqliteStarterTemplateOptions {
  readonly outDir?: string;
  readonly packageName?: string;
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

export function parseCodegenCliArgs(argv: readonly string[]): CodegenCliOptions {
  if (argv[0] !== 'generate' && argv[0] !== 'introspect' && argv[0] !== 'template') {
    throw new Error('Unsupported codegen command. Use "generate", "introspect" or "template".');
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

    if (templateName !== 'sqlite-starter') {
      throw new Error('Unsupported template. Use "--template sqlite-starter".');
    }

    const options: {
      command: 'template';
      templateName: 'sqlite-starter';
      outDir: string;
      packageName?: string;
    } = {
      command: 'template',
      templateName: 'sqlite-starter',
      outDir,
    };

    if (packageName) {
      options.packageName = packageName;
    }

    return options;
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

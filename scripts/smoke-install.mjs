import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const workspacePackages = new Map([
  ['@objx/core', path.join(rootDir, 'packages', 'core')],
  ['@objx/sql-engine', path.join(rootDir, 'packages', 'sql-engine')],
  ['@objx/plugins', path.join(rootDir, 'packages', 'plugins')],
  ['@objx/validation', path.join(rootDir, 'packages', 'validation')],
  ['@objx/codegen', path.join(rootDir, 'packages', 'codegen')],
  ['@objx/sqlite-driver', path.join(rootDir, 'packages', 'sqlite-driver')],
  ['@objx/postgres-driver', path.join(rootDir, 'packages', 'postgres-driver')],
  ['@objx/mysql-driver', path.join(rootDir, 'packages', 'mysql-driver')],
]);

async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n${stdout}${stderr}`,
      { cause: error },
    );
  }
}

function serializePackageJson(packageJson) {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

async function packWorkspacePackage(packageName, packageDir, packDirectory) {
  const { stdout } = await runCommand(
    npmCommand,
    ['pack', '--json', '--pack-destination', packDirectory],
    {
      cwd: packageDir,
    },
  );
  const result = JSON.parse(stdout);
  const filename = result[0]?.filename;

  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error(`Could not resolve tarball filename for package "${packageName}".`);
  }

  return path.join(packDirectory, filename);
}

async function installDependencies(workingDirectory, dependencies, options = {}) {
  if (dependencies.length === 0) {
    return;
  }

  const args = ['install', '--no-audit', '--no-fund', '--no-package-lock'];

  if (options.dev === true) {
    args.push('--save-dev');
  }

  args.push(...dependencies);

  await runCommand(npmCommand, args, {
    cwd: workingDirectory,
  });
}

async function createConsumerProject(baseDirectory, name) {
  const workingDirectory = path.join(baseDirectory, name);
  await mkdir(workingDirectory, { recursive: true });
  await writeFile(
    path.join(workingDirectory, 'package.json'),
    serializePackageJson({
      name,
      private: true,
      type: 'module',
    }),
  );
  return workingDirectory;
}

async function runSmokeScript(workingDirectory, filename, contents) {
  const filePath = path.join(workingDirectory, filename);
  await writeFile(filePath, contents);
  await runCommand(nodeCommand, [filePath], {
    cwd: workingDirectory,
  });
}

function createSqliteSmokeScript() {
  return `import {
  col,
  createExecutionContextManager,
  defineModel,
} from '@objx/core';
import { createTenantScopePlugin } from '@objx/plugins';
import { identifier, sql } from '@objx/sql-engine';
import { createSqliteSession } from '@objx/sqlite-driver';

const Project = defineModel({
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
  },
  plugins: [createTenantScopePlugin()],
});

const executionContextManager = createExecutionContextManager();
const session = createSqliteSession({
  databasePath: ':memory:',
  executionContextManager,
  hydrateByDefault: true,
});

const compiled = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () =>
    session.compile(
      Project.query().where(({ id }, op) => op.eq(id, 1)),
    ),
);

if (!compiled.sql.includes('projects')) {
  throw new Error('SQLite consumer did not compile a project query.');
}

if (!compiled.sql.toLowerCase().includes('tenantid')) {
  throw new Error('SQLite consumer did not apply tenant scope during compile.');
}

await session.transaction(async (transactionSession) => {
  const result = await transactionSession.execute(
    sql\`select 1 as \${identifier('value')}\`,
  );

  if (Number(result.rows[0]?.value ?? 0) !== 1) {
    throw new Error('SQLite consumer did not execute raw SQL inside a transaction.');
  }
});
`;
}

function createPostgresSmokeScript() {
  return `import pg from 'pg';
import {
  col,
  createExecutionContextManager,
  defineModel,
} from '@objx/core';
import { createTenantScopePlugin } from '@objx/plugins';
import { identifier, sql } from '@objx/sql-engine';
import { createPostgresSession } from '@objx/postgres-driver';

if (typeof pg.Pool !== 'function') {
  throw new Error('Expected pg to be installed for the Postgres consumer.');
}

const queries = [];

function createResult(sqlText) {
  const normalized = sqlText.trim().toLowerCase();

  if (normalized.startsWith('select')) {
    return {
      rows: [{ value: 1 }],
      rowCount: 1,
      command: 'SELECT',
    };
  }

  return {
    rows: [],
    rowCount: 1,
    command: 'OK',
  };
}

const client = {
  async query(sqlText) {
    queries.push(sqlText);
    return createResult(sqlText);
  },
  release() {},
};

const pool = {
  async query(sqlText) {
    queries.push(sqlText);
    return createResult(sqlText);
  },
  async connect() {
    return client;
  },
  async end() {},
};

const Project = defineModel({
  table: 'projects',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    name: col.text(),
  },
  plugins: [createTenantScopePlugin()],
});

const executionContextManager = createExecutionContextManager();
const session = createPostgresSession({
  pool,
  executionContextManager,
});

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  async () => {
    const compiled = session.compile(
      Project.query().where(({ id }, op) => op.eq(id, 1)),
    );

    if (!compiled.sql.toLowerCase().includes('tenantid')) {
      throw new Error('Postgres consumer did not apply tenant scope during compile.');
    }

    await session.transaction(async (transactionSession) => {
      await transactionSession.execute(
        sql\`select 1 as \${identifier('value')}\`,
      );

      try {
        await transactionSession.transaction(async (nestedSession) => {
          await nestedSession.execute(
            sql\`select 1 as \${identifier('value')}\`,
          );
          throw new Error('nested rollback');
        });
      } catch (error) {
        if (!(error instanceof Error) || error.cause?.message !== 'nested rollback') {
          throw error;
        }
      }
    });
  },
);

if (!queries.some((sqlText) => /^begin$/i.test(sqlText.trim()))) {
  throw new Error('Postgres consumer did not start a transaction.');
}

if (!queries.some((sqlText) => /^savepoint /i.test(sqlText.trim()))) {
  throw new Error('Postgres consumer did not create a savepoint for nested transactions.');
}
`;
}

function createMySqlSmokeScript() {
  return `import mysql from 'mysql2/promise';
import {
  col,
  createExecutionContextManager,
  defineModel,
} from '@objx/core';
import { createTenantScopePlugin } from '@objx/plugins';
import { identifier, sql } from '@objx/sql-engine';
import { createMySqlSession } from '@objx/mysql-driver';

if (typeof mysql.createPool !== 'function') {
  throw new Error('Expected mysql2/promise to be installed for the MySQL consumer.');
}

const queries = [];

function createResult(sqlText) {
  const normalized = sqlText.trim().toLowerCase();

  if (normalized.startsWith('select')) {
    return [[{ value: 1 }], []];
  }

  return [{ affectedRows: 1, insertId: 1 }, []];
}

const connection = {
  async query(sqlText) {
    queries.push(sqlText);
    return createResult(sqlText);
  },
  release() {},
};

const pool = {
  async query(sqlText) {
    queries.push(sqlText);
    return createResult(sqlText);
  },
  async getConnection() {
    return connection;
  },
  async end() {},
};

const Project = defineModel({
  table: 'projects',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    name: col.text(),
  },
  plugins: [createTenantScopePlugin()],
});

const executionContextManager = createExecutionContextManager();
const session = createMySqlSession({
  pool,
  executionContextManager,
});

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  async () => {
    const compiled = session.compile(
      Project.query().where(({ id }, op) => op.eq(id, 1)),
    );

    if (!compiled.sql.toLowerCase().includes('tenantid')) {
      throw new Error('MySQL consumer did not apply tenant scope during compile.');
    }

    await session.transaction(async (transactionSession) => {
      await transactionSession.execute(
        sql\`select 1 as \${identifier('value')}\`,
      );

      try {
        await transactionSession.transaction(async (nestedSession) => {
          await nestedSession.execute(
            sql\`select 1 as \${identifier('value')}\`,
          );
          throw new Error('nested rollback');
        });
      } catch (error) {
        if (!(error instanceof Error) || error.cause?.message !== 'nested rollback') {
          throw error;
        }
      }
    });
  },
);

if (!queries.some((sqlText) => /^start transaction$/i.test(sqlText.trim()))) {
  throw new Error('MySQL consumer did not start a transaction.');
}

if (!queries.some((sqlText) => /^savepoint /i.test(sqlText.trim()))) {
  throw new Error('MySQL consumer did not create a savepoint for nested transactions.');
}
`;
}

function createCodegenSmokeScript() {
  return `import {
  createMigrationSeedSchemasTemplate,
  createSqliteStarterTemplate,
  defineMigration,
  defineSeed,
} from '@objx/codegen';

const starterTemplate = createSqliteStarterTemplate({
  outDir: 'starter',
  packageName: 'objx-smoke-starter',
});
const starterFiles = await starterTemplate.generate({
  outDir: 'starter',
  packageName: 'objx-smoke-starter',
});

if (!starterFiles.some((file) => file.path.endsWith('src/app.mjs'))) {
  throw new Error('Codegen consumer did not generate the sqlite starter app.');
}

const schemaTemplate = createMigrationSeedSchemasTemplate({
  outDir: 'db',
});
const schemaFiles = await schemaTemplate.generate({
  outDir: 'db',
});

if (!schemaFiles.some((file) => file.path.endsWith('000001_init.migration.mjs'))) {
  throw new Error('Codegen consumer did not generate a migration template.');
}

if (!schemaFiles.some((file) => file.path.endsWith('000001_projects.seed.mjs'))) {
  throw new Error('Codegen consumer did not generate a seed template.');
}

const migration = defineMigration({
  name: '000001_init',
  up() {},
  down() {},
});

const seed = defineSeed({
  name: '000001_projects',
  run() {},
  revert() {},
});

if (migration.name !== '000001_init') {
  throw new Error('Codegen consumer did not keep migration metadata.');
}

if (seed.name !== '000001_projects') {
  throw new Error('Codegen consumer did not keep seed metadata.');
}
`;
}

async function main() {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'objx-smoke-'));

  try {
    const tarballDirectory = path.join(tempDirectory, 'tarballs');
    await mkdir(tarballDirectory, { recursive: true });

    const tarballs = new Map();

    for (const [packageName, packageDirectory] of workspacePackages.entries()) {
      const tarballPath = await packWorkspacePackage(
        packageName,
        packageDirectory,
        tarballDirectory,
      );
      tarballs.set(packageName, tarballPath);
    }

    const sqliteConsumer = await createConsumerProject(tempDirectory, 'sqlite-consumer');
    await installDependencies(sqliteConsumer, [
      tarballs.get('@objx/core'),
      tarballs.get('@objx/sql-engine'),
      tarballs.get('@objx/sqlite-driver'),
      tarballs.get('@objx/plugins'),
    ]);
    await runSmokeScript(sqliteConsumer, 'smoke.mjs', createSqliteSmokeScript());

    const postgresConsumer = await createConsumerProject(tempDirectory, 'postgres-consumer');
    await installDependencies(postgresConsumer, [
      tarballs.get('@objx/core'),
      tarballs.get('@objx/sql-engine'),
      tarballs.get('@objx/postgres-driver'),
      tarballs.get('@objx/plugins'),
      'pg',
    ]);
    await runSmokeScript(postgresConsumer, 'smoke.mjs', createPostgresSmokeScript());

    const mysqlConsumer = await createConsumerProject(tempDirectory, 'mysql-consumer');
    await installDependencies(mysqlConsumer, [
      tarballs.get('@objx/core'),
      tarballs.get('@objx/sql-engine'),
      tarballs.get('@objx/mysql-driver'),
      tarballs.get('@objx/plugins'),
      'mysql2',
    ]);
    await runSmokeScript(mysqlConsumer, 'smoke.mjs', createMySqlSmokeScript());

    const codegenConsumer = await createConsumerProject(tempDirectory, 'codegen-consumer');
    await installDependencies(codegenConsumer, [tarballs.get('@objx/codegen')], {
      dev: true,
    });
    await runSmokeScript(codegenConsumer, 'smoke.mjs', createCodegenSmokeScript());

    process.stdout.write('OBJX package smoke install checks passed.\n');
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

await main();

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createObjxModelGenerator,
  createMigrationSeedSchemasTemplate,
  createMySqlStarterTemplate,
  createPostgresStarterTemplate,
  introspectMySqlDatabase,
  introspectPostgresDatabase,
  parseCodegenCliArgs,
  runCodegenCli,
  runMySqlMigrations,
  runMySqlSeeds,
  runPostgresMigrations,
  runPostgresSeeds,
} from '@qbobjx/codegen';

class FakePostgresCodegenPoolClient {
  constructor(pool) {
    this.pool = pool;
    this.released = false;
  }

  async query(sqlText, parameters = []) {
    return this.pool.query(sqlText, parameters);
  }

  release() {
    if (this.released) {
      return;
    }

    this.released = true;
    this.pool.releaseCount += 1;
  }
}

class FakePostgresCodegenPool {
  constructor() {
    this.connectCount = 0;
    this.releaseCount = 0;
    this.ended = false;
    this.executedStatements = [];
    this.transactionSnapshots = [];
    this.history = {
      migrations: [],
      seeds: [],
    };
    this.metadata = {
      schema: 'public',
      tables: [
        {
          name: 'accounts',
          columns: [
            { name: 'id', dataType: 'integer', udtName: 'int4', isNullable: 'NO', isPrimary: true },
            { name: 'email', dataType: 'text', udtName: 'text', isNullable: 'NO', isPrimary: false },
            {
              name: 'created_at',
              dataType: 'timestamp with time zone',
              udtName: 'timestamptz',
              isNullable: 'NO',
              isPrimary: false,
            },
          ],
        },
      ],
    };
  }

  async query(sqlText, parameters = []) {
    const normalized = sqlText.trim().replace(/\s+/g, ' ');
    const lowered = normalized.toLowerCase();

    if (lowered === 'begin') {
      this.transactionSnapshots.push(this.#snapshotState());
      return { rows: [], rowCount: null, command: 'BEGIN' };
    }

    if (lowered === 'commit') {
      this.transactionSnapshots.pop();
      return { rows: [], rowCount: null, command: 'COMMIT' };
    }

    if (lowered === 'rollback') {
      const snapshot = this.transactionSnapshots.pop();

      if (snapshot) {
        this.#restoreState(snapshot);
      }

      return { rows: [], rowCount: null, command: 'ROLLBACK' };
    }

    if (lowered.includes('from information_schema.tables')) {
      return {
        rows: this.metadata.tables.map((table) => ({ name: table.name })),
        rowCount: this.metadata.tables.length,
        command: 'SELECT',
      };
    }

    if (lowered.includes('from information_schema.columns')) {
      const rows = this.metadata.tables.flatMap((table) =>
        table.columns.map((column) => ({
          tableName: table.name,
          name: column.name,
          dataType: column.dataType,
          udtName: column.udtName,
          isNullable: column.isNullable,
          defaultValue: column.defaultValue ?? null,
          isPrimary: column.isPrimary,
        })),
      );

      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
      };
    }

    if (lowered.startsWith('create table if not exists "public"."objx_migration_history"')) {
      return { rows: [], rowCount: null, command: 'CREATE' };
    }

    if (lowered.startsWith('create table if not exists "public"."objx_seed_history"')) {
      return { rows: [], rowCount: null, command: 'CREATE' };
    }

    if (lowered.startsWith('select name from "public"."objx_migration_history"')) {
      return {
        rows: this.#selectHistoryRows('migrations', lowered.includes('desc')),
        rowCount: this.history.migrations.length,
        command: 'SELECT',
      };
    }

    if (lowered.startsWith('select name from "public"."objx_seed_history"')) {
      return {
        rows: this.#selectHistoryRows('seeds', lowered.includes('desc')),
        rowCount: this.history.seeds.length,
        command: 'SELECT',
      };
    }

    if (lowered.startsWith('insert into "public"."objx_migration_history"')) {
      this.history.migrations.push({
        id: this.history.migrations.length + 1,
        name: parameters[0],
      });
      return { rows: [], rowCount: 1, command: 'INSERT' };
    }

    if (lowered.startsWith('insert into "public"."objx_seed_history"')) {
      this.history.seeds.push({
        id: this.history.seeds.length + 1,
        name: parameters[0],
      });
      return { rows: [], rowCount: 1, command: 'INSERT' };
    }

    if (lowered.startsWith('delete from "public"."objx_migration_history"')) {
      this.history.migrations = this.history.migrations.filter((entry) => entry.name !== parameters[0]);
      return { rows: [], rowCount: 1, command: 'DELETE' };
    }

    if (lowered.startsWith('delete from "public"."objx_seed_history"')) {
      this.history.seeds = this.history.seeds.filter((entry) => entry.name !== parameters[0]);
      return { rows: [], rowCount: 1, command: 'DELETE' };
    }

    this.executedStatements.push(normalized);
    return { rows: [], rowCount: 0, command: 'EXECUTE' };
  }

  async connect() {
    this.connectCount += 1;
    return new FakePostgresCodegenPoolClient(this);
  }

  async end() {
    this.ended = true;
  }

  #selectHistoryRows(kind, descending) {
    const rows = [...this.history[kind]];
    rows.sort((left, right) => (descending ? right.id - left.id : left.id - right.id));
    return rows.map((row) => ({ name: row.name }));
  }

  #snapshotState() {
    return {
      migrations: this.history.migrations.map((entry) => ({ ...entry })),
      seeds: this.history.seeds.map((entry) => ({ ...entry })),
      executedStatements: [...this.executedStatements],
    };
  }

  #restoreState(snapshot) {
    this.history = {
      migrations: snapshot.migrations.map((entry) => ({ ...entry })),
      seeds: snapshot.seeds.map((entry) => ({ ...entry })),
    };
    this.executedStatements = [...snapshot.executedStatements];
  }
}

class FakeMySqlCodegenPoolConnection {
  constructor(pool) {
    this.pool = pool;
    this.released = false;
  }

  async query(sqlText, parameters = []) {
    return this.pool.query(sqlText, parameters);
  }

  release() {
    if (this.released) {
      return;
    }

    this.released = true;
    this.pool.releaseCount += 1;
  }
}

class FakeMySqlCodegenPool {
  constructor() {
    this.connectCount = 0;
    this.releaseCount = 0;
    this.ended = false;
    this.executedStatements = [];
    this.transactionSnapshots = [];
    this.databaseName = 'objx_app';
    this.history = {
      migrations: [],
      seeds: [],
    };
    this.metadata = {
      tables: [
        {
          name: 'projects',
          columns: [
            { name: 'id', columnType: 'int(11)', isNullable: 'NO', columnKey: 'PRI' },
            { name: 'name', columnType: 'varchar(255)', isNullable: 'NO', columnKey: '' },
            { name: 'tenantId', columnType: 'varchar(255)', isNullable: 'NO', columnKey: '' },
          ],
        },
      ],
    };
  }

  async query(sqlText, parameters = []) {
    const normalized = sqlText.trim().replace(/\s+/g, ' ');
    const lowered = normalized.toLowerCase();

    if (lowered === 'start transaction') {
      this.transactionSnapshots.push(this.#snapshotState());
      return [{ affectedRows: 0 }];
    }

    if (lowered === 'commit') {
      this.transactionSnapshots.pop();
      return [{ affectedRows: 0 }];
    }

    if (lowered === 'rollback') {
      const snapshot = this.transactionSnapshots.pop();

      if (snapshot) {
        this.#restoreState(snapshot);
      }

      return [{ affectedRows: 0 }];
    }

    if (lowered === 'select database() as name') {
      return [[{ name: this.databaseName }]];
    }

    if (lowered.includes('from information_schema.tables')) {
      return [[this.metadata.tables.map((table) => ({ name: table.name }))].flat()];
    }

    if (lowered.includes('from information_schema.columns')) {
      const rows = this.metadata.tables.flatMap((table) =>
        table.columns.map((column) => ({
          tableName: table.name,
          name: column.name,
          columnType: column.columnType,
          isNullable: column.isNullable,
          columnKey: column.columnKey,
          defaultValue: null,
        })),
      );

      return [rows];
    }

    if (lowered.startsWith('create table if not exists `objx_migration_history`')) {
      return [{ affectedRows: 0 }];
    }

    if (lowered.startsWith('create table if not exists `objx_seed_history`')) {
      return [{ affectedRows: 0 }];
    }

    if (lowered.startsWith('select name from `objx_migration_history`')) {
      return [this.#selectHistoryRows('migrations', lowered.includes('desc'))];
    }

    if (lowered.startsWith('select name from `objx_seed_history`')) {
      return [this.#selectHistoryRows('seeds', lowered.includes('desc'))];
    }

    if (lowered.startsWith('insert into `objx_migration_history`')) {
      assert.match(
        String(parameters[1]),
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/,
        'Expected MySQL migration history timestamps in DATETIME(3) format.',
      );
      this.history.migrations.push({
        id: this.history.migrations.length + 1,
        name: parameters[0],
        executedAt: parameters[1],
      });
      return [{ affectedRows: 1 }];
    }

    if (lowered.startsWith('insert into `objx_seed_history`')) {
      assert.match(
        String(parameters[1]),
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/,
        'Expected MySQL seed history timestamps in DATETIME(3) format.',
      );
      this.history.seeds.push({
        id: this.history.seeds.length + 1,
        name: parameters[0],
        executedAt: parameters[1],
      });
      return [{ affectedRows: 1 }];
    }

    if (lowered.startsWith('delete from `objx_migration_history`')) {
      this.history.migrations = this.history.migrations.filter((entry) => entry.name !== parameters[0]);
      return [{ affectedRows: 1 }];
    }

    if (lowered.startsWith('delete from `objx_seed_history`')) {
      this.history.seeds = this.history.seeds.filter((entry) => entry.name !== parameters[0]);
      return [{ affectedRows: 1 }];
    }

    this.executedStatements.push(normalized);
    return [{ affectedRows: 0 }];
  }

  async getConnection() {
    this.connectCount += 1;
    return new FakeMySqlCodegenPoolConnection(this);
  }

  async end() {
    this.ended = true;
  }

  #selectHistoryRows(kind, descending) {
    const rows = [...this.history[kind]];
    rows.sort((left, right) => (descending ? right.id - left.id : left.id - right.id));
    return rows.map((row) => ({ name: row.name }));
  }

  #snapshotState() {
    return {
      migrations: this.history.migrations.map((entry) => ({ ...entry })),
      seeds: this.history.seeds.map((entry) => ({ ...entry })),
      executedStatements: [...this.executedStatements],
    };
  }

  #restoreState(snapshot) {
    this.history = {
      migrations: snapshot.migrations.map((entry) => ({ ...entry })),
      seeds: snapshot.seeds.map((entry) => ({ ...entry })),
    };
    this.executedStatements = [...snapshot.executedStatements];
  }
}

async function createSchemaDirectory(tempDir) {
  const migrationDir = path.join(tempDir, 'db', 'migrations');
  const seedDir = path.join(tempDir, 'db', 'seeds');
  await mkdir(migrationDir, { recursive: true });
  await mkdir(seedDir, { recursive: true });

  await writeFile(
    path.join(migrationDir, '000001_init.migration.mjs'),
    `export default {
  name: '000001_init',
  up: ['create table projects (id integer primary key, name text not null);'],
  down: ['drop table if exists projects;'],
};
`,
    'utf8',
  );

  await writeFile(
    path.join(seedDir, '000001_projects.seed.mjs'),
    `export default {
  name: '000001_projects',
  run: ["insert into projects (name) values ('Alpha');"],
  revert: ["delete from projects where name = 'Alpha';"],
};
`,
    'utf8',
  );

  return {
    migrationDir,
    seedDir,
  };
}

const tests = [
  [
    'generate maps snake_case tables and columns to logical camelCase with physical mappings',
    async () => {
      const generator = createObjxModelGenerator({
        outDir: 'generated/models',
      });
      const files = await generator.generate({
        dialect: 'postgres',
        tables: [
          {
            name: 'user_profiles',
            columns: [
              {
                name: 'id',
                type: 'integer',
                nullable: false,
                primary: true,
              },
              {
                name: 'created_at',
                type: 'timestamp with time zone',
                nullable: false,
              },
              {
                name: 'owner_id',
                type: 'integer',
                nullable: false,
              },
            ],
          },
        ],
      });
      const modelFile = files.find((file) => file.path.endsWith('user_profiles.model.ts'));

      assert.ok(modelFile);
      assert.match(modelFile.contents, /table: 'userProfiles'/);
      assert.match(modelFile.contents, /dbTable: 'user_profiles'/);
      assert.match(modelFile.contents, /createdAt: col\.timestamp\(\)\.dbName\('created_at'\)/);
      assert.match(modelFile.contents, /ownerId: col\.int\(\)\.dbName\('owner_id'\)/);
    },
  ],
  [
    'generate maps bigint columns to col.bigint()',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-codegen-bigint-'));
      const inputPath = path.join(tempDir, 'schema.json');
      const outDir = 'generated/models';

      try {
        await writeFile(
          inputPath,
          JSON.stringify(
            {
              dialect: 'postgres',
              tables: [
                {
                  name: 'ledger_entries',
                  columns: [
                    {
                      name: 'id',
                      type: 'bigint',
                      nullable: false,
                      primary: true,
                    },
                    {
                      name: 'amount',
                      type: 'int8',
                      nullable: false,
                    },
                  ],
                },
              ],
            },
            null,
            2,
          ),
          'utf8',
        );

        const exitCode = await runCodegenCli(
          ['generate', '--input', inputPath, '--out', outDir],
          {
            cwd: tempDir,
          },
        );
        const contents = await readFile(
          path.join(tempDir, outDir, 'ledger_entries.model.ts'),
          'utf8',
        );

        assert.equal(exitCode, 0);
        assert.match(contents, /id: col\.bigint\(\)\.primary\(\)/);
        assert.match(contents, /amount: col\.bigint\(\)/);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'parseCodegenCliArgs normalizes postgres/mysql dialects and template options',
    async () => {
      const postgresIntrospect = parseCodegenCliArgs([
        'introspect',
        '--dialect',
        'pg',
        '--database',
        'postgresql://postgres:postgres@localhost:5432/objx',
        '--out',
        'schema.json',
      ]);
      const mySqlMigrate = parseCodegenCliArgs([
        'migrate',
        '--dialect',
        'mysql2',
        '--database',
        'mysql://root:root@localhost:3306/objx',
        '--dir',
        'db/migrations',
      ]);
      const template = parseCodegenCliArgs([
        'template',
        '--template',
        'migration-seed-schemas',
        '--dialect',
        'postgres',
        '--out',
        'db',
      ]);

      assert.equal(postgresIntrospect.dialect, 'postgres');
      assert.equal(mySqlMigrate.dialect, 'mysql');
      assert.equal(template.command, 'template');
      assert.equal(template.templateName, 'migration-seed-schemas');
      assert.equal(template.dialect, 'postgres');
    },
  ],
  [
    'introspectPostgresDatabase maps information_schema rows',
    async () => {
      const pool = new FakePostgresCodegenPool();
      const introspection = await introspectPostgresDatabase({
        pool,
      });

      assert.equal(introspection.dialect, 'postgres');
      assert.equal(introspection.tables.length, 1);
      assert.equal(introspection.tables[0].name, 'accounts');
      assert.deepEqual(
        introspection.tables[0].columns.map((column) => ({
          name: column.name,
          type: column.type,
          nullable: column.nullable,
          primary: column.primary ?? false,
        })),
        [
          { name: 'id', type: 'integer', nullable: false, primary: true },
          { name: 'email', type: 'text', nullable: false, primary: false },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            nullable: false,
            primary: false,
          },
        ],
      );
    },
  ],
  [
    'introspectMySqlDatabase maps information_schema rows',
    async () => {
      const pool = new FakeMySqlCodegenPool();
      const introspection = await introspectMySqlDatabase({
        pool,
      });

      assert.equal(introspection.dialect, 'mysql');
      assert.equal(introspection.tables.length, 1);
      assert.equal(introspection.tables[0].name, 'projects');
      assert.deepEqual(
        introspection.tables[0].columns.map((column) => ({
          name: column.name,
          type: column.type,
          nullable: column.nullable,
          primary: column.primary ?? false,
        })),
        [
          { name: 'id', type: 'int(11)', nullable: false, primary: true },
          { name: 'name', type: 'varchar(255)', nullable: false, primary: false },
          { name: 'tenantId', type: 'varchar(255)', nullable: false, primary: false },
        ],
      );
    },
  ],
  [
    'postgres migration and seed runners execute schemas and manage history',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-codegen-pg-'));
      const pool = new FakePostgresCodegenPool();

      try {
        const { migrationDir, seedDir } = await createSchemaDirectory(tempDir);
        const migrationResult = await runPostgresMigrations({
          pool,
          directoryPath: migrationDir,
        });
        const seedResult = await runPostgresSeeds({
          pool,
          directoryPath: seedDir,
        });
        const revertSeedResult = await runPostgresSeeds({
          pool,
          directoryPath: seedDir,
          direction: 'revert',
        });
        const downMigrationResult = await runPostgresMigrations({
          pool,
          directoryPath: migrationDir,
          direction: 'down',
        });

        assert.deepEqual(migrationResult.executed, ['000001_init']);
        assert.deepEqual(seedResult.executed, ['000001_projects']);
        assert.deepEqual(revertSeedResult.executed, ['000001_projects']);
        assert.deepEqual(downMigrationResult.executed, ['000001_init']);
        assert.equal(pool.connectCount, 4);
        assert.equal(pool.releaseCount, 4);
        assert.ok(
          pool.executedStatements.some((statement) =>
            statement.includes('create table projects'),
          ),
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'mysql migration and seed runners execute schemas and manage history',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-codegen-mysql-'));
      const pool = new FakeMySqlCodegenPool();

      try {
        const { migrationDir, seedDir } = await createSchemaDirectory(tempDir);
        const migrationResult = await runMySqlMigrations({
          pool,
          directoryPath: migrationDir,
        });
        const seedResult = await runMySqlSeeds({
          pool,
          directoryPath: seedDir,
        });
        const revertSeedResult = await runMySqlSeeds({
          pool,
          directoryPath: seedDir,
          direction: 'revert',
        });
        const downMigrationResult = await runMySqlMigrations({
          pool,
          directoryPath: migrationDir,
          direction: 'down',
        });

        assert.deepEqual(migrationResult.executed, ['000001_init']);
        assert.deepEqual(seedResult.executed, ['000001_projects']);
        assert.deepEqual(revertSeedResult.executed, ['000001_projects']);
        assert.deepEqual(downMigrationResult.executed, ['000001_init']);
        assert.equal(pool.connectCount, 4);
        assert.equal(pool.releaseCount, 4);
        assert.ok(
          pool.executedStatements.some((statement) =>
            statement.includes('create table projects'),
          ),
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'runCodegenCli supports postgres introspection via moduleLoader',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-codegen-cli-pg-'));
      const pool = new FakePostgresCodegenPool();
      const stdout = [];
      const stderr = [];

      try {
        const exitCode = await runCodegenCli(
          [
            'introspect',
            '--dialect',
            'postgres',
            '--database',
            'postgresql://postgres:postgres@localhost:5432/objx',
            '--out',
            'generated/schema.json',
          ],
          {
            cwd: tempDir,
            moduleLoader: async (specifier) => {
              if (specifier === 'pg') {
                return {
                  Pool: class {
                    constructor() {
                      return pool;
                    }
                  },
                };
              }

              throw new Error(`Unexpected module import: ${specifier}`);
            },
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const contents = JSON.parse(
          await readFile(path.join(tempDir, 'generated', 'schema.json'), 'utf8'),
        );

        assert.equal(exitCode, 0);
        assert.deepEqual(stderr, []);
        assert.equal(contents.dialect, 'postgres');
        assert.equal(contents.tables[0].name, 'accounts');
        assert.match(stdout[0], /Introspected 1 tables/i);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'starter and schema templates exist for postgres and mysql',
    async () => {
      const postgresStarter = createPostgresStarterTemplate({
        outDir: 'templates/postgres-starter',
        packageName: 'acme-pg',
      });
      const mysqlStarter = createMySqlStarterTemplate({
        outDir: 'templates/mysql-starter',
        packageName: 'acme-mysql',
      });
      const postgresSchemaTemplate = createMigrationSeedSchemasTemplate({
        outDir: 'db',
        dialect: 'postgres',
      });

      const postgresStarterFiles = await postgresStarter.generate();
      const mysqlStarterFiles = await mysqlStarter.generate();
      const postgresSchemaFiles = await postgresSchemaTemplate.generate();
      const postgresPackage = JSON.parse(
        postgresStarterFiles.find((file) => file.path.endsWith('package.json')).contents,
      );
      const mysqlPackage = JSON.parse(
        mysqlStarterFiles.find((file) => file.path.endsWith('package.json')).contents,
      );
      const postgresReadme = postgresSchemaFiles.find((file) => file.path.endsWith('README.md')).contents;

      assert.equal(postgresPackage.dependencies['@qbobjx/postgres-driver'], '0.2.0');
      assert.equal(postgresPackage.dependencies.pg, '^8.0.0');
      assert.equal(mysqlPackage.dependencies['@qbobjx/mysql-driver'], '0.2.0');
      assert.equal(mysqlPackage.dependencies.mysql2, '^3.0.0');
      assert.match(postgresReadme, /--dialect postgres/);
      assert.match(postgresReadme, /postgresql:\/\/postgres/);
      assert.match(
        postgresStarterFiles.find((file) => file.path.endsWith('src/models.mjs')).contents,
        /createSnakeCaseNamingPlugin\(\)/,
      );
      assert.match(
        postgresStarterFiles.find((file) => file.path.endsWith('schema.sql')).contents,
        /tenant_id/,
      );
    },
  ],
];

let failed = 0;

for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`all codegen tests passed (${tests.length})`);
}

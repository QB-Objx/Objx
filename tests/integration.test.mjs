import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import pg from 'pg';
import mysql from 'mysql2/promise';

import { col, defineModel } from '@qbobjx/core';
import { runCodegenCli } from '@qbobjx/codegen';
import {
  cleanupCodegenTables,
  createCodegenSchemaDirectory,
  mySqlConnectionString,
  postgresConnectionString,
  resetTaskTable,
} from './fixtures/multi-dialect.mjs';
import { createMySqlSession } from '../packages/mysql-driver/dist/index.js';
import { createPostgresSession } from '../packages/postgres-driver/dist/index.js';

if (!postgresConnectionString) {
  throw new Error(
    'Missing PostgreSQL connection string. Set POSTGRES_DATABASE_URL or OBJX_POSTGRES_URL.',
  );
}

if (!mySqlConnectionString) {
  throw new Error(
    'Missing MySQL connection string. Set MYSQL_DATABASE_URL or OBJX_MYSQL_URL.',
  );
}

const { Pool } = pg;

const TaskItem = defineModel({
  name: 'TaskItem',
  table: 'task_items',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    done: col.boolean(),
  },
});

function isRollbackError(expectedMessage) {
  return (error) =>
    error?.cause?.message === expectedMessage || error?.message === expectedMessage;
}

const tests = [
  [
    'postgres driver uses real nested transactions',
    async () => {
      const pool = new Pool({
        connectionString: postgresConnectionString,
      });

      try {
        await resetTaskTable('postgres', pool);

        const session = createPostgresSession({
          pool,
        });

        await session.execute(
          TaskItem.insert({
            title: 'Ship OBJX',
            done: false,
          }),
        );

        await assert.rejects(
          () =>
            session.transaction(async (transactionSession) => {
              await transactionSession.execute(
                TaskItem.insert({
                  title: 'Rollback me',
                  done: true,
                }),
              );

              throw new Error('rollback');
            }),
          isRollbackError('rollback'),
        );

        await session.transaction(async (transactionSession) => {
          await transactionSession.execute(
            TaskItem.insert({
              title: 'Outer',
              done: true,
            }),
          );

          await assert.rejects(
            () =>
              transactionSession.transaction(async (nestedSession) => {
                await nestedSession.execute(
                  TaskItem.insert({
                    title: 'Inner rollback',
                    done: true,
                  }),
                );

                throw new Error('nested rollback');
              }),
            isRollbackError('nested rollback'),
          );

          await transactionSession.execute(
            TaskItem.insert({
              title: 'Outer after nested',
              done: false,
            }),
          );
        });

        const rows = await session.execute(TaskItem.query().orderBy(({ id }) => id), {
          hydrate: true,
        });

        assert.deepEqual(
          rows.map((row) => row.title),
          ['Ship OBJX', 'Outer', 'Outer after nested'],
        );
        assert.equal(rows[0].done, false);
        assert.equal(rows[1].done, true);
      } finally {
        await pool.end();
      }
    },
  ],
  [
    'mysql driver uses real nested transactions',
    async () => {
      const pool = mysql.createPool(mySqlConnectionString);

      try {
        await resetTaskTable('mysql', pool);

        const session = createMySqlSession({
          pool,
        });

        await session.execute(
          TaskItem.insert({
            title: 'Ship OBJX',
            done: false,
          }),
        );

        await assert.rejects(
          () =>
            session.transaction(async (transactionSession) => {
              await transactionSession.execute(
                TaskItem.insert({
                  title: 'Rollback me',
                  done: true,
                }),
              );

              throw new Error('rollback');
            }),
          isRollbackError('rollback'),
        );

        await session.transaction(async (transactionSession) => {
          await transactionSession.execute(
            TaskItem.insert({
              title: 'Outer',
              done: true,
            }),
          );

          await assert.rejects(
            () =>
              transactionSession.transaction(async (nestedSession) => {
                await nestedSession.execute(
                  TaskItem.insert({
                    title: 'Inner rollback',
                    done: true,
                  }),
                );

                throw new Error('nested rollback');
              }),
            isRollbackError('nested rollback'),
          );

          await transactionSession.execute(
            TaskItem.insert({
              title: 'Outer after nested',
              done: false,
            }),
          );
        });

        const rows = await session.execute(TaskItem.query().orderBy(({ id }) => id), {
          hydrate: true,
        });

        assert.deepEqual(
          rows.map((row) => row.title),
          ['Ship OBJX', 'Outer', 'Outer after nested'],
        );
        assert.equal(rows[0].done, false);
        assert.equal(rows[1].done, true);
      } finally {
        await pool.end();
      }
    },
  ],
  [
    'codegen CLI runs against a real PostgreSQL database',
    async () => {
      const pool = new Pool({
        connectionString: postgresConnectionString,
      });
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-pg-integration-'));
      const tableName = 'ci_codegen_projects_pg';
      const stdout = [];
      const stderr = [];

      try {
        const { migrationDir, seedDir } = await createCodegenSchemaDirectory(
          tempDir,
          'postgres',
          tableName,
        );
        await cleanupCodegenTables('postgres', pool, tableName);

        const migrateExitCode = await runCodegenCli(
          [
            'migrate',
            '--dialect',
            'postgres',
            '--database',
            postgresConnectionString,
            '--dir',
            migrationDir,
            '--direction',
            'up',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const seedExitCode = await runCodegenCli(
          [
            'seed',
            '--dialect',
            'postgres',
            '--database',
            postgresConnectionString,
            '--dir',
            seedDir,
            '--direction',
            'run',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const introspectExitCode = await runCodegenCli(
          [
            'introspect',
            '--dialect',
            'postgres',
            '--database',
            postgresConnectionString,
            '--out',
            'generated/schema.json',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const rowCount = await pool.query(`select count(*)::int as total from ${tableName}`);
        const schemaJson = JSON.parse(
          await readFile(path.join(tempDir, 'generated', 'schema.json'), 'utf8'),
        );

        const revertSeedExitCode = await runCodegenCli(
          [
            'seed',
            '--dialect',
            'postgres',
            '--database',
            postgresConnectionString,
            '--dir',
            seedDir,
            '--direction',
            'revert',
          ],
          {
            cwd: tempDir,
          },
        );
        const downExitCode = await runCodegenCli(
          [
            'migrate',
            '--dialect',
            'postgres',
            '--database',
            postgresConnectionString,
            '--dir',
            migrationDir,
            '--direction',
            'down',
          ],
          {
            cwd: tempDir,
          },
        );

        assert.equal(migrateExitCode, 0);
        assert.equal(seedExitCode, 0);
        assert.equal(introspectExitCode, 0);
        assert.equal(revertSeedExitCode, 0);
        assert.equal(downExitCode, 0);
        assert.deepEqual(stderr, []);
        assert.equal(Number(rowCount.rows[0].total), 1);
        assert.equal(schemaJson.dialect, 'postgres');
        assert.ok(schemaJson.tables.some((table) => table.name === tableName));
      } finally {
        await cleanupCodegenTables('postgres', pool, tableName);
        await pool.end();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'codegen CLI runs against a real MySQL database',
    async () => {
      const pool = mysql.createPool(mySqlConnectionString);
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-mysql-integration-'));
      const tableName = 'ci_codegen_projects_mysql';
      const stdout = [];
      const stderr = [];

      try {
        const { migrationDir, seedDir } = await createCodegenSchemaDirectory(
          tempDir,
          'mysql',
          tableName,
        );
        await cleanupCodegenTables('mysql', pool, tableName);

        const migrateExitCode = await runCodegenCli(
          [
            'migrate',
            '--dialect',
            'mysql',
            '--database',
            mySqlConnectionString,
            '--dir',
            migrationDir,
            '--direction',
            'up',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const seedExitCode = await runCodegenCli(
          [
            'seed',
            '--dialect',
            'mysql',
            '--database',
            mySqlConnectionString,
            '--dir',
            seedDir,
            '--direction',
            'run',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const introspectExitCode = await runCodegenCli(
          [
            'introspect',
            '--dialect',
            'mysql',
            '--database',
            mySqlConnectionString,
            '--out',
            'generated/schema.json',
          ],
          {
            cwd: tempDir,
            stdout(message) {
              stdout.push(message);
            },
            stderr(message) {
              stderr.push(message);
            },
          },
        );

        const [rows] = await pool.query(`select count(*) as total from \`${tableName}\``);
        const schemaJson = JSON.parse(
          await readFile(path.join(tempDir, 'generated', 'schema.json'), 'utf8'),
        );

        const revertSeedExitCode = await runCodegenCli(
          [
            'seed',
            '--dialect',
            'mysql',
            '--database',
            mySqlConnectionString,
            '--dir',
            seedDir,
            '--direction',
            'revert',
          ],
          {
            cwd: tempDir,
          },
        );
        const downExitCode = await runCodegenCli(
          [
            'migrate',
            '--dialect',
            'mysql',
            '--database',
            mySqlConnectionString,
            '--dir',
            migrationDir,
            '--direction',
            'down',
          ],
          {
            cwd: tempDir,
          },
        );

        assert.equal(migrateExitCode, 0);
        assert.equal(seedExitCode, 0);
        assert.equal(introspectExitCode, 0);
        assert.equal(revertSeedExitCode, 0);
        assert.equal(downExitCode, 0);
        assert.deepEqual(stderr, []);
        assert.equal(Number(rows[0].total), 1);
        assert.equal(schemaJson.dialect, 'mysql');
        assert.ok(schemaJson.tables.some((table) => table.name === tableName));
      } finally {
        await cleanupCodegenTables('mysql', pool, tableName);
        await pool.end();
        await rm(tempDir, { recursive: true, force: true });
      }
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
  console.log(`all integration tests passed (${tests.length})`);
}

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  belongsToOne,
  col,
  defineModel,
  hasMany,
  hasOne,
} from '@objx/core';
import {
  runCodegenCli,
} from '@objx/codegen';
import {
  ObjxSqlCompiler,
  createSession,
  identifier,
  ref,
  resolveSqlDialectName,
  sql,
} from '@objx/sql-engine';
import {
  createAuditTrailPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@objx/plugins';
import {
  createSqliteDriver,
  createSqliteSession,
} from '../packages/sqlite-driver/dist/index.js';

class FakeDriver {
  constructor() {
    this.tables = new Map([
      [
        'people',
        [
          {
            id: '1',
            name: 'Ada',
            active: 'true',
            profile: '{"role":"admin"}',
            createdAt: '2026-03-31T10:00:00.000Z',
          },
        ],
      ],
      [
        'pets',
        [
          { id: '10', name: 'Turing', ownerId: '1' },
          { id: '11', name: 'Lambda', ownerId: '1' },
        ],
      ],
      [
        'tenant_projects',
        [
          { id: '1', name: 'Alpha', tenantId: 'tenant_a' },
          { id: '2', name: 'Beta', tenantId: 'tenant_b' },
        ],
      ],
      ['strict_people', [{ id: '1', name: 'Locked' }]],
      ['strict_pets', [{ id: '1', name: 'Pinned', ownerId: '1' }]],
      ['companies', []],
      ['users', []],
      ['authors', [{ id: '1', name: 'Ada' }]],
      ['badges', [{ id: '1', label: 'Core', ownerId: '1' }]],
      [
        'articles',
        [
          { id: '1', title: 'Visible', deletedAt: null },
          { id: '2', title: 'Archived', deletedAt: '2026-03-30T10:00:00.000Z' },
        ],
      ],
      ['person_pets', []],
    ]);
    this.sequences = new Map([
      ['people', 1],
      ['pets', 11],
      ['tenant_projects', 2],
      ['strict_people', 1],
      ['strict_pets', 1],
      ['companies', 0],
      ['users', 0],
      ['authors', 1],
      ['badges', 1],
      ['articles', 2],
      ['person_pets', 0],
    ]);
    this.transactionCount = 0;
  }

  async execute(compiledQuery) {
    const queryKind = compiledQuery.metadata.queryKind;
    const table = compiledQuery.metadata.table;

    if (queryKind === 'insert') {
      return this.#handleInsert(compiledQuery, table);
    }

    if (queryKind === 'select' && this.tables.has(table)) {
      return this.#handleSelect(compiledQuery, table);
    }

    if (queryKind === 'update' && table === 'people') {
      if (!/ returning /i.test(compiledQuery.sql)) {
        return {
          rowCount: 3,
        };
      }
    }

    if (queryKind === 'update' && this.tables.has(table)) {
      return this.#handleUpdate(compiledQuery, table);
    }

    if (queryKind === 'delete' && this.tables.has(table)) {
      return this.#handleDelete(compiledQuery, table);
    }

    if (queryKind === 'raw' && /^insert into /i.test(compiledQuery.sql)) {
      return this.#handleRawInsert(compiledQuery);
    }

    if (queryKind === 'raw' && /^select /i.test(compiledQuery.sql)) {
      return this.#handleRawSelect(compiledQuery);
    }

    if (queryKind === 'raw') {
      return [{ value: 1 }];
    }

    return {
      rows: [],
      rowCount: 0,
    };
  }

  async transaction(callback) {
    this.transactionCount += 1;
    return callback({
      id: `trx_${this.transactionCount}`,
    });
  }

  #handleSelect(compiledQuery, table) {
    const rows = (this.tables.get(table) ?? []).map((row) => ({ ...row }));
    const filtered = rows.filter(
      this.#compileWhereEvaluator(
        compiledQuery.sql,
        compiledQuery.parameters.map((parameter) => parameter.value),
      ),
    );

    return {
      rows: filtered,
      rowCount: filtered.length,
    };
  }

  #handleUpdate(compiledQuery, table) {
    const rows = this.tables.get(table) ?? [];
    const { assignments, assignmentParameterCount } = this.#parseUpdateAssignments(
      compiledQuery.sql,
      compiledQuery.parameters.map((parameter) => parameter.value),
    );
    const evaluateWhere = this.#compileWhereEvaluator(
      compiledQuery.sql,
      compiledQuery.parameters.slice(assignmentParameterCount).map((parameter) => parameter.value),
    );
    const updatedRows = [];

    for (const row of rows) {
      if (!evaluateWhere(row)) {
        continue;
      }

      Object.assign(row, assignments);
      updatedRows.push({ ...row });
    }

    return {
      rows: / returning /i.test(compiledQuery.sql) ? updatedRows : [],
      rowCount: updatedRows.length,
    };
  }

  #handleDelete(compiledQuery, table) {
    const rows = this.tables.get(table) ?? [];
    const evaluateWhere = this.#compileWhereEvaluator(
      compiledQuery.sql,
      compiledQuery.parameters.map((parameter) => parameter.value),
    );
    const remainingRows = [];
    const deletedRows = [];

    for (const row of rows) {
      if (evaluateWhere(row)) {
        deletedRows.push({ ...row });
      } else {
        remainingRows.push(row);
      }
    }

    this.tables.set(table, remainingRows);

    return {
      rows: / returning /i.test(compiledQuery.sql) ? deletedRows : [],
      rowCount: deletedRows.length,
    };
  }

  #handleInsert(compiledQuery, table) {
    const columns = this.#parseInsertColumns(compiledQuery.sql);
    const row = {};

    columns.forEach((column, index) => {
      row[column] = compiledQuery.parameters[index]?.value;
    });

    if (!('id' in row) && this.tables.has(table) && table !== 'person_pets') {
      row.id = this.#nextId(table);
    }

    const currentRows = this.tables.get(table) ?? [];
    currentRows.push({ ...row });
    this.tables.set(table, currentRows);

    return {
      rows: [{ ...row }],
      rowCount: 1,
    };
  }

  #handleRawInsert(compiledQuery) {
    const tableMatch = /^insert into\s+"([^"]+)"/i.exec(compiledQuery.sql);
    const table = tableMatch?.[1];

    if (!table) {
      throw new Error(`Unable to determine raw insert table from SQL: ${compiledQuery.sql}`);
    }

    const columns = this.#parseInsertColumns(compiledQuery.sql);
    const row = {};

    columns.forEach((column, index) => {
      row[column] = compiledQuery.parameters[index]?.value;
    });

    const currentRows = this.tables.get(table) ?? [];
    currentRows.push({ ...row });
    this.tables.set(table, currentRows);

    return {
      rows: [],
      rowCount: 1,
    };
  }

  #handleRawSelect(compiledQuery) {
    const tableMatch = /from\s+"([^"]+)"/i.exec(compiledQuery.sql);
    const table = tableMatch?.[1];

    if (!table || !this.tables.has(table)) {
      return [{ value: 1 }];
    }

    const rows = (this.tables.get(table) ?? []).map((row) => ({ ...row }));
    const filtered = rows.filter(
      this.#compileWhereEvaluator(
        compiledQuery.sql,
        compiledQuery.parameters.map((parameter) => parameter.value),
      ),
    );

    return {
      rows: filtered,
      rowCount: filtered.length,
    };
  }

  #parseInsertColumns(sqlText) {
    const match = /insert into\s+"[^"]+"\s+\(([^)]+)\)/i.exec(sqlText);

    if (!match) {
      return [];
    }

    return match[1]
      .split(',')
      .map((column) => column.trim().replace(/"/g, ''));
  }

  #parseUpdateAssignments(sqlText, parameters) {
    const match = / set (.+?)( where | returning |$)/i.exec(sqlText);

    if (!match) {
      return {
        assignments: {},
        assignmentParameterCount: 0,
      };
    }

    const assignments = {};
    const parts = match[1].split(',').map((part) => part.trim());

    parts.forEach((part, index) => {
      const columnMatch = /^"([^"]+)"\s*=/.exec(part);

      if (columnMatch) {
        assignments[columnMatch[1]] = parameters[index];
      }
    });

    return {
      assignments,
      assignmentParameterCount: parts.length,
    };
  }

  #nextId(table) {
    const current = this.sequences.get(table) ?? 0;
    const next = current + 1;
    this.sequences.set(table, next);
    return next;
  }

  #valuesEqual(left, right) {
    return String(left) === String(right);
  }

  #compileWhereEvaluator(sqlText, parameters) {
    const whereMatch = / where (.+?)( order by | limit | offset | returning |$)/i.exec(sqlText);

    if (!whereMatch) {
      return () => true;
    }

    const clauses = whereMatch[1]
      .split(/\s+and\s+/i)
      .map((clause) => clause.trim())
      .filter(Boolean);
    const evaluators = [];
    let parameterIndex = 0;

    for (const clause of clauses) {
      let match = /"[^"]+"\."([^"]+)"\s+is\s+null/i.exec(clause);

      if (match) {
        const column = match[1];
        evaluators.push((row) => row[column] === null || row[column] === undefined);
        continue;
      }

      match = /"[^"]+"\."([^"]+)"\s+is\s+not\s+null/i.exec(clause);

      if (match) {
        const column = match[1];
        evaluators.push((row) => row[column] !== null && row[column] !== undefined);
        continue;
      }

      match = /"[^"]+"\."([^"]+)"\s+in\s+\(([^)]*)\)/i.exec(clause);

      if (match) {
        const column = match[1];
        const placeholderCount = (match[2].match(/\$\d+|\?/g) ?? []).length;
        const values = parameters.slice(parameterIndex, parameterIndex + placeholderCount);
        parameterIndex += placeholderCount;
        evaluators.push((row) =>
          values.some((value) => this.#valuesEqual(row[column], value)),
        );
        continue;
      }

      match = /"[^"]+"\."([^"]+)"\s*=\s*(?:\$\d+|\?)/i.exec(clause);

      if (match) {
        const column = match[1];
        const value = parameters[parameterIndex];
        parameterIndex += 1;
        evaluators.push((row) => this.#valuesEqual(row[column], value));
        continue;
      }

      match = /"[^"]+"\."([^"]+)"\s*!=\s*(?:\$\d+|\?)/i.exec(clause);

      if (match) {
        const column = match[1];
        const value = parameters[parameterIndex];
        parameterIndex += 1;
        evaluators.push((row) => !this.#valuesEqual(row[column], value));
      }
    }

    return (row) => evaluators.every((evaluate) => evaluate(row));
  }
}

const Pet = defineModel({
  name: 'Pet',
  table: 'pets',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    ownerId: col.int().nullable(),
  },
});

const StrictPet = defineModel({
  name: 'StrictPet',
  table: 'strict_pets',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    ownerId: col.int(),
  },
});

const TenantProject = defineModel({
  name: 'TenantProject',
  table: 'tenant_projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
  },
  plugins: [createTenantScopePlugin()],
});

const SqliteTask = defineModel({
  name: 'SqliteTask',
  table: 'task_items',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    done: col.boolean(),
    createdAt: col.timestamp().nullable(),
  },
});

const Person = defineModel({
  name: 'Person',
  table: 'people',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    active: col.boolean(),
    profile: col.json(),
    createdAt: col.timestamp(),
  },
  relations: (person) => ({
    pets: hasMany(() => Pet, {
      from: person.columns.id,
      to: Pet.columns.ownerId,
    }),
    favoritePet: belongsToOne(() => Pet, {
      from: person.columns.id,
      to: Pet.columns.ownerId,
    }),
  }),
});

const StrictPerson = defineModel({
  name: 'StrictPerson',
  table: 'strict_people',
  columns: {
    id: col.int().primary(),
    name: col.text(),
  },
  relations: (person) => ({
    pets: hasMany(() => StrictPet, {
      from: person.columns.id,
      to: StrictPet.columns.ownerId,
    }),
  }),
});

const Company = defineModel({
  name: 'Company',
  table: 'companies',
  columns: {
    id: col.int().primary(),
    name: col.text(),
  },
});

const User = defineModel({
  name: 'User',
  table: 'users',
  columns: {
    id: col.int().primary(),
    email: col.text(),
    companyId: col.int().nullable(),
  },
  relations: (user) => ({
    company: belongsToOne(() => Company, {
      from: user.columns.companyId,
      to: Company.columns.id,
    }),
  }),
});

const Badge = defineModel({
  name: 'Badge',
  table: 'badges',
  columns: {
    id: col.int().primary(),
    label: col.text(),
    ownerId: col.int().nullable(),
  },
});

const Author = defineModel({
  name: 'Author',
  table: 'authors',
  columns: {
    id: col.int().primary(),
    name: col.text(),
  },
  relations: (author) => ({
    badge: hasOne(() => Badge, {
      from: author.columns.id,
      to: Badge.columns.ownerId,
    }),
  }),
});

const Article = defineModel({
  name: 'Article',
  table: 'articles',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [createSoftDeletePlugin()],
});

const tests = [
  [
    'compiler resolves knex-style dialect aliases',
    async () => {
      assert.equal(resolveSqlDialectName('pg'), 'postgres');
      assert.equal(resolveSqlDialectName('mysql2'), 'mysql');
      assert.equal(resolveSqlDialectName('better-sqlite3'), 'sqlite3');

      const compiled = new ObjxSqlCompiler({
        dialect: 'mysql2',
      }).compile(
        Person.query().where(({ id }, operators) => operators.eq(id, 1)),
      );

      assert.equal(compiled.metadata.dialect, 'mysql');
      assert.match(compiled.sql, /from `people`/i);
      assert.match(compiled.sql, /where `people`\.`id` = \?/i);
      assert.deepEqual(compiled.parameters.map((parameter) => parameter.value), [1]);
    },
  ],
  [
    'raw refs wrap dotted identifiers, aliases and stars',
    async () => {
      const compiled = new ObjxSqlCompiler({
        dialect: 'better-sqlite3',
      }).compileRaw(
        sql`select ${ref('p.name as personName')}, ${identifier('p', '*')} from ${ref('people as p')}`,
      );

      assert.equal(
        compiled.sql,
        'select "p"."name" as "personName", "p".* from "people" as "p"',
      );
      assert.equal(compiled.metadata.dialect, 'sqlite3');
      assert.equal(compiled.parameters.length, 0);
    },
  ],
  [
    'codegen cli generates objx models from introspection json',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-codegen-'));
      const inputPath = path.join(tempDir, 'introspection.json');
      const outputDir = 'generated/models';
      const stdout = [];
      const stderr = [];

      try {
        await writeFile(
          inputPath,
          JSON.stringify({
            dialect: 'postgres',
            tables: [
              {
                name: 'tenant_projects',
                columns: [
                  { name: 'id', type: 'integer', nullable: false, primary: true },
                  { name: 'name', type: 'text', nullable: false },
                  { name: 'tenantId', type: 'text', nullable: false },
                ],
              },
            ],
          }),
          'utf8',
        );

        const exitCode = await runCodegenCli(
          ['generate', '--input', inputPath, '--out', outputDir],
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

        const modelContents = await readFile(
          path.join(tempDir, outputDir, 'tenant_projects.model.ts'),
          'utf8',
        );
        const indexContents = await readFile(
          path.join(tempDir, outputDir, 'index.ts'),
          'utf8',
        );

        assert.equal(exitCode, 0);
        assert.deepEqual(stderr, []);
        assert.match(stdout[0], /Generated 2 files/i);
        assert.match(modelContents, /export const TenantProjects = defineModel/);
        assert.match(modelContents, /id: col\.int\(\)\.primary\(\),/);
        assert.match(indexContents, /tenant_projects\.model\.js/);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'codegen cli introspects a real sqlite database',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-introspect-'));
      const databasePath = path.join(tempDir, 'app.sqlite');
      const outPath = 'generated/schema.json';
      const stdout = [];
      const stderr = [];
      const database = new DatabaseSync(databasePath);

      try {
        database.exec(`
          create table accounts (
            id integer primary key,
            email text not null,
            display_name text,
            created_at text not null default CURRENT_TIMESTAMP
          );
        `);

        const exitCode = await runCodegenCli(
          ['introspect', '--dialect', 'sqlite3', '--database', databasePath, '--out', outPath],
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

        const contents = JSON.parse(
          await readFile(path.join(tempDir, outPath), 'utf8'),
        );

        assert.equal(exitCode, 0);
        assert.deepEqual(stderr, []);
        assert.match(stdout[0], /Introspected 1 tables/i);
        assert.equal(contents.dialect, 'sqlite3');
        assert.equal(contents.tables.length, 1);
        assert.equal(contents.tables[0].name, 'accounts');
        assert.deepEqual(
          contents.tables[0].columns.map((column) => ({
            name: column.name,
            type: column.type,
            nullable: column.nullable,
            primary: column.primary ?? false,
          })),
          [
            { name: 'id', type: 'INTEGER', nullable: false, primary: true },
            { name: 'email', type: 'TEXT', nullable: false, primary: false },
            { name: 'display_name', type: 'TEXT', nullable: true, primary: false },
            { name: 'created_at', type: 'TEXT', nullable: false, primary: false },
          ],
        );
      } finally {
        database.close();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'codegen cli generates a sqlite starter template',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-template-'));
      const outDir = 'starter';
      const stdout = [];
      const stderr = [];

      try {
        const exitCode = await runCodegenCli(
          ['template', '--template', 'sqlite-starter', '--out', outDir, '--package-name', 'acme-app'],
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

        const packageJson = JSON.parse(
          await readFile(path.join(tempDir, outDir, 'package.json'), 'utf8'),
        );
        const appContents = await readFile(path.join(tempDir, outDir, 'src', 'app.mjs'), 'utf8');
        const readmeContents = await readFile(path.join(tempDir, outDir, 'README.md'), 'utf8');

        assert.equal(exitCode, 0);
        assert.deepEqual(stderr, []);
        assert.match(stdout[0], /Generated template "sqlite-starter"/i);
        assert.equal(packageJson.name, 'acme-app');
        assert.match(appContents, /createSqliteSession/);
        assert.match(appContents, /tenantId: 'tenant_a'/);
        assert.match(readmeContents, /Starter SQLite service for OBJX/);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'sqlite driver executes queries and transactions against a real database',
    async () => {
      const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-sqlite-driver-'));
      const databasePath = path.join(tempDir, 'driver.sqlite');
      const database = new DatabaseSync(databasePath);

      try {
        database.exec(`
          create table task_items (
            id integer primary key,
            title text not null,
            done integer not null,
            createdAt text
          );
        `);

        const driver = createSqliteDriver({
          database,
          pragmas: ['foreign_keys = on'],
        });
        const session = createSqliteSession({
          driver,
        });

        const inserted = await session.execute(
          SqliteTask.insert({
            title: 'Ship OBJX',
            done: false,
            createdAt: '2026-03-31T10:00:00.000Z',
          }).returning(({ id, title, done, createdAt }) => [id, title, done, createdAt]),
          {
            hydrate: true,
          },
        );

        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].id, 1);
        assert.equal(inserted[0].done, false);
        assert.ok(inserted[0].createdAt instanceof Date);

        await assert.rejects(
          () =>
            session.transaction(async (transactionSession) => {
              await transactionSession.execute(
                SqliteTask.insert({
                  title: 'Rollback me',
                  done: true,
                }),
              );

              throw new Error('rollback');
            }),
          (error) => error?.cause?.message === 'rollback',
        );

        await session.transaction(async (transactionSession) => {
          await transactionSession.execute(
            SqliteTask.insert({
              title: 'Outer',
              done: true,
            }),
          );

          await assert.rejects(
            () =>
              transactionSession.transaction(async (nestedSession) => {
                await nestedSession.execute(
                  SqliteTask.insert({
                    title: 'Inner rollback',
                    done: true,
                  }),
                );

                throw new Error('nested rollback');
              }),
            (error) => error?.cause?.message === 'nested rollback',
          );

          await transactionSession.execute(
            SqliteTask.insert({
              title: 'Outer after nested',
              done: false,
            }),
          );
        });

        const rows = await session.execute(SqliteTask.query().orderBy(({ id }) => id), {
          hydrate: true,
        });

        assert.deepEqual(
          rows.map((row) => row.title),
          ['Ship OBJX', 'Outer', 'Outer after nested'],
        );
      } finally {
        database.close();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  ],
  [
    'tenant scope filters queries and injects tenant ids on insert',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await session.executionContextManager.run(
        {
          values: {
            tenantId: 'tenant_a',
          },
        },
        async () => {
          const visible = await session.execute(TenantProject.query(), {
            hydrate: true,
          });
          const inserted = await session.execute(
            TenantProject.insert({
              name: 'Gamma',
            }).returning(({ id, name, tenantId }) => [id, name, tenantId]),
            {
              hydrate: true,
            },
          );

          assert.equal(visible.length, 1);
          assert.equal(visible[0].name, 'Alpha');
          assert.equal(inserted.length, 1);
          assert.equal(inserted[0].tenantId, 'tenant_a');
          assert.equal(driver.tables.get('tenant_projects')[2].tenantId, 'tenant_a');
        },
      );
    },
  ],
  [
    'tenant scope rejects queries without tenant context and mismatched inserts',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await assert.rejects(
        () => session.execute(TenantProject.query()),
        /requires execution context value "tenantId"/i,
      );

      await session.executionContextManager.run(
        {
          values: {
            tenantId: 'tenant_a',
          },
        },
        async () => {
          await assert.rejects(
            () =>
              session.execute(
                TenantProject.insert({
                  name: 'Cross',
                  tenantId: 'tenant_b',
                }),
              ),
            /conflicts with tenant scope/i,
          );
        },
      );
    },
  ],
  [
    'tenant scope can be bypassed from execution context',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const visible = await session.executionContextManager.run(
        {
          values: {
            'objx.tenantScope.bypass': true,
          },
        },
        () => session.execute(TenantProject.query(), { hydrate: true }),
      );

      assert.equal(visible.length, 2);
    },
  ],
  [
    'session normalizes and hydrates select results',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      const rows = await session.execute(Person.query(), {
        hydrate: true,
      });

      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, 1);
      assert.equal(rows[0].active, true);
      assert.deepEqual(rows[0].profile, { role: 'admin' });
      assert.ok(rows[0].createdAt instanceof Date);
    },
  ],
  [
    'session materializes rowCount for update queries',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      const affectedRows = await session.execute(
        Person.update({
          name: 'Grace',
        }),
      );

      assert.equal(affectedRows, 3);
    },
  ],
  [
    'session normalizes raw SQL results',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      const result = await session.execute(sql`select 1 as value`);

      assert.equal(result.rowCount, 1);
      assert.deepEqual(result.rows, [{ value: 1 }]);
    },
  ],
  [
    'session eager loads one-to-many relations',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      const rows = await session.execute(
        Person.query().withRelated('pets'),
        {
          hydrate: true,
        },
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0].pets.length, 2);
      assert.equal(rows[0].pets[0].ownerId, 1);
      assert.equal(rows[0].pets[1].name, 'Lambda');
    },
  ],
  [
    'session inserts graph with hasMany relations',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const inserted = await session.insertGraph(
        Person,
        {
          name: 'Grace',
          active: false,
          profile: { role: 'writer' },
          createdAt: '2026-03-31T12:00:00.000Z',
          pets: [
            { name: 'Compiler' },
            { name: 'Debugger' },
          ],
        },
        {
          hydrate: true,
        },
      );

      assert.equal(driver.transactionCount, 1);
      assert.equal(inserted.id, 2);
      assert.equal(inserted.pets.length, 2);
      assert.equal(inserted.pets[0].ownerId, 2);
      assert.equal(inserted.pets[1].ownerId, 2);
      assert.ok(inserted.createdAt instanceof Date);
    },
  ],
  [
    'session inserts graph with belongsToOne relations before owner insert',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const inserted = await session.insertGraph(
        User,
        {
          email: 'dev@objx.dev',
          company: {
            name: 'OBJX Labs',
          },
        },
      );

      assert.equal(driver.transactionCount, 1);
      assert.equal(inserted.company.id, 1);
      assert.equal(inserted.companyId, 1);
      assert.equal(inserted.id, 1);
      assert.equal(driver.tables.get('companies')[0].name, 'OBJX Labs');
      assert.equal(driver.tables.get('users')[0].companyId, 1);
    },
  ],
  [
    'session upserts graph updating existing root and hasMany children',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const upserted = await session.upsertGraph(
        Person,
        {
          id: 1,
          name: 'Ada Lovelace',
          pets: [
            { id: 10, name: 'Turing Prime' },
            { name: 'Analyst' },
          ],
        },
        {
          hydrate: true,
        },
      );

      assert.equal(driver.transactionCount, 1);
      assert.equal(upserted.id, 1);
      assert.equal(upserted.name, 'Ada Lovelace');
      assert.equal(upserted.pets.length, 2);
      assert.equal(upserted.pets[0].id, 10);
      assert.equal(upserted.pets[0].name, 'Turing Prime');
      assert.equal(upserted.pets[1].ownerId, 1);
      assert.equal(driver.tables.get('people')[0].name, 'Ada Lovelace');
      assert.equal(driver.tables.get('pets').length, 3);
    },
  ],
  [
    'session upserts graph updating existing belongsToOne relations',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await session.insertGraph(User, {
        id: 1,
        email: 'dev@objx.dev',
        company: {
          id: 1,
          name: 'OBJX Labs',
        },
      });

      const upserted = await session.upsertGraph(User, {
        id: 1,
        email: 'platform@objx.dev',
        company: {
          id: 1,
          name: 'OBJX Labs 2',
        },
      });

      assert.equal(driver.transactionCount, 2);
      assert.equal(upserted.id, 1);
      assert.equal(upserted.email, 'platform@objx.dev');
      assert.equal(upserted.company.id, 1);
      assert.equal(upserted.company.name, 'OBJX Labs 2');
      assert.equal(driver.tables.get('users')[0].email, 'platform@objx.dev');
      assert.equal(driver.tables.get('companies')[0].name, 'OBJX Labs 2');
    },
  ],
  [
    'session relates and unrelates hasMany relations',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const insertedPets = await session.execute(
        Pet.insert({
          name: 'Orbit',
          ownerId: null,
        }).returning(({ id, name, ownerId }) => [id, name, ownerId]),
        {
          hydrate: true,
        },
      );
      const petId = insertedPets[0].id;

      const relateCount = await session.relate(Person, 1, 'pets', petId);
      assert.equal(relateCount, 1);
      assert.equal(driver.tables.get('pets')[2].ownerId, 1);

      const unrelateCount = await session.unrelate(Person, 1, 'pets', petId);
      assert.equal(unrelateCount, 1);
      assert.equal(driver.tables.get('pets')[2].ownerId, null);
    },
  ],
  [
    'session relates and unrelates belongsToOne relations',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await session.insertGraph(User, {
        id: 1,
        email: 'dev@objx.dev',
        company: {
          id: 1,
          name: 'OBJX Labs',
        },
      });
      await session.insertGraph(Company, {
        id: 2,
        name: 'Second Company',
      });

      const relateCount = await session.relate(User, 1, 'company', 2);
      assert.equal(relateCount, 1);
      assert.equal(driver.tables.get('users')[0].companyId, 2);

      const unrelateCount = await session.unrelate(User, 1, 'company', 2);
      assert.equal(unrelateCount, 1);
      assert.equal(driver.tables.get('users')[0].companyId, null);
    },
  ],
  [
    'session rejects unrelate for non-nullable foreign keys',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      await assert.rejects(
        () => session.unrelate(StrictPerson, 1, 'pets', 1),
        /not nullable/i,
      );
    },
  ],
  [
    'session rejects relate when related rows do not exist',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await session.insertGraph(User, {
        id: 1,
        email: 'dev@objx.dev',
        company: {
          id: 1,
          name: 'OBJX Labs',
        },
      });

      await assert.rejects(
        () => session.relate(User, 1, 'company', 999),
        /related row was not found/i,
      );
    },
  ],
  [
    'session clears hasOne relations during graph upsert when null is provided',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const upserted = await session.upsertGraph(Author, {
        id: 1,
        name: 'Ada',
        badge: null,
      });

      assert.equal(driver.transactionCount, 1);
      assert.equal(upserted.id, '1');
      assert.equal(upserted.badge, null);
      assert.equal(driver.tables.get('badges')[0].ownerId, null);
    },
  ],
  [
    'audit trail emits mutation entries with actor context',
    async () => {
      const entries = [];
      const AuditedCompany = defineModel({
        name: 'AuditedCompany',
        table: 'companies',
        columns: {
          id: col.int().primary(),
          name: col.text(),
        },
        plugins: [
          createAuditTrailPlugin({
            includeResult: true,
            emit(entry) {
              entries.push(entry);
            },
          }),
        ],
      });
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      await session.executionContextManager.run(
        {
          values: {
            actorId: 'user_123',
          },
        },
        async () => {
          await session.execute(
            AuditedCompany.insert({
              name: 'OBJX Labs',
            }).returning(({ id, name }) => [id, name]),
            {
              hydrate: true,
            },
          );
        },
      );

      assert.equal(entries.length, 1);
      assert.equal(entries[0].operation, 'insert');
      assert.equal(entries[0].model, 'AuditedCompany');
      assert.equal(entries[0].table, 'companies');
      assert.equal(entries[0].actorId, 'user_123');
      assert.equal(entries[0].rowCount, 1);
      assert.ok(entries[0].at instanceof Date);
      assert.ok(entries[0].executionContextId);
      assert.ok(Array.isArray(entries[0].result));
      assert.equal(entries[0].result[0].name, 'OBJX Labs');
    },
  ],
  [
    'soft delete excludes deleted rows by default and can include them explicitly',
    async () => {
      const session = createSession({
        driver: new FakeDriver(),
      });

      const visibleRows = await session.execute(Article.query(), {
        hydrate: true,
      });
      const allRows = await session.execute(
        Article.query().withSoftDeleted(),
        {
          hydrate: true,
        },
      );
      const onlyDeletedRows = await session.execute(
        Article.query().onlySoftDeleted(),
        {
          hydrate: true,
        },
      );

      assert.equal(visibleRows.length, 1);
      assert.equal(visibleRows[0].title, 'Visible');
      assert.equal(allRows.length, 2);
      assert.equal(onlyDeletedRows.length, 1);
      assert.equal(onlyDeletedRows[0].title, 'Archived');
      assert.ok(onlyDeletedRows[0].deletedAt instanceof Date);
    },
  ],
  [
    'soft delete rewrites delete into update and hardDelete removes the row',
    async () => {
      const driver = new FakeDriver();
      const session = createSession({
        driver,
      });

      const softDeletedCount = await session.execute(
        Article.delete().where(({ id }, operators) => operators.eq(id, 1)),
      );

      assert.equal(softDeletedCount, 1);
      assert.equal(driver.tables.get('articles').length, 2);
      assert.ok(driver.tables.get('articles')[0].deletedAt);

      const visibleRowsAfterSoftDelete = await session.execute(Article.query(), {
        hydrate: true,
      });
      assert.equal(visibleRowsAfterSoftDelete.length, 0);

      const hardDeletedCount = await session.execute(
        Article.delete()
          .withSoftDeleted()
          .hardDelete()
          .where(({ id }, operators) => operators.eq(id, 2)),
      );

      assert.equal(hardDeletedCount, 1);
      assert.equal(driver.tables.get('articles').length, 1);
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
  console.log(`all tests passed (${tests.length})`);
}

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { col, defineModel } from '@qbobjx/core';
import {
  ObjxValidationError,
  createAjvAdapter,
  createValidationPlugin,
  createValibotAdapter,
  createZodAdapter,
} from '@qbobjx/validation';
import {
  createSqliteDriver,
  createSqliteSession,
} from '../packages/sqlite-driver/dist/index.js';

async function withSqliteSession(run) {
  const tempDir = await mkdtemp(path.join(process.cwd(), 'tests', 'objx-validation-'));
  const databasePath = path.join(tempDir, 'validation.sqlite');
  const driver = createSqliteDriver({
    databasePath,
  });

  try {
    driver.database.exec(`
      create table task_items (
        id integer primary key,
        title text not null,
        done integer not null default 0
      );
    `);

    const session = createSqliteSession({
      driver,
    });

    return await run({
      session,
      database: driver.database,
      databasePath,
    });
  } finally {
    driver.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

const zodLikeInsertSchema = {
  safeParse(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return {
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              message: 'Expected an object.',
              path: [],
            },
          ],
        },
      };
    }

    const record = { ...input };
    const issues = [];

    if (typeof record.title !== 'string' || record.title.trim().length === 0) {
      issues.push({
        code: 'too_small',
        message: 'Title is required.',
        path: ['title'],
      });
    }

    if (typeof record.done === 'string') {
      if (record.done === 'true') {
        record.done = true;
      } else if (record.done === 'false') {
        record.done = false;
      }
    }

    if (typeof record.done !== 'boolean') {
      issues.push({
        code: 'invalid_type',
        message: 'Done must be boolean.',
        path: ['done'],
        expected: 'boolean',
        received: typeof record.done,
      });
    }

    if (issues.length > 0) {
      return {
        success: false,
        error: {
          issues,
        },
      };
    }

    return {
      success: true,
      data: record,
    };
  },
};

const ajvLike = {
  compile(schema) {
    const validator = (input) => {
      validator.errors = [];

      if (schema.mode === 'task-update' && typeof input.done !== 'boolean') {
        validator.errors.push({
          instancePath: '/done',
          keyword: 'type',
          message: 'must be boolean',
          params: {
            type: 'boolean',
          },
        });
        return false;
      }

      return true;
    };

    validator.errors = [];
    return validator;
  },
};

const valibotLike = {
  safeParse(schema, input) {
    return schema(input);
  },
};

const tests = [
  [
    'zod adapter validates and coerces insert payloads',
    async () => {
      await withSqliteSession(async ({ session }) => {
        const Task = defineModel({
          name: 'ValidatedTask',
          table: 'task_items',
          columns: {
            id: col.int().primary(),
            title: col.text(),
            done: col.boolean(),
          },
          plugins: [
            createValidationPlugin({
              adapter: createZodAdapter(),
              schemas: {
                insert: zodLikeInsertSchema,
              },
            }),
          ],
        });

        const inserted = await session.execute(
          Task.insert({
            title: 'Ship OBJX',
            done: 'true',
          }).returning(({ id, title, done }) => [id, title, done]),
          {
            hydrate: true,
          },
        );

        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].done, true);

        await assert.rejects(
          () =>
            session.execute(
              Task.insert({
                title: '',
                done: false,
              }),
            ),
          (error) =>
            error instanceof ObjxValidationError &&
            error.operation === 'insert' &&
            error.issues[0]?.path === 'title',
        );
      });
    },
  ],
  [
    'ajv adapter validates update payloads before SQL execution',
    async () => {
      await withSqliteSession(async ({ session }) => {
        const Task = defineModel({
          name: 'AjvTask',
          table: 'task_items',
          columns: {
            id: col.int().primary(),
            title: col.text(),
            done: col.boolean(),
          },
          plugins: [
            createValidationPlugin({
              adapter: createAjvAdapter({
                ajv: ajvLike,
              }),
              schemas: {
                update: {
                  mode: 'task-update',
                },
              },
            }),
          ],
        });

        await session.execute(
          Task.insert({
            id: 1,
            title: 'Ship OBJX',
            done: false,
          }),
        );

        await assert.rejects(
          () =>
            session.execute(
              Task.update({
                done: 'invalid',
              }).where(({ id }, operators) => operators.eq(id, 1)),
            ),
          (error) =>
            error instanceof ObjxValidationError &&
            error.operation === 'update' &&
            error.issues[0]?.path === 'done',
        );

        const updatedCount = await session.execute(
          Task.update({
            done: true,
          }).where(({ id }, operators) => operators.eq(id, 1)),
        );
        const rows = await session.execute(Task.query(), {
          hydrate: true,
        });

        assert.equal(updatedCount, 1);
        assert.equal(rows[0].done, true);
      });
    },
  ],
  [
    'insertGraph uses insertGraph validation schema',
    async () => {
      await withSqliteSession(async ({ session }) => {
        const Task = defineModel({
          name: 'GraphInsertTask',
          table: 'task_items',
          columns: {
            id: col.int().primary(),
            title: col.text(),
            done: col.boolean(),
          },
          plugins: [
            createValidationPlugin({
              adapter: createZodAdapter(),
              schemas: {
                insert: {
                  safeParse(input) {
                    return {
                      success: true,
                      data: input,
                    };
                  },
                },
                insertGraph: {
                  safeParse(input) {
                    if (typeof input?.title === 'string' && input.title.length >= 5) {
                      return {
                        success: true,
                        data: input,
                      };
                    }

                    return {
                      success: false,
                      error: {
                        issues: [
                          {
                            code: 'custom',
                            message: 'Graph inserts require a longer title.',
                            path: ['title'],
                          },
                        ],
                      },
                    };
                  },
                },
              },
            }),
          ],
        });

        await assert.rejects(
          () =>
            session.insertGraph(Task, {
              title: 'abc',
              done: true,
            }),
          (error) =>
            error instanceof ObjxValidationError &&
            error.operation === 'insertGraph' &&
            error.issues[0]?.path === 'title',
        );

        const inserted = await session.insertGraph(Task, {
          title: 'valid graph',
          done: true,
        });

        assert.equal(inserted.title, 'valid graph');
      });
    },
  ],
  [
    'upsertGraph uses upsertGraph validation schema through valibot adapter',
    async () => {
      await withSqliteSession(async ({ session }) => {
        const Task = defineModel({
          name: 'GraphUpsertTask',
          table: 'task_items',
          columns: {
            id: col.int().primary(),
            title: col.text(),
            done: col.boolean(),
          },
          plugins: [
            createValidationPlugin({
              adapter: createValibotAdapter(valibotLike),
              schemas: {
                upsertGraph(input) {
                  if (typeof input.done === 'boolean' && input.done === true) {
                    return {
                      success: true,
                      output: input,
                    };
                  }

                  return {
                    success: false,
                    issues: [
                      {
                        type: 'boolean',
                        message: 'Graph upserts require done=true.',
                        path: [{ key: 'done' }],
                      },
                    ],
                  };
                },
              },
            }),
          ],
        });

        await session.execute(
          Task.insert({
            id: 1,
            title: 'seed',
            done: true,
          }),
        );

        await assert.rejects(
          () =>
            session.upsertGraph(Task, {
              id: 1,
              title: 'seed',
              done: false,
            }),
          (error) =>
            error instanceof ObjxValidationError &&
            error.operation === 'upsertGraph' &&
            error.issues[0]?.path === 'done',
        );

        const updated = await session.upsertGraph(
          Task,
          {
            id: 1,
            title: 'seed',
            done: true,
          },
          {
            hydrate: true,
          },
        );

        assert.equal(updated.done, true);
      });
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
  console.log(`all validation tests passed (${tests.length})`);
}

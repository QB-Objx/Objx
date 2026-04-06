import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createExecutionContextManager } from '../../../packages/core/dist/index.js';
import {
  identifier,
  sql,
} from '../../../packages/sql-engine/dist/index.js';
import { createSqliteSession } from '../../../packages/sqlite-driver/dist/index.js';
import {
  Project,
  Task,
  auditTrailEntries,
} from './models.mjs';

const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(exampleDir, 'schema.sql');
const databasePath = path.join(exampleDir, 'app.sqlite');
const database = new DatabaseSync(databasePath);

database.exec(await readFile(schemaPath, 'utf8'));

const executionContextManager = createExecutionContextManager();
const session = createSqliteSession({
  database,
  executionContextManager,
  hydrateByDefault: true,
  pragmas: ['foreign_keys = on'],
});

auditTrailEntries.length = 0;

const projectId = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
      actorId: 'user_admin',
    },
  },
  async () => {
    const insertedProject = await session.insertGraph(
      Project,
      {
        name: 'Core Runtime',
        status: 'planned',
        company: {
          name: 'OBJX Labs',
        },
        owner: {
          email: 'owner@objx.dev',
        },
        tasks: [
          {
            title: 'Design query planner',
            status: 'todo',
            assignee: {
              email: 'platform@objx.dev',
            },
            comments: [
              {
                body: 'Kickoff with architecture review.',
                author: {
                  email: 'lead@objx.dev',
                },
              },
            ],
          },
        ],
      },
      {
        hydrate: true,
      },
    );

    await session.upsertGraph(
      Project,
      {
        id: insertedProject.id,
        status: 'in_progress',
        tasks: [
          {
            id: insertedProject.tasks[0].id,
            title: 'Design typed query planner',
            status: 'doing',
          },
          {
            title: 'Ship private beta',
            status: 'todo',
          },
        ],
      },
      {
        hydrate: true,
      },
    );

    const detachedRows = await session.execute(
      Task.insert({
        title: 'Detached task',
        status: 'todo',
      }).returning(({ id, title }) => [id, title]),
      {
        hydrate: true,
      },
    );
    const detachedTaskId = detachedRows[0].id;

    await session.relate(Project, insertedProject.id, 'tasks', detachedTaskId);
    await session.unrelate(Project, insertedProject.id, 'tasks', detachedTaskId);

    await session.execute(
      Task.delete().where(({ id }, operators) => operators.eq(id, detachedTaskId)),
    );

    return insertedProject.id;
  },
);

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_b',
      actorId: 'user_tenant_b',
    },
  },
  async () => {
    await session.insertGraph(Project, {
      name: 'Tenant B Project',
      status: 'active',
      company: {
        name: 'Tenant B Co',
      },
      owner: {
        email: 'b.owner@objx.dev',
      },
      tasks: [
        {
          title: 'Tenant B kickoff',
          status: 'todo',
        },
      ],
    });
  },
);

const projectSnapshot = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () =>
    session.execute(
      Project.query()
        .where(({ id, status, ownerId }, operators) =>
          operators.and(
            operators.eq(id, projectId),
            operators.or(
              operators.eq(status, 'planned'),
              operators.eq(status, 'in_progress'),
            ),
            operators.isNotNull(ownerId),
          ),
        )
        .withRelated({
          company: true,
          owner: true,
          tasks: {
            assignee: true,
            comments: {
              author: true,
            },
          },
        }),
    ),
);

const compiledJoin = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () =>
    session.compile(
      Project.query()
        .where(({ id, status, ownerId }, operators) =>
          operators.and(
            operators.eq(id, projectId),
            operators.or(
              operators.eq(status, 'planned'),
              operators.eq(status, 'in_progress'),
            ),
            operators.isNotNull(ownerId),
          ),
        )
        .joinRelated({
          owner: true,
          tasks: {
            assignee: true,
            comments: true,
          },
        }),
    ),
);

const rawTaskCountResult = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () =>
    session.execute(
      sql`select count(*) as ${identifier('totalTasks')} from ${identifier('tasks')} where ${identifier('tasks', 'project_id')} = ${projectId}`,
    ),
);

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
      actorId: 'user_admin',
    },
  },
  async () => {
    await session.transaction(async (transactionSession) => {
      await transactionSession.execute(
        Task.insert({
          projectId,
          title: 'Outer transaction task',
          status: 'todo',
        }),
      );

      try {
        await transactionSession.transaction(async (nestedSession) => {
          await nestedSession.execute(
            Task.insert({
              projectId,
              title: 'Nested rollback task',
              status: 'todo',
            }),
          );

          throw new Error('force nested rollback');
        });
      } catch (error) {
        if (!(error instanceof Error) || error.cause?.message !== 'force nested rollback') {
          throw error;
        }
      }
    });
  },
);

const tenantAVisibleTasks = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () => session.execute(Task.query().where(({ projectId: projectIdColumn }, operators) => operators.eq(projectIdColumn, projectId))),
);

const tenantAAllTasks = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
    },
  },
  () =>
    session.execute(
      Task.query()
        .withSoftDeleted()
        .where(({ projectId: projectIdColumn }, operators) => operators.eq(projectIdColumn, projectId)),
    ),
);

const allTenantProjects = await executionContextManager.run(
  {
    values: {
      'objx.tenantScope.bypass': true,
    },
  },
  () => session.execute(Project.query().withSoftDeleted()),
);

const summary = {
  projectId,
  tenantAProjectCount: projectSnapshot.length,
  tenantAVisibleTaskCount: tenantAVisibleTasks.length,
  tenantAAllTaskCount: tenantAAllTasks.length,
  crossTenantProjectCount: allTenantProjects.length,
  rawTaskCount: Number(rawTaskCountResult.rows[0]?.totalTasks ?? 0),
  auditEntryCount: auditTrailEntries.length,
  compiledJoinSql: compiledJoin.sql,
  firstProjectSnapshot: projectSnapshot[0],
};

console.log(JSON.stringify(summary, null, 2));

database.close();

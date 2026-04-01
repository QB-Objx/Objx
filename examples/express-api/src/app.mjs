import process from 'node:process';
import express from 'express';
import { ObjxValidationError } from '@qbobjx/validation';
import {
  auditTrailEntries,
  closeDatabase,
  executionContextManager,
  session,
} from './db.mjs';
import { Project, Task } from './models.mjs';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseId(rawValue, label) {
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`Invalid ${label}.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function applySoftDeleteMode(builder, mode) {
  if (mode === 'include') {
    return builder.withSoftDeleted();
  }

  if (mode === 'only') {
    return builder.onlySoftDeleted();
  }

  return builder;
}

async function loadProject(projectId, deleted = 'default') {
  let query = Project.query()
    .where(({ id }, op) => op.eq(id, projectId))
    .withRelated({
      tasks: true,
    });

  query = applySoftDeleteMode(query, deleted);

  const rows = await session.execute(query);
  return rows[0] ?? null;
}

async function seedDemoTenant() {
  await executionContextManager.run(
    {
      values: {
        tenantId: 'demo',
        actorId: 'seed',
      },
    },
    async () => {
      const existing = await session.execute(
        Project.query().where(({ status }, op) => op.eq(status, 'planned')).limit(1),
      );

      if (existing.length > 0) {
        return;
      }

      await session.insertGraph(
        Project,
        {
          name: 'OBJX Express API',
          status: 'planned',
          tasks: [
            {
              title: 'Wire CRUD routes',
              status: 'doing',
            },
            {
              title: 'Document the API',
              status: 'todo',
            },
          ],
        },
        {
          hydrate: true,
        },
      );
    },
  );
}

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    packageScope: '@qbobjx',
  });
});

app.use((req, res, next) => {
  const tenantId = req.header('x-tenant-id');

  if (!tenantId) {
    res.status(400).json({
      error: 'missing_tenant_id',
      message: 'Provide the x-tenant-id header for tenant-scoped requests.',
    });
    return;
  }

  executionContextManager.run(
    {
      values: {
        tenantId,
        actorId: req.header('x-actor-id') ?? 'anonymous',
      },
    },
    next,
  );
});

app.get('/projects', wrap(async (req, res) => {
  const deleted = typeof req.query.deleted === 'string' ? req.query.deleted : 'default';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  let query = Project.query()
    .withRelated({
      tasks: true,
    })
    .orderBy(({ id }) => id, 'desc');

  query = applySoftDeleteMode(query, deleted);

  if (status) {
    query = query.where(({ status: statusColumn }, op) => op.eq(statusColumn, status));
  }

  const rows = await session.execute(query);

  res.json({
    data: rows,
  });
}));

app.get('/projects/:projectId', wrap(async (req, res) => {
  const projectId = parseId(req.params.projectId, 'projectId');
  const deleted = typeof req.query.deleted === 'string' ? req.query.deleted : 'default';
  const project = await loadProject(projectId, deleted);

  if (!project) {
    res.status(404).json({
      error: 'project_not_found',
    });
    return;
  }

  res.json({
    data: project,
  });
}));

app.post('/projects', wrap(async (req, res) => {
  const graph = {
    name: req.body?.name,
    ...(req.body?.status !== undefined ? { status: req.body.status } : {}),
    ...(Array.isArray(req.body?.tasks)
      ? {
          tasks: req.body.tasks.map((task) => ({
            title: task?.title,
            ...(task?.status !== undefined ? { status: task.status } : {}),
          })),
        }
      : {}),
  };

  const inserted = await session.insertGraph(Project, graph, {
    hydrate: true,
  });
  const project = await loadProject(inserted.id, 'include');

  res.status(201).json({
    data: project,
  });
}));

app.patch('/projects/:projectId', wrap(async (req, res) => {
  const projectId = parseId(req.params.projectId, 'projectId');
  const values = {};

  if (req.body?.name !== undefined) {
    values.name = req.body.name;
  }

  if (req.body?.status !== undefined) {
    values.status = req.body.status;
  }

  const updated = await session.execute(
    Project.update(values)
      .where(({ id }, op) => op.eq(id, projectId))
      .returning(({ id }) => [id]),
    {
      hydrate: true,
    },
  );

  if (updated.length === 0) {
    res.status(404).json({
      error: 'project_not_found',
    });
    return;
  }

  const project = await loadProject(projectId, 'include');

  res.json({
    data: project,
  });
}));

app.post('/projects/:projectId/tasks', wrap(async (req, res) => {
  const projectId = parseId(req.params.projectId, 'projectId');
  const project = await loadProject(projectId, 'include');

  if (!project) {
    res.status(404).json({
      error: 'project_not_found',
    });
    return;
  }

  const inserted = await session.execute(
    Task.insert({
      projectId,
      title: req.body?.title,
      ...(req.body?.status !== undefined ? { status: req.body.status } : {}),
    }).returning(({ id, projectId, title, status }) => [id, projectId, title, status]),
    {
      hydrate: true,
    },
  );

  res.status(201).json({
    data: inserted[0],
  });
}));

app.post('/projects/:projectId/complete', wrap(async (req, res) => {
  const projectId = parseId(req.params.projectId, 'projectId');

  const completedProject = await session.transaction(async (transactionSession) => {
    const rows = await transactionSession.execute(
      Project.query()
        .withSoftDeleted()
        .where(({ id }, op) => op.eq(id, projectId))
        .limit(1),
    );

    if (rows.length === 0) {
      return null;
    }

    await transactionSession.execute(
      Task.update({
        status: 'done',
      })
        .withSoftDeleted()
        .where(({ projectId: taskProjectId }, op) => op.eq(taskProjectId, projectId)),
    );

    const updated = await transactionSession.execute(
      Project.update({
        status: 'completed',
      })
        .withSoftDeleted()
        .where(({ id }, op) => op.eq(id, projectId))
        .returning(({ id }) => [id]),
      {
        hydrate: true,
      },
    );

    return updated[0] ?? null;
  });

  if (!completedProject) {
    res.status(404).json({
      error: 'project_not_found',
    });
    return;
  }

  const project = await loadProject(projectId, 'include');

  res.json({
    data: project,
  });
}));

app.delete('/projects/:projectId', wrap(async (req, res) => {
  const projectId = parseId(req.params.projectId, 'projectId');
  const deletedCount = await session.execute(
    Project.delete().where(({ id }, op) => op.eq(id, projectId)),
  );

  if (deletedCount === 0) {
    res.status(404).json({
      error: 'project_not_found',
    });
    return;
  }

  res.status(204).end();
}));

app.get('/audit', (_req, res) => {
  res.json({
    data: auditTrailEntries,
  });
});

app.use((error, _req, res, next) => {
  void next;

  if (error instanceof ObjxValidationError) {
    res.status(422).json({
      error: 'validation_failed',
      message: error.message,
      issues: error.issues,
    });
    return;
  }

  const statusCode =
    typeof error?.statusCode === 'number' && error.statusCode >= 400
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    error: statusCode === 500 ? 'internal_server_error' : 'request_failed',
    message: error instanceof Error ? error.message : 'Unexpected error.',
  });
});

await seedDemoTenant();

const server = app.listen(port, () => {
  console.log(`OBJX Express API listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

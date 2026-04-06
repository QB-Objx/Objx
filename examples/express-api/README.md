# OBJX Express API

Example REST API built with Express using `OBJX` as ORM/query builder.

## What This Example Shows

- SQLite session with `@qbobjx/sqlite-driver`
- global plugins configured at session creation time
- `createSnakeCaseNamingPlugin()` with camelCase models over snake_case columns
- `tenant scope`, `soft delete`, and `audit trail`
- model-level validation with `@qbobjx/validation` + `zod`
- `insertGraph`, eager loading, and transactions
- HTTP middleware that injects `tenantId` and `actorId` into `ExecutionContext`

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Default server:

- `http://127.0.0.1:3000`

The schema in `schema.sql` is applied automatically during bootstrap.
That schema uses physical columns like `tenant_id`, `project_id`, and `deleted_at`, while the
application code keeps logical keys such as `tenantId`, `projectId`, and `deletedAt`.

## Headers

Business routes require:

- `x-tenant-id`

Optionally:

- `x-actor-id`

Example:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3000/projects
```

## Routes

- `GET /health`
- `GET /projects`
- `GET /projects/:projectId`
- `POST /projects`
- `PATCH /projects/:projectId`
- `POST /projects/:projectId/tasks`
- `POST /projects/:projectId/complete`
- `DELETE /projects/:projectId`
- `GET /audit`

## Basic Flow

Create a project with tasks:

```bash
curl -X POST http://127.0.0.1:3000/projects \
  -H "content-type: application/json" \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  -d '{
    "name": "Launch API",
    "status": "planned",
    "tasks": [
      { "title": "Ship CRUD", "status": "doing" },
      { "title": "Write docs", "status": "todo" }
    ]
  }'
```

List projects with relations:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3000/projects
```

Complete a project inside a transaction:

```bash
curl -X POST \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  http://127.0.0.1:3000/projects/1/complete
```

Soft delete:

```bash
curl -X DELETE \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  http://127.0.0.1:3000/projects/1
```

Query including deleted rows:

```bash
curl -H "x-tenant-id: demo" \
  "http://127.0.0.1:3000/projects?deleted=include"
```

## Files

- `schema.sql`: SQLite schema
- `src/db.mjs`: session bootstrap and global plugins
- `src/models.mjs`: models and validation
- `src/app.mjs`: Express API

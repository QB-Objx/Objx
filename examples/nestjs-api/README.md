# OBJX NestJS API

Example API built with NestJS using `@qbobjx/nestjs` on top of SQLite.

## What This Example Shows

- `ObjxModule.forRootAsync(...)` with a ready-to-use OBJX session
- request context via the package global interceptor
- global filter for `ObjxValidationError`
- `tenant scope`, `soft delete`, `audit trail`, and validation
- migrations and seeds with `@qbobjx/codegen`
- transactions, eager loading, and `insertGraph`

## Install

```bash
npm install
```

## Database

This example follows the migration/seed workflow:

- `db/migrations/*.migration.mjs`
- `db/seeds/*.seed.mjs`
- schema is not applied automatically when the API starts

Prepare the database before starting the app:

```bash
npm run db:setup
```

Or run step by step:

```bash
npm run db:migrate
npm run db:seed
```

To revert:

```bash
npm run db:seed:revert
npm run db:migrate:down
```

## Run

```bash
npm run dev
```

Default server:

- `http://127.0.0.1:3001`

## Headers

Business routes use:

- `x-tenant-id`

Optionally:

- `x-actor-id`
- `x-request-id`

## Routes

- `GET /health`
- `GET /audit`
- `GET /projects`
- `GET /projects/:projectId`
- `POST /projects`
- `PATCH /projects/:projectId`
- `POST /projects/:projectId/tasks`
- `POST /projects/:projectId/complete`
- `DELETE /projects/:projectId`

## Quick Example

List seeded projects:

```bash
curl -H "x-tenant-id: demo" http://127.0.0.1:3001/projects
```

Create a project with tasks:

```bash
curl -X POST http://127.0.0.1:3001/projects \
  -H "content-type: application/json" \
  -H "x-tenant-id: demo" \
  -H "x-actor-id: cli" \
  -d '{
    "name": "Build Nest API",
    "status": "planned",
    "tasks": [
      { "title": "Wire providers", "status": "doing" },
      { "title": "Ship controller", "status": "todo" }
    ]
  }'
```

## Files

- `db/migrations`: versioned schema
- `db/seeds`: versioned initial data
- `src/objx.options.ts`: `ObjxModule` factory
- `src/models.ts`: models and validation
- `src/projects.service.ts`: application rules
- `src/projects.controller.ts`: REST routes
- `src/main.ts`: NestJS bootstrap

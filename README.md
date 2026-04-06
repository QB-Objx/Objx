# OBJX

`OBJX` is a SQL-first ORM for TypeScript inspired by Objection.js and redesigned with an embedded SQL engine, modern runtime, and first-class extensibility.

Current project status:

- typed models with `defineModel`
- typed query builder and embedded SQL compiler
- official drivers for SQLite, Postgres, and MySQL
- `insertGraph`, `upsertGraph`, `relate`, `unrelate`
- simple eager loading, nested eager loading, and composed relation expressions
- official plugins for `timestamps`, `snake case naming`, `soft delete`, `audit trail`, and `tenant scope`
- codegen, SQLite introspection, templates, typed migrations, and typed seeds

## Packages

Published workspace packages:

- `@qbobjx/core`: models, columns, relations, query builder, and execution context
- `@qbobjx/sql-engine`: SQL compiler, session runtime, raw SQL helpers, and execution engine
- `@qbobjx/sqlite-driver`: official SQLite session/driver
- `@qbobjx/postgres-driver`: official Postgres session/driver
- `@qbobjx/mysql-driver`: official MySQL session/driver
- `@qbobjx/nestjs`: official NestJS integration with dynamic module, request context, and validation filter
- `@qbobjx/plugins`: official plugins
- `@qbobjx/codegen`: introspection, templates, codegen, migrations, and seeds
- `@qbobjx/validation`: official validation adapters and runtime contracts

## Installation

Happy path for SQLite:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/sqlite-driver @qbobjx/plugins
```

For Postgres:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/postgres-driver @qbobjx/plugins pg
```

For MySQL:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/mysql-driver @qbobjx/plugins mysql2
```

For tooling and codegen:

```bash
npm install -D @qbobjx/codegen
```

For NestJS integration:

```bash
npm install @qbobjx/nestjs @nestjs/common @nestjs/core @nestjs/platform-express rxjs reflect-metadata
```

## Quick Start

Minimal example with SQLite, execution context, plugins, and a typed query:

```ts
import {
  belongsToOne,
  col,
  createExecutionContextManager,
  defineModel,
  hasMany,
} from '@qbobjx/core';
import { createSqliteSession } from '@qbobjx/sqlite-driver';
import {
  createAuditTrailPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@qbobjx/plugins';

const auditEntries: unknown[] = [];

const Company = defineModel({
  name: 'Company',
  table: 'companies',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text(),
  },
  plugins: [createTenantScopePlugin()],
});

const User = defineModel({
  name: 'User',
  table: 'users',
  columns: {
    id: col.int().primary(),
    email: col.text(),
    companyId: col.int().nullable(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (user) => ({
    company: belongsToOne(() => Company, {
      from: user.columns.companyId,
      to: Company.columns.id,
    }),
  }),
  plugins: [
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
    createAuditTrailPlugin({
      actorKey: 'actorId',
      emit(entry) {
        auditEntries.push(entry);
      },
    }),
  ],
});

const Project = defineModel({
  name: 'Project',
  table: 'projects',
  columns: {
    id: col.int().primary(),
    companyId: col.int(),
    ownerId: col.int().nullable(),
    name: col.text(),
    status: col.text(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  relations: (project) => ({
    company: belongsToOne(() => Company, {
      from: project.columns.companyId,
      to: Company.columns.id,
    }),
    owner: belongsToOne(() => User, {
      from: project.columns.ownerId,
      to: User.columns.id,
    }),
    members: hasMany(() => User, {
      from: project.columns.companyId,
      to: User.columns.companyId,
    }),
  }),
  plugins: [createTenantScopePlugin(), createSoftDeletePlugin()],
});

const executionContextManager = createExecutionContextManager();
const session = createSqliteSession({
  databasePath: './app.sqlite',
  executionContextManager,
  hydrateByDefault: true,
  pragmas: ['foreign_keys = on'],
});

const rows = await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
      actorId: 'user_admin',
    },
  },
  () =>
    session.execute(
      Project.query()
        .where(({ status }, op) => op.eq(status, 'active'))
        .withRelated({
          company: true,
          owner: true,
        }),
    ),
);

console.log(rows);
```

## Defining Models

Available core column builders:

- `col.int()`
- `col.bigint()` / `col.bigInt()`
- `col.text()`
- `col.boolean()`
- `col.json<T>()`
- `col.uuid()`
- `col.timestamp()`
- `col.custom<T, TKind>()`

Common helpers:

- `.primary()`
- `.nullable()`
- `.default(value)`
- `.generated()`
- `.configure({ ... })`

Example:

```ts
import { col, defineModel } from '@qbobjx/core';

export const Task = defineModel({
  name: 'Task',
  table: 'tasks',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    done: col.boolean().default(false),
    snowflakeId: col.bigInt().default(() => 9007199254740993n),
    metadata: col.json<{ priority: 'low' | 'high' }>().nullable(),
    createdAt: col.timestamp(),
  },
});
```

Use `.generated()` for columns that are filled by the runtime, plugins or graph mutation plumbing, such as tenant ids and relation-owned foreign keys.

## Column Naming

The explicit path is configuring `dbName` per column:

```ts
import { col, defineModel } from '@qbobjx/core';

export const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text().configure({ dbName: 'tenant_id' }),
    createdAt: col.timestamp().configure({ dbName: 'created_at' }),
  },
});
```

If you prefer convention over repetition, use the official snake case naming plugin:

```ts
import { col, defineModel } from '@qbobjx/core';
import { createSnakeCaseNamingPlugin } from '@qbobjx/plugins';

export const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    createdAt: col.timestamp(),
  },
  plugins: [
    createSnakeCaseNamingPlugin({
      exclude: ['id'],
      overrides: {
        createdAt: 'created_on',
      },
    }),
  ],
});
```

The SQL compiler uses the configured database column names for `select`, `insert`, `update`, and predicates, and hydration maps result rows back to model keys.

## Relations

Supported relation builders:

- `belongsToOne`
- `hasOne`
- `hasMany`
- `manyToMany`

Example with `belongsToOne` and `hasMany`:

```ts
import { belongsToOne, col, defineModel, hasMany } from '@qbobjx/core';

export const Author = defineModel({
  table: 'authors',
  columns: {
    id: col.int().primary(),
    name: col.text(),
  },
});

export const Article = defineModel({
  table: 'articles',
  columns: {
    id: col.int().primary(),
    authorId: col.int(),
    title: col.text(),
  },
  relations: (article) => ({
    author: belongsToOne(() => Author, {
      from: article.columns.authorId,
      to: Author.columns.id,
    }),
    comments: hasMany(() => Comment, {
      from: article.columns.id,
      to: Comment.columns.articleId,
    }),
  }),
});

export const Comment = defineModel({
  table: 'comments',
  columns: {
    id: col.int().primary(),
    articleId: col.int(),
    body: col.text(),
  },
  relations: (comment) => ({
    article: belongsToOne(() => Article, {
      from: comment.columns.articleId,
      to: Article.columns.id,
    }),
  }),
});
```

Example with `manyToMany`:

```ts
import { col, defineModel, manyToMany } from '@qbobjx/core';

const Tag = defineModel({
  table: 'tags',
  columns: {
    id: col.int().primary(),
    name: col.text(),
  },
});

const ArticleTag = defineModel({
  table: 'article_tags',
  columns: {
    articleId: col.int(),
    tagId: col.int(),
    kind: col.text().nullable(),
  },
});

const ArticleWithTags = defineModel({
  table: 'articles',
  columns: {
    id: col.int().primary(),
    title: col.text(),
  },
  relations: (article) => ({
    tags: manyToMany(() => Tag, {
      from: article.columns.id,
      to: Tag.columns.id,
      through: {
        from: ArticleTag.columns.articleId,
        to: ArticleTag.columns.tagId,
        extras: ['kind'],
      },
    }),
  }),
});
```

## Configuring The Connection

OBJX does not create network connections by itself. You provide a SQLite database or a pool/client compatible with an official driver.

### SQLite

Simple setup:

```ts
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const session = createSqliteSession({
  databasePath: './app.sqlite',
  pragmas: ['foreign_keys = on'],
  hydrateByDefault: true,
});
```

Using your own `DatabaseSync`:

```ts
import { DatabaseSync } from 'node:sqlite';
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const database = new DatabaseSync('./app.sqlite');

const session = createSqliteSession({
  database,
  hydrateByDefault: true,
});
```

### Postgres

The driver expects something compatible with `pg`:

```ts
import { Pool } from 'pg';
import { createPostgresSession } from '@qbobjx/postgres-driver';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const session = createPostgresSession({
  pool,
  hydrateByDefault: true,
});
```

You can also pass a `client` instead of a `pool`.

### MySQL

The driver expects something compatible with `mysql2/promise`:

```ts
import mysql from 'mysql2/promise';
import { createMySqlSession } from '@qbobjx/mysql-driver';

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
});

const session = createMySqlSession({
  pool,
  hydrateByDefault: true,
});
```

You can also pass a `client` instead of a `pool`.

## Execution Context

Execution context is used for:

- tenant scope
- actor id for audit
- tracing
- ambient transactions
- request metadata

In Node.js, `ExecutionContextManager` uses `AsyncLocalStorage` by default.

```ts
import { createExecutionContextManager } from '@qbobjx/core';

const executionContextManager = createExecutionContextManager();

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
      actorId: 'user_123',
      requestId: 'req_001',
    },
  },
  async () => {
    await session.execute(Project.query());
  },
);
```

If you pass `executionContextManager` when creating a session, `session.execute(...)` and `session.transaction(...)` reuse that context automatically.

## Running Queries

`session.execute(...)` accepts:

- typed builders (`model.query()`, `model.insert()`, `model.update()`, `model.delete()`)
- internal AST
- raw SQL via `sql\`\``
- compiled query output from `session.compile(...)`

### Select

```ts
const projects = await session.execute(
  Project.query()
    .select(({ id, name, status }) => [id, name, status])
    .where(({ status }, op) => op.eq(status, 'active'))
    .orderBy(({ id }) => id, 'desc')
    .limit(20)
    .offset(0),
);
```

### Composed Predicates

```ts
const rows = await session.execute(
  Project.query().where(({ id, status, ownerId }, op) =>
    op.and(
      op.or(op.eq(id, 1), op.eq(status, 'planned')),
      op.isNotNull(ownerId),
    ),
  ),
);
```

### Insert

```ts
const inserted = await session.execute(
  Project.insert({
    companyId: 1,
    ownerId: 2,
    name: 'OBJX',
    status: 'planned',
    tenantId: 'tenant_a',
  }).returning(({ id, name, status }) => [id, name, status]),
  { hydrate: true },
);
```

### Update

Without `returning`, the default result is affected row count:

```ts
const count = await session.execute(
  Project.update({ status: 'active' }).where(({ id }, op) => op.eq(id, 1)),
);
```

With `returning`, the result is a typed array:

```ts
const updated = await session.execute(
  Project.update({ status: 'active' })
    .where(({ id }, op) => op.eq(id, 1))
    .returning(({ id, status }) => [id, status]),
  { hydrate: true },
);
```

### Delete

```ts
const deletedCount = await session.execute(
  Project.delete().where(({ id }, op) => op.eq(id, 1)),
);
```

If the model uses `soft delete`, `delete()` is rewritten to `update`. For hard delete:

```ts
await session.execute(
  Project.delete().hardDelete().where(({ id }, op) => op.eq(id, 1)),
);
```

## Eager Loading And Join Planning

Typed eager loading:

```ts
const rows = await session.execute(
  Project.query().withRelated({
    company: true,
    owner: true,
    tasks: {
      assignee: true,
      comments: {
        author: true,
      },
    },
  }),
  { hydrate: true },
);
```

String expression eager loading also works:

```ts
await session.execute(
  Project.query().withRelated('tasks.comments.author'),
  { hydrate: true },
);
```

Relation join planning:

```ts
const compiled = session.compile(
  Project.query().joinRelated({
    owner: true,
    tasks: {
      assignee: true,
    },
  }),
);

console.log(compiled.sql);
console.log(compiled.parameters);
```

## Graph Operations

### insertGraph

```ts
const project = await session.insertGraph(
  Project,
  {
    name: 'Core Runtime',
    status: 'planned',
    company: {
      name: 'OBJX Labs',
      tenantId: 'tenant_a',
    },
    owner: {
      email: 'owner@objx.dev',
      tenantId: 'tenant_a',
    },
    tasks: [
      {
        title: 'Ship alpha',
        status: 'todo',
        tenantId: 'tenant_a',
      },
    ],
    tenantId: 'tenant_a',
  },
  {
    hydrate: true,
  },
);
```

### upsertGraph

```ts
const updated = await session.upsertGraph(
  Project,
  {
    id: 1,
    status: 'in_progress',
    tasks: [
      { id: 10, title: 'Typed planner' },
      { title: 'Private beta' },
    ],
  },
  {
    hydrate: true,
  },
);
```

### relate / unrelate

```ts
await session.relate(Project, 1, 'tasks', 99);
await session.unrelate(Project, 1, 'tasks', 99);
```

## Transactions

Every official session supports `session.transaction(...)`.

### Basic Transaction

```ts
await session.transaction(async (trxSession) => {
  await trxSession.execute(
    Project.insert({
      companyId: 1,
      name: 'Inside transaction',
      status: 'planned',
      tenantId: 'tenant_a',
    }),
  );

  await trxSession.execute(
    Project.update({ status: 'active' }).where(({ id }, op) => op.eq(id, 1)),
  );
});
```

### Transaction Metadata

```ts
await session.transaction(
  async (trxSession) => {
    await trxSession.execute(Project.query().limit(1));
  },
  {
    metadata: {
      operation: 'project-bootstrap',
    },
  },
);
```

### Nested Transactions

Nested transaction uses savepoints when the driver supports them:

```ts
await session.transaction(async (trxSession) => {
  await trxSession.execute(
    Project.insert({
      companyId: 1,
      name: 'Outer',
      status: 'planned',
      tenantId: 'tenant_a',
    }),
  );

  try {
    await trxSession.transaction(async (nestedSession) => {
      await nestedSession.execute(
        Project.insert({
          companyId: 1,
          name: 'Nested',
          status: 'planned',
          tenantId: 'tenant_a',
        }),
      );

      throw new Error('rollback nested');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.cause?.message !== 'rollback nested') {
      throw error;
    }
  }
});
```

## Official Plugins

Plugins are attached to models:

```ts
import {
  createAuditTrailPlugin,
  createSnakeCaseNamingPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
  createTimestampsPlugin,
} from '@qbobjx/plugins';

const auditEntries: unknown[] = [];

const Article = defineModel({
  table: 'articles',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    tenantId: col.text(),
    createdAt: col.timestamp(),
    updatedAt: col.timestamp(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createSnakeCaseNamingPlugin(),
    createTimestampsPlugin(),
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
    createAuditTrailPlugin({
      actorKey: 'actorId',
      emit(entry) {
        auditEntries.push(entry);
      },
    }),
  ],
});
```

### snake case naming

`createSnakeCaseNamingPlugin()` maps model keys like `tenantId` and `createdAt` to `tenant_id` and `created_at` during model definition.

Options:

- `exclude`: keeps selected model keys unchanged
- `overrides`: provides explicit physical column names for specific keys

### soft delete

Relevant API:

- `query().withSoftDeleted()`
- `query().onlySoftDeleted()`
- `delete().hardDelete()`

### tenant scope

By default, the plugin uses:

- column: `tenantId`
- context key: `tenantId`
- bypass key: `objx.tenantScope.bypass`

Explicit bypass:

```ts
await session.executionContextManager.run(
  {
    values: {
      'objx.tenantScope.bypass': true,
    },
  },
  () => session.execute(Project.query().withSoftDeleted()),
);
```

### audit trail

The plugin reads `actorId` from context and emits audit entries for `insert`, `update`, and `delete` by default.

## Hydration

Hydration converts values based on model schema:

- `timestamp` -> `Date`
- `boolean` -> `boolean`
- `json<T>` -> `T`

Enable per query:

```ts
const rows = await session.execute(Project.query(), {
  hydrate: true,
});
```

Or as session default:

```ts
const session = createSqliteSession({
  databasePath: './app.sqlite',
  hydrateByDefault: true,
});
```

## Raw SQL And Escape Hatch

OBJX treats raw SQL as a first-class capability.

Helpers:

- `sql`
- `identifier`
- `ref`
- `joinSql`

Example:

```ts
import { identifier, sql } from '@qbobjx/sql-engine';

const result = await session.execute(
  sql`select count(*) as ${identifier('totalProjects')} from ${identifier('projects')}`,
);

console.log(result.rows[0]?.totalProjects);
```

References:

```ts
import { ref } from '@qbobjx/sql-engine';

const compiled = session.compile(
  Project.query().where(({ createdAt }, op) => op.isNotNull(createdAt)),
);

console.log(compiled.sql);
console.log(ref('projects.createdAt'));
```

## Observability

You can attach query observers to a session:

```ts
const session = createSqliteSession({
  databasePath: './app.sqlite',
  observers: [
    {
      onQueryStart(event) {
        console.log('sql:start', event.compiledQuery.sql);
      },
      onQuerySuccess(event) {
        console.log('sql:ok', event.durationMs);
      },
      onQueryError(event) {
        console.error('sql:error', event.error);
      },
    },
  ],
});
```

## Codegen, Introspection, Migrations, And Seeds

`@qbobjx/codegen` includes:

- real SQLite introspection
- model generation
- SQLite starter template
- migration and seed schema templates
- migration runner
- seed runner

### SQLite Introspection

```bash
npm run build
npm run codegen -- introspect --dialect sqlite3 --database ./app.sqlite --out ./generated/schema.json
```

### Generate Models

```bash
npm run codegen -- generate --input ./generated/schema.json --out ./generated/models
```

### Generate SQLite Starter

```bash
npm run codegen -- template --template sqlite-starter --out ./starter --package-name my-objx-app
```

### Generate Migration And Seed Schemas

```bash
npm run codegen -- template --template migration-seed-schemas --out ./db
```

### Run Migrations

```bash
npm run codegen -- migrate --dialect sqlite3 --database ./app.sqlite --dir ./db/migrations --direction up
```

### Run Seeds

```bash
npm run codegen -- seed --dialect sqlite3 --database ./app.sqlite --dir ./db/seeds --direction run
```

## Repository Examples

- `examples/sqlite-introspection`: introspection flow and generated model output
- `examples/complex-runtime`: context, plugins, graph ops, nested eager loading, transactions, and raw SQL
- `examples/express-api`: REST API with Express, SQLite, global session plugins, validation, and CRUD
- `examples/nestjs-api`: NestJS API with `@qbobjx/nestjs`, migrations, seeds, and prewired session
- `examples/benchmarks`: compiler/runtime microbenchmark suite
- `benchmarks/real`: real benchmark against `OBJX`, `Prisma`, `Sequelize`, and `Knex`

## Real Benchmark

```bash
npm run benchmark:install
npm run benchmark:db:up
npm run benchmark:setup
npm run benchmark
```

Reference:

- `benchmarks/real/README.md`

## Microbenchmark

```bash
npm run benchmark:micro
```

Reference:

- `examples/benchmarks/README.md`

## Current Limits

Current important limits:

- official runtime currently covers SQLite, Postgres, and MySQL, with codegen, introspection, migrations, and seeds for these three dialects
- the SQLite path uses `node:sqlite`
- Postgres and MySQL drivers depend on pools/clients compatible with `pg` and `mysql2`
- official validation adapters currently cover `zod`, `ajv`, and `valibot`; next focus is hardening and benchmarks

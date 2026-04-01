# OBJX

`OBJX` e um ORM SQL-first para TypeScript inspirado no Objection.js e redesenhado com um motor SQL embutido, runtime moderno e foco em extensibilidade.

Estado atual do projeto:

- models tipados com `defineModel`
- query builder tipado e compilador SQL embutido
- drivers oficiais para SQLite, Postgres e MySQL
- `insertGraph`, `upsertGraph`, `relate`, `unrelate`
- eager loading simples, nested e expressoes compostas de relacao
- plugins oficiais para `timestamps`, `soft delete`, `audit trail` e `tenant scope`
- codegen, introspection SQLite, templates, migrations e seeds tipados

## Pacotes

Pacotes publicados pelo workspace:

- `@qbobjx/core`: models, colunas, relacoes, query builder e contexto de execucao
- `@qbobjx/sql-engine`: compilador SQL, sessao, raw SQL e runtime de execucao
- `@qbobjx/sqlite-driver`: sessao/driver oficial para SQLite
- `@qbobjx/postgres-driver`: sessao/driver oficial para Postgres
- `@qbobjx/mysql-driver`: sessao/driver oficial para MySQL
- `@qbobjx/plugins`: plugins oficiais
- `@qbobjx/codegen`: introspection, templates, codegen, migrations e seeds multi-dialeto
- `@qbobjx/validation`: adapters oficiais e runtime de validacao

## Instalacao

Caminho feliz para SQLite:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/sqlite-driver @qbobjx/plugins
```

Para usar Postgres:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/postgres-driver @qbobjx/plugins pg
```

Para usar MySQL:

```bash
npm install @qbobjx/core @qbobjx/sql-engine @qbobjx/mysql-driver @qbobjx/plugins mysql2
```

Para tooling e codegen:

```bash
npm install -D @qbobjx/codegen
```

## Quick Start

Exemplo minimo com SQLite, contexto de execucao, plugins e uma query tipada:

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

## Definindo Models

Colunas disponiveis no core:

- `col.int()`
- `col.text()`
- `col.boolean()`
- `col.json<T>()`
- `col.uuid()`
- `col.timestamp()`
- `col.custom<T, TKind>()`

Helpers comuns:

- `.primary()`
- `.nullable()`
- `.default(value)`
- `.configure({ ... })`

Exemplo:

```ts
import { col, defineModel } from '@qbobjx/core';

export const Task = defineModel({
  name: 'Task',
  table: 'tasks',
  columns: {
    id: col.int().primary(),
    title: col.text(),
    done: col.boolean().default(false),
    metadata: col.json<{ priority: 'low' | 'high' }>().nullable(),
    createdAt: col.timestamp(),
  },
});
```

## Relacoes

Relacoes suportadas:

- `belongsToOne`
- `hasOne`
- `hasMany`
- `manyToMany`

Exemplo com `belongsToOne` e `hasMany`:

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

Exemplo de `manyToMany`:

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

## Configurando A Conexao

OBJX nao cria conexao de rede sozinho. Voce entrega um banco SQLite ou um pool/client compativel para o driver oficial.

### SQLite

Forma mais simples:

```ts
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const session = createSqliteSession({
  databasePath: './app.sqlite',
  pragmas: ['foreign_keys = on'],
  hydrateByDefault: true,
});
```

Com `DatabaseSync` proprio:

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

O driver espera algo compativel com `pg`:

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

Voce tambem pode passar um `client` em vez de `pool`.

### MySQL

O driver espera algo compativel com `mysql2/promise`:

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

Voce tambem pode passar um `client` em vez de `pool`.

## Contexto De Execucao

O contexto de execucao existe para:

- tenant scope
- actor id para auditoria
- tracing
- transacoes ambientadas
- metadata de request

No Node, o `ExecutionContextManager` usa `AsyncLocalStorage` por padrao.

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

Se voce passar `executionContextManager` na criacao da sessao, `session.execute(...)` e `session.transaction(...)` usam esse contexto automaticamente.

## Executando Queries

`session.execute(...)` aceita:

- builders tipados (`model.query()`, `model.insert()`, `model.update()`, `model.delete()`)
- AST interna
- SQL bruto via `sql\`\``
- query compilada via `session.compile(...)`

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

### Predicados Compostos

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

Sem `returning`, o resultado padrao e quantidade de linhas afetadas:

```ts
const count = await session.execute(
  Project.update({ status: 'active' }).where(({ id }, op) => op.eq(id, 1)),
);
```

Com `returning`, o resultado vira array tipado:

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

Se o model tiver `soft delete`, `delete()` reescreve para `update`. Para remocao fisica:

```ts
await session.execute(
  Project.delete().hardDelete().where(({ id }, op) => op.eq(id, 1)),
);
```

## Eager Loading E Join Planning

Eager loading tipado:

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

String expression tambem funciona:

```ts
await session.execute(
  Project.query().withRelated('tasks.comments.author'),
  { hydrate: true },
);
```

Join por relacao:

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

## Transacoes

Toda sessao oficial suporta `session.transaction(...)`.

### Transacao Basica

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

### Transacao Com Metadata

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

Nested transaction usa savepoint quando o driver suporta:

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

## Plugins Oficiais

Plugins ficam no model:

```ts
import {
  createAuditTrailPlugin,
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

### soft delete

API relevante:

- `query().withSoftDeleted()`
- `query().onlySoftDeleted()`
- `delete().hardDelete()`

### tenant scope

Por padrao, o plugin usa:

- coluna: `tenantId`
- chave do contexto: `tenantId`
- bypass: `objx.tenantScope.bypass`

Bypass explicito:

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

O plugin recebe `actorId` do contexto e emite entradas de auditoria em `insert`, `update` e `delete` por padrao.

## Hydration

Hydration converte valores conforme o schema do model:

- `timestamp` -> `Date`
- `boolean` -> `boolean`
- `json<T>` -> `T`

Voce pode habilitar por query:

```ts
const rows = await session.execute(Project.query(), {
  hydrate: true,
});
```

Ou como default da sessao:

```ts
const session = createSqliteSession({
  databasePath: './app.sqlite',
  hydrateByDefault: true,
});
```

## Raw SQL E Escape Hatch

OBJX trata SQL bruto como capacidade de primeira classe.

Helpers:

- `sql`
- `identifier`
- `ref`
- `joinSql`

Exemplo:

```ts
import { identifier, sql } from '@qbobjx/sql-engine';

const result = await session.execute(
  sql`select count(*) as ${identifier('totalProjects')} from ${identifier('projects')}`,
);

console.log(result.rows[0]?.totalProjects);
```

Referencias:

```ts
import { ref } from '@qbobjx/sql-engine';

const compiled = session.compile(
  Project.query().where(({ createdAt }, op) => op.isNotNull(createdAt)),
);

console.log(compiled.sql);
console.log(ref('projects.createdAt'));
```

## Observabilidade

Voce pode anexar observers na sessao:

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

## Codegen, Introspection, Migrations E Seeds

O pacote `@qbobjx/codegen` cobre:

- introspection real de SQLite
- geracao de models
- template de starter SQLite
- template de migrations e seeds
- runner de migrations
- runner de seeds

### Introspection SQLite

```bash
npm run build
npm run codegen -- introspect --dialect sqlite3 --database ./app.sqlite --out ./generated/schema.json
```

### Gerar Models

```bash
npm run codegen -- generate --input ./generated/schema.json --out ./generated/models
```

### Gerar Starter SQLite

```bash
npm run codegen -- template --template sqlite-starter --out ./starter --package-name my-objx-app
```

### Gerar Schemas De Migration E Seed

```bash
npm run codegen -- template --template migration-seed-schemas --out ./db
```

### Rodar Migrations

```bash
npm run codegen -- migrate --dialect sqlite3 --database ./app.sqlite --dir ./db/migrations --direction up
```

### Rodar Seeds

```bash
npm run codegen -- seed --dialect sqlite3 --database ./app.sqlite --dir ./db/seeds --direction run
```

## Exemplos Do Repositorio

- `examples/sqlite-introspection`: fluxo de introspection e model gerado
- `examples/complex-runtime`: contexto, plugins, graph ops, eager nested, transacoes e raw SQL
- `examples/benchmarks`: benchmark publico do compilador e runtime

## Benchmark Publico

```bash
npm run benchmark
```

Referencia:

- `examples/benchmarks/README.md`

## Limites Atuais

Limites importantes do estado atual:

- runtime oficial cobre SQLite, Postgres e MySQL, com codegen, introspection, migrations e seeds para os tres dialetos atuais
- o caminho SQLite usa `node:sqlite`
- os drivers de Postgres e MySQL dependem de pools/clients compativeis com `pg` e `mysql2`
- adapters oficiais de validacao hoje cobrem `zod`, `ajv` e `valibot`; o proximo foco e endurecimento e benchmarks

## Repositorios Legados Em `old/`

O workspace carrega os upstreams de referencia em:

- `old/objection.js`
- `old/knex`

Eles existem como base de estudo e extracao para o motor e para os algoritmos relacionais do projeto, nao como dependencia final obrigatoria do runtime.

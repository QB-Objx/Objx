# @qbobjx/plugins

Official OBJX plugins, including timestamps, snake case naming, soft delete, tenant scope, and audit trail.

## Install

```bash
npm install @qbobjx/plugins
```

## Quick Usage

```ts
import { col, defineModel } from '@qbobjx/core';
import {
  createSnakeCaseNamingPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@qbobjx/plugins';

export const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createSnakeCaseNamingPlugin(),
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
  ],
});
```

## Included Plugins

- `createTimestampsPlugin()`
- `createSnakeCaseNamingPlugin()`
- `createSoftDeletePlugin()`
- `createTenantScopePlugin()`
- `createAuditTrailPlugin()`

## Snake Case Naming

Use `createSnakeCaseNamingPlugin()` when your model keys are camelCase but your physical database columns are snake_case.

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

The compiler emits physical names like `tenant_id`, while hydrated rows continue to use model keys like `tenantId`.

Important: this plugin should be attached at model definition time. It updates column metadata in
the `onModelDefine` hook, so adding it only as a session-global plugin is too late for remapping.

Repository examples using this pattern:

- `examples/complex-runtime`
- `examples/express-api`
- `examples/nestjs-api`

## Tenant Scope Vs PostgreSQL RLS

`createTenantScopePlugin()` injects tenant predicates into OBJX-generated SQL. It does not replace
PostgreSQL RLS policies that depend on `set_config(...)` / `current_setting(...)`.

If your database enforces tenant isolation through PostgreSQL RLS, configure
`createPostgresSession({ executionContextSettings: ... })` in `@qbobjx/postgres-driver` and execute
protected work inside `session.transaction(...)`.

## PostgreSQL Specialist Suite (experimental)

OBJX now ships a PostgreSQL-focused suite directly in `@qbobjx/plugins` with internal-runtime defaults intended for `objx_internal` tables managed by the ORM.

```ts
import {
  createPostgresEventsPlugin,
  createPostgresQueuePlugin,
  createPostgresSearchPlugin,
  createPostgresSpecialistPreset,
} from '@qbobjx/plugins';

const specialistPreset = createPostgresSpecialistPreset({
  schema: 'objx_internal',
  queue: { defaultQueue: 'default' },
  events: { notifyChannel: 'objx_events' },
});

// habilitar apenas queue (cron/jobs)
const onlyQueue = createPostgresSpecialistPreset({
  include: ['queue'],
  queue: { defaultQueue: 'cron' },
});

// habilitar apenas events
const onlyEvents = createPostgresSpecialistPreset({
  include: ['events'],
  events: { notifyChannel: 'events_only' },
});

const queuePlugin = createPostgresQueuePlugin({
  schema: 'objx_internal',
  autoProvision: true,
  defaultQueue: 'critical',
});

const eventsPlugin = createPostgresEventsPlugin({
  schema: 'objx_internal',
  autoProvision: true,
});

const searchPlugin = createPostgresSearchPlugin({
  defaultLanguage: 'english',
  rankFunction: 'ts_rank_cd',
});
```

Included PostgreSQL-specialized plugin factories:

- `createPostgresSearchPlugin()`
- `createPostgresQueuePlugin()`
- `createPostgresEventsPlugin()`
- `createPostgresCachePlugin()`
- `createPostgresVectorPlugin()`
- `createPostgresTimeseriesPlugin()`
- `createPostgresJsonPlugin()`
- `createPostgresSecurityPlugin()`
- `createPostgresObservabilityPlugin()`
- `createPostgresSpecialistPreset()`
- `createPostgresInternalSchemaSql()`


Observação: cada plugin vive em módulo próprio dentro de `src/postgres/*`; o preset apenas compõe os plugins que você escolher em `include`.

## Runtime API (experimental)

Além dos builders SQL, o módulo PostgreSQL agora expõe um runtime de alto nível para executar todos os pontos principais (queue, events, cache, search, vector, timeseries, json, security e observability) sobre qualquer executor com interface `execute(sql, params)`.

```ts
import { createPostgresSpecialistRuntime } from '@qbobjx/plugins';

const runtime = createPostgresSpecialistRuntime({
  async execute(sql, params = []) {
    return db.execute(sql, params);
  },
});

await runtime.queue.enqueue({
  queueName: 'default',
  jobName: 'sync-project',
  payload: { projectId: 1 },
});

await runtime.events.publish({
  eventName: 'project.created',
  payload: { projectId: 1 },
});
```

O runtime também inclui:
- `provisionInternalSchema()` para bootstrap automático de tabelas internas (`runtime_migrations`, queue, outbox, cache).
- `withRequest({ executionContext, transactionId })` para execução com contexto/transação explícitos.
- `runQueueWorker(...)` e `runEventDispatcher(...)` para loops básicos de worker/dispatcher.
- `metrics()` com contadores operacionais por domínio.

## PostgreSQL Specialist Runtime API guide

A runtime has one required contract: an executor with `execute(sql, params, request?)`.

```ts
type Executor = {
  execute<T = unknown>(
    sql: string,
    params?: readonly unknown[],
    request?: { executionContext?: unknown; transactionId?: string },
  ): Promise<T>;
};
```

### Bootstrapping and lifecycle

```ts
import { createPostgresSpecialistRuntime } from '@qbobjx/plugins';

const runtime = createPostgresSpecialistRuntime(executor);

// Creates objx_internal + runtime_migrations + queue/outbox/cache tables.
await runtime.provisionInternalSchema({
  pluginName: 'objx-postgres-runtime',
  version: '1',
});

// Bind an explicit request/transaction context for all subsequent calls.
const trxRuntime = runtime.withRequest({ transactionId: 'trx_123' });
```

### Queue API

```ts
await runtime.queue.enqueue({
  queueName: 'default',
  jobName: 'invoice.generate',
  payload: { invoiceId: 'inv_1' },
  priority: 10,
  maxAttempts: 8,
});

const job = await runtime.queue.dequeue('worker-a');
if (job) {
  // ...process
  await runtime.queue.complete(1);
}
```

- `enqueue`: creates queued job rows.
- `dequeue`: claims a pending job with SKIP LOCKED semantics.
- `complete`: marks running job as done.
- `fail`: applies retry/backoff or dead status depending on attempts.

### Events API (Outbox)

```ts
await runtime.events.publish({
  eventName: 'project.created',
  payload: { projectId: 'p_1' },
  aggregateId: 'p_1',
  aggregateType: 'project',
  idempotencyKey: 'project.created:p_1',
});

const batch = await runtime.events.dispatchBatch(100);
for (const event of batch as Array<{ id: number }>) {
  // ...deliver to webhook/broker
  await runtime.events.ack(event.id);
}
```

### Cache API

```ts
const value = await runtime.cache.getOrCompute(
  'project:summary:p_1',
  async () => ({ id: 'p_1', name: 'API revamp' }),
  { tags: ['project', 'summary'] },
);
```

- `get`, `set`, `getOrCompute`, `pruneExpired`, `metrics`.

### Search, Vector, JSON, Security, Observability

```ts
await runtime.search.query({ table: 'docs', query: 'postgres runtime', limit: 20 });
await runtime.vector.similarity({ table: 'docs', vector: [0.12, 0.44, 0.05] });
const where = runtime.json.wherePath('metadata', '$.tenant == "acme"');
await runtime.security.setLocalTenant('acme');
const top = await runtime.observability.topStatements(10);
```

### Background handles

```ts
const queueHandle = runtime.startQueueWorker(async (job) => {
  // business logic
}, { workerId: 'worker-1' });

const eventHandle = runtime.startEventDispatcher(async (event) => {
  // delivery logic
}, { batchSize: 200 });

// later
queueHandle.stop();
eventHandle.stop();
await queueHandle.done;
await eventHandle.done;
```

### Runtime metrics

```ts
const snapshot = runtime.metrics();
console.log(snapshot.queue.enqueued, snapshot.events.published, snapshot.cache.hits);
```


Functional project example: `examples/postgres-specialist-runtime`.

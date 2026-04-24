import assert from "node:assert/strict";

import { col, createModelRegistry, defineModel } from "@qbobjx/core";
import { createPostgresSession } from "@qbobjx/postgres-driver";
import {
  assertSafeSqlIdentifier,
  buildCacheGetSql,
  buildCacheMetricsSql,
  buildCachePruneExpiredSql,
  buildCacheUpsertSql,
  buildJsonPathWhereSql,
  buildJsonProjectionSql,
  buildListenSql,
  buildNotifySql,
  buildOutboxDispatchBatchSql,
  buildOutboxPublishSql,
  buildPostgresSearchQuerySql,
  buildQueueCompleteSql,
  buildQueueDequeueSql,
  buildQueueEnqueueSql,
  buildQueueFailSql,
  buildQueueReclaimExpiredSql,
  buildQueueRenewLeaseSql,
  buildVectorSimilarityQuerySql,
  computeQueueBackoffMs,
  createCacheInvalidationTriggerSql,
  createEnableRlsSql,
  createExplainAnalyzeSql,
  createJsonIndexesSql,
  createMaterializedViewRefreshSql,
  createPartitionSql,
  createPartitionedTableSql,
  createPgStatStatementsSql,
  createPostgresAdvisoryLockSql,
  createPostgresAdvisoryUnlockSql,
  createPostgresCachePlugin,
  createPostgresEventsPlugin,
  createPostgresObservabilityPlugin,
  createPostgresExecutionContextSettingsFromConfig,
  createPostgresExecutionContextSettingsFromRegistrations,
  createPostgresInternalSchemaSql,
  createPostgresPreset,
  createPostgresQueuePlugin,
  createPostgresRuntime,
  createPostgresRuntimeFromConfig,
  createPostgresRuntimeFromObjxSession,
  createPostgresRuntimeFromRegistrations,
  createPostgresRuntimeFromRegistry,
  createPostgresRuntimeFromSession,
  createPostgresSearchMigrationSql,
  createPostgresSearchPlugin,
  createPostgresSecurityPlugin,
  createPostgresSessionExecutor,
  createPostgresVectorPlugin,
  createRetentionSql,
  createSetLocalTenantSql,
  createTenantIsolationPolicySql,
  createTimescaleCompressionSql,
  createVectorColumnSql,
  createVectorIndexSql,
  lintSqlAntiPatterns,
  quoteSqlIdentifier,
  resolvePostgresConfig,
  resolvePostgresIntegration,
} from "@qbobjx/plugins";

const queuePlugin = createPostgresQueuePlugin({ defaultQueue: "critical" });
assert.equal(queuePlugin.name, "postgres-queue");

const eventsPlugin = createPostgresEventsPlugin({ notifyChannel: "my_events" });
assert.equal(eventsPlugin.name, "postgres-events");

const vectorPlugin = createPostgresVectorPlugin({
  distance: "l2",
  indexMethod: "ivfflat",
});
assert.equal(vectorPlugin.name, "postgres-vector");

const preset = createPostgresPreset();
assert.equal(preset.length, 9);
assert.deepEqual(
  createPostgresPreset({ include: ["queue"] }).map((x) => x.name),
  ["postgres-queue"],
);
assert.deepEqual(
  createPostgresPreset({ include: ["events"] }).map((x) => x.name),
  ["postgres-events"],
);

assert.ok(
  createPostgresSearchMigrationSql({
    table: "docs",
    sourceColumns: ["title", "body"],
  })[0].includes("to_tsvector"),
);
assert.ok(
  buildPostgresSearchQuerySql({
    table: "docs",
    query: "orm postgres",
    highlightColumn: "body",
    rankFunction: "ts_rank",
  }).includes("ts_headline"),
);
assert.ok(
  buildPostgresSearchQuerySql({
    table: "docs",
    query: "orm postgres",
    highlightColumn: "body",
    rankFunction: "ts_rank",
  }).includes("ts_rank("),
);

assert.equal(
  computeQueueBackoffMs(3, { strategy: "exponential", baseMs: 100 }),
  400,
);
assert.ok(buildQueueEnqueueSql().includes('"objx_internal"."queue_jobs"'));
assert.ok(buildQueueDequeueSql().includes("for update skip locked"));
assert.ok(buildQueueDequeueSql().includes("locked_at <= now()"));
assert.ok(buildQueueCompleteSql().includes("status = 'done'"));
assert.ok(buildQueueFailSql().includes('"objx_internal"."queue_dlq"'));
assert.ok(buildQueueRenewLeaseSql().includes("locked_at = now()"));
assert.ok(buildQueueRenewLeaseSql().includes("locked_by = $2"));
assert.ok(buildQueueReclaimExpiredSql().includes("status = 'pending'"));
assert.ok(buildQueueReclaimExpiredSql().includes("locked_at = null"));

assert.ok(buildOutboxPublishSql().includes('"objx_internal"."outbox_events"'));
assert.ok(buildOutboxDispatchBatchSql().includes("dispatched_at is null"));
assert.ok(buildOutboxDispatchBatchSql().includes("claimed_at is null"));
assert.ok(buildOutboxDispatchBatchSql().includes("claim_expires_at"));
assert.ok(buildOutboxDispatchBatchSql().includes("claimed_by"));
assert.equal(buildListenSql("abc"), "listen abc;");
assert.equal(buildNotifySql("abc"), "select pg_notify('abc', $1);");

assert.ok(buildCacheUpsertSql().includes('"objx_internal"."cache_entries"'));
assert.ok(buildCacheGetSql().includes("hits = hits + 1"));
assert.ok(buildCachePruneExpiredSql().includes("expires_at <= now()"));
assert.ok(
  createMaterializedViewRefreshSql("mv_orders").includes("materialized view"),
);
assert.ok(
  createCacheInvalidationTriggerSql({
    sourceTable: "orders",
    keyExpression: "old.id::text",
  }).includes('"objx_internal"."invalidate_orders_cache"'),
);
assert.ok(buildCacheMetricsSql().includes("total_entries"));

assert.equal(
  buildJsonPathWhereSql("data", '$.tenant == "a"'),
  `"data" @@ '$.tenant == "a"'`,
);
assert.ok(
  buildJsonProjectionSql("data", ["profile,name"]).includes('"profile_name"'),
);
assert.equal(
  createJsonIndexesSql({
    table: "users",
    jsonColumn: "data",
    scalarPaths: ["profile,name"],
  }).length,
  2,
);

assert.ok(createVectorColumnSql("docs").includes("vector(1536)"));
assert.ok(createVectorIndexSql({ table: "docs" }).includes("using hnsw"));
assert.ok(
  buildVectorSimilarityQuerySql({ table: "docs" }).includes(
    '"similarity_distance"',
  ),
);

assert.ok(
  createPartitionedTableSql({
    table: "events",
    timestampColumn: "created_at",
  }).includes("partition by range"),
);
assert.ok(
  createPartitionSql({
    table: "events",
    partitionName: "events_2026_01",
    from: "2026-01-01",
    to: "2026-02-01",
  }).includes("partition of"),
);
assert.ok(
  createRetentionSql({
    table: "events",
    timestampColumn: "created_at",
    retentionDays: 30,
  }).includes("interval '30 days'"),
);
assert.ok(
  createTimescaleCompressionSql("events_hypertable").includes(
    "timescaledb.compress",
  ),
);

assert.equal(
  createEnableRlsSql("tenant_orders"),
  'alter table "tenant_orders" enable row level security;',
);
assert.ok(
  createTenantIsolationPolicySql({ table: "tenant_orders" }).includes(
    "current_setting",
  ),
);
assert.ok(createSetLocalTenantSql().includes("set_config"));

assert.ok(createExplainAnalyzeSql("select 1").startsWith("explain"));
assert.ok(createPgStatStatementsSql(10).includes("limit 10"));
assert.equal(
  lintSqlAntiPatterns("select * from users").some(
    (issue) => issue.code === "SELECT_STAR",
  ),
  true,
);

const internalSchemaSql = createPostgresInternalSchemaSql();
assert.equal(internalSchemaSql.length, 17);
assert.ok(
  internalSchemaSql.some((statement) =>
    statement.includes("runtime_migrations"),
  ),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("queue_jobs")),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("outbox_events")),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("queue_dlq")),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("idempotency_key")),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("claim_expires_at")),
);
assert.ok(
  internalSchemaSql.some((statement) => statement.includes("claimed_by")),
);
assert.equal(createPostgresAdvisoryLockSql(42), "select pg_advisory_lock(42);");
assert.equal(
  createPostgresAdvisoryUnlockSql(42),
  "select pg_advisory_unlock(42);",
);
assert.equal(quoteSqlIdentifier("tenant_id"), '"tenant_id"');
assert.throws(() => assertSafeSqlIdentifier("tenant-id"));
assert.throws(() => buildNotifySql("bad-channel"));

const observabilityEvents = [];

const JobModel = defineModel({
  name: "JobModel",
  table: "jobs",
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
  },
  plugins: [
    createPostgresQueuePlugin({
      schema: "ops",
      defaultQueue: "critical",
      lockTtlMs: 12_000,
      maxAttempts: 11,
    }),
    createPostgresEventsPlugin({
      schema: "ops",
      notifyChannel: "ops_events",
      outboxTable: "outbox_runtime",
      claimTtlMs: 9_000,
      dispatcherId: "ops-dispatcher",
    }),
    createPostgresCachePlugin({
      schema: "ops",
      table: "cache_runtime",
      defaultTtlSeconds: 15,
    }),
    createPostgresSearchPlugin({
      defaultLanguage: "english",
      rankFunction: "ts_rank",
    }),
    createPostgresSecurityPlugin({
      tenantSettingName: "app.tenant_id",
    }),
    createPostgresObservabilityPlugin({
      slowQueryThresholdMs: 5,
      emit(event) {
        observabilityEvents.push(event);
      },
    }),
  ],
});

const registry = createModelRegistry();
registry.register(JobModel);

const resolvedConfig = resolvePostgresConfig(registry);
assert.equal(resolvedConfig.queue?.schema, "ops");
assert.equal(resolvedConfig.queue?.defaultQueue, "critical");
assert.equal(resolvedConfig.queue?.lockTtlMs, 12_000);
assert.equal(resolvedConfig.events?.notifyChannel, "ops_events");
assert.equal(resolvedConfig.events?.outboxTable, "outbox_runtime");
assert.equal(resolvedConfig.events?.claimTtlMs, 9_000);
assert.equal(resolvedConfig.events?.dispatcherId, "ops-dispatcher");
assert.equal(resolvedConfig.cache?.table, "cache_runtime");
assert.equal(resolvedConfig.search?.defaultLanguage, "english");
assert.equal(resolvedConfig.search?.rankFunction, "ts_rank");
assert.equal(resolvedConfig.security?.tenantSettingName, "app.tenant_id");

const settingsFromConfig =
  createPostgresExecutionContextSettingsFromConfig(resolvedConfig);
assert.deepEqual(settingsFromConfig, {
  bindings: [
    {
      setting: "app.tenant_id",
      contextKey: "tenantId",
      required: true,
      isLocal: true,
    },
  ],
});

const settingsFromRegistrations =
  createPostgresExecutionContextSettingsFromRegistrations(registry, {
    tenantContextKey: "tenantKey",
    required: false,
  });
assert.deepEqual(settingsFromRegistrations, {
  bindings: [
    {
      setting: "app.tenant_id",
      contextKey: "tenantKey",
      required: false,
      isLocal: true,
    },
  ],
});

const integration = resolvePostgresIntegration(registry, {
  tenantContextKey: "tenantKey",
  required: false,
});
assert.equal(integration.config.queue?.defaultQueue, "critical");
assert.deepEqual(integration.executionContextSettings, {
  bindings: [
    {
      setting: "app.tenant_id",
      contextKey: "tenantKey",
      required: false,
      isLocal: true,
    },
  ],
});

const ConflictingModel = defineModel({
  name: "ConflictingModel",
  table: "jobs_conflict",
  columns: {
    id: col.int().primary(),
  },
  plugins: [
    createPostgresQueuePlugin({
      schema: "ops",
      defaultQueue: "secondary",
    }),
  ],
});

const conflictingRegistry = createModelRegistry();
conflictingRegistry.register(JobModel, ConflictingModel);
assert.throws(
  () => resolvePostgresConfig(conflictingRegistry),
  /Conflicting PostgreSQL runtime plugin metadata/,
);

const executed = [];
const runtime = createPostgresRuntime(
  {
    async execute(sql, params = [], request = undefined) {
      executed.push({ sql, params, request });

      if (sql.includes("for update skip locked")) {
        return { id: 1, payload: { id: 1 }, attempts: 0 };
      }

      if (sql.includes("dispatched_at is null")) {
        return [{ id: 10, event_name: "project.created" }];
      }

      if (sql.includes("runtime_migrations") && sql.includes("count(*)::int")) {
        return { rowCount: 0 };
      }

      if (sql.includes("cache_runtime") && sql.includes("returning value")) {
        return null;
      }

      return { ok: true };
    },
  },
  { config: resolvedConfig },
);

await runtime.provisionInternalSchema();
const contextualRuntime = runtime.withRequest({ transactionId: "trx_1" });

await contextualRuntime.queue.enqueue({
  jobName: "sync",
  payload: { id: 1 },
});
await contextualRuntime.events.publish({
  eventName: "project.created",
  payload: { id: 1 },
});
await contextualRuntime.cache.set({
  key: "k",
  value: { ok: true },
  tags: ["project"],
});
await contextualRuntime.search.query({ table: "docs", query: "postgres" });
await contextualRuntime.vector.similarity({
  table: "docs",
  vector: [0.1, 0.2, 0.3],
});
await contextualRuntime.timeseries.applyRetention("events", "created_at");
await contextualRuntime.security.setLocalTenant("tenant_a");
await contextualRuntime.observability.explainAnalyze("select 1");

await contextualRuntime.runQueueWorker(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
await contextualRuntime.runEventDispatcher(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
await contextualRuntime.events.dispatchBatch(25, {
  dispatcherId: "manual-dispatcher",
  leaseMs: 4_500,
});
await contextualRuntime.queue.renewLease({
  jobId: 1,
  workerId: "worker-renew",
  leaseMs: 7_500,
});
await contextualRuntime.queue.reclaimExpired("worker-reclaim", 8_250);

await assert.rejects(
  () =>
    runtime.provisionInternalSchema({
      strict: true,
      pluginName: "x",
      version: "1",
    }),
  /Strict mode enabled/,
);

const queueHandle = contextualRuntime.startQueueWorker(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
const eventHandle = contextualRuntime.startEventDispatcher(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
await queueHandle.done;
await eventHandle.done;
queueHandle.stop();
eventHandle.stop();

assert.equal(
  contextualRuntime.observability.lint("select * from users").length > 0,
  true,
);
assert.equal(
  executed.some((call) => call.request?.transactionId === "trx_1"),
  true,
);
assert.equal(runtime.metrics().queue.enqueued === 0, true);
assert.equal(contextualRuntime.metrics().queue.enqueued > 0, true);
assert.equal(
  executed.some((call) => call.sql.includes('"ops"."queue_jobs"')),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes('"ops"."outbox_runtime"')),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes('"ops"."cache_runtime"')),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes("pg_notify('ops_events'")),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes("set_config('app.tenant_id'")),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes("ts_rank(")),
  true,
);
assert.equal(
  executed.some((call) => call.sql.includes("claim_expires_at")),
  true,
);
assert.equal(
  executed.some(
    (call) =>
      Array.isArray(call.params) &&
      call.params[0] === 25 &&
      call.params[1] === "manual-dispatcher" &&
      call.params[2] === 4_500,
  ),
  true,
);
assert.equal(
  executed.some(
    (call) =>
      typeof call.sql === "string" &&
      call.sql.includes("locked_at = now()") &&
      Array.isArray(call.params) &&
      call.params[0] === 1 &&
      call.params[1] === "worker-renew" &&
      call.params[2] === 7_500,
  ),
  true,
);
assert.equal(
  executed.some(
    (call) =>
      typeof call.sql === "string" &&
      call.sql.includes("status = 'pending'") &&
      call.sql.includes("locked_at = null") &&
      Array.isArray(call.params) &&
      call.params[0] === 8_250,
  ),
  true,
);

const runtimeFromConfig = createPostgresRuntimeFromConfig(
  {
    async execute() {
      return { ok: true };
    },
  },
  resolvedConfig,
);
assert.equal(runtimeFromConfig.config.queue?.defaultQueue, "critical");

const runtimeFromRegistrations = createPostgresRuntimeFromRegistrations(
  {
    async execute() {
      return { ok: true };
    },
  },
  registry.all(),
);
assert.equal(
  runtimeFromRegistrations.config.events?.notifyChannel,
  "ops_events",
);

const runtimeFromRegistry = createPostgresRuntimeFromRegistry(
  {
    async execute() {
      return { ok: true };
    },
  },
  registry,
);
assert.equal(runtimeFromRegistry.config.cache?.table, "cache_runtime");

const executedWithAutoHandling = [];
const autoRuntime = createPostgresRuntimeFromRegistry(
  {
    async execute(sql, params = [], request = undefined) {
      executedWithAutoHandling.push({ sql, params, request });

      if (sql.includes("dispatched_at is null")) {
        return [{ id: 8, event_name: "invoice.created" }];
      }

      if (sql.includes("for update skip locked")) {
        return { id: 7, attempts: 2, payload: { id: 7 } };
      }

      return { ok: true };
    },
  },
  registry,
);

await autoRuntime.runQueueWorker(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
await autoRuntime.runEventDispatcher(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});

const executedWithHeartbeat = [];
const heartbeatRuntime = createPostgresRuntimeFromRegistry(
  {
    async execute(sql, params = [], request = undefined) {
      executedWithHeartbeat.push({ sql, params, request });

      if (sql.includes("for update skip locked")) {
        return { id: 11, attempts: 0, payload: { id: 11 } };
      }

      return { ok: true };
    },
  },
  registry,
);

await heartbeatRuntime.runQueueWorker(
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  },
  {
    maxLoops: 1,
    intervalMs: 0,
    autoHeartbeat: true,
    heartbeatIntervalMs: 1,
    leaseMs: 3_000,
  },
);

assert.equal(
  executedWithAutoHandling.some((call) => call.sql.includes("status = 'done'")),
  true,
);
assert.equal(
  executedWithAutoHandling.some((call) =>
    call.sql.includes("dispatched_at = now()"),
  ),
  true,
);
assert.equal(
  executedWithHeartbeat.some((call) => call.sql.includes("locked_at = now()")),
  true,
);
assert.equal(
  executedWithHeartbeat.some(
    (call) =>
      Array.isArray(call.params) &&
      call.params[0] === 11 &&
      call.params[1] === "objx-worker" &&
      call.params[2] === 3_000,
  ),
  true,
);

const failingRuntimeCalls = [];
const failingRuntime = createPostgresRuntimeFromRegistry(
  {
    async execute(sql, params = [], request = undefined) {
      failingRuntimeCalls.push({ sql, params, request });

      if (sql.includes("dispatched_at is null")) {
        return [{ id: 100, event_name: "invoice.failed" }];
      }

      if (sql.includes("for update skip locked")) {
        return { id: 99, attempts: 4, payload: { id: 99 } };
      }

      return { ok: true };
    },
  },
  registry,
);

await assert.rejects(
  () =>
    failingRuntime.runQueueWorker(
      async () => {
        throw new Error("queue boom");
      },
      { maxLoops: 1, intervalMs: 0 },
    ),
  /queue boom/,
);

await assert.rejects(
  () =>
    failingRuntime.runEventDispatcher(
      async () => {
        throw new Error("event boom");
      },
      { maxLoops: 1, intervalMs: 0 },
    ),
  /event boom/,
);

assert.equal(
  failingRuntimeCalls.some((call) => call.sql.includes('"ops"."queue_dlq"')),
  true,
);
assert.equal(
  failingRuntimeCalls.some((call) => call.sql.includes("last_error = $2")),
  true,
);

const sessionExecutorCalls = [];
const sessionExecutor = createPostgresSessionExecutor(
  {
    async execute(compiledQuery, options = {}) {
      sessionExecutorCalls.push({ compiledQuery, options });

      return {
        rows: [{ id: 1, event_name: "project.created" }],
        rowCount: 1,
        raw: { ok: true },
      };
    },
    currentExecutionContext() {
      return undefined;
    },
  },
  { resultMode: "smart" },
);

const smartSessionResult = await sessionExecutor.execute("select 1 as id");
assert.deepEqual(smartSessionResult, { id: 1, event_name: "project.created" });
assert.equal(sessionExecutorCalls[0].compiledQuery.sql, "select 1 as id");
assert.deepEqual(sessionExecutorCalls[0].compiledQuery.parameters, []);
assert.deepEqual(sessionExecutorCalls[0].compiledQuery.metadata, {});

const fakeClientQueries = [];
const fakeClient = {
  async query(sqlText, parameters = []) {
    fakeClientQueries.push({ sqlText, parameters });

    if (sqlText === "begin" || sqlText === "commit" || sqlText === "rollback") {
      return { rows: [], rowCount: 0, command: sqlText.toUpperCase() };
    }

    if (
      sqlText.includes("runtime_migrations") &&
      sqlText.includes("count(*)::int")
    ) {
      return { rows: [{ rowCount: 0 }], rowCount: 1, command: "SELECT" };
    }

    if (
      sqlText.includes("cache_runtime") &&
      sqlText.includes("returning value")
    ) {
      return { rows: [], rowCount: 0, command: "UPDATE" };
    }

    if (sqlText.includes("dispatched_at is null")) {
      return {
        rows: [{ id: 501, event_name: "invoice.created" }],
        rowCount: 1,
        command: "SELECT",
      };
    }

    if (sqlText.includes("for update skip locked")) {
      return {
        rows: [{ id: 401, attempts: 1, payload: { id: 401 } }],
        rowCount: 1,
        command: "UPDATE",
      };
    }

    if (sqlText.includes("pg_notify")) {
      return { rows: [], rowCount: 1, command: "SELECT" };
    }

    return { rows: [{ ok: true }], rowCount: 1, command: "SELECT" };
  },
};

const session = createPostgresSession({
  client: fakeClient,
  executionContextSettings: integration.executionContextSettings,
});

const runtimeFromSession = createPostgresRuntimeFromSession(session, {
  source: registry,
});

await runtimeFromSession.provisionInternalSchema({
  pluginName: "postgres-runtime-test",
  version: "1",
});
await runtimeFromSession.queue.enqueue({
  jobName: "session-job",
  payload: { id: 1 },
});
await runtimeFromSession.events.publish({
  eventName: "session.event",
  payload: { id: 1 },
});
await runtimeFromSession.cache.set({
  key: "cache:1",
  value: { ok: true },
});
await runtimeFromSession.runQueueWorker(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});
await runtimeFromSession.runEventDispatcher(async () => {}, {
  maxLoops: 1,
  intervalMs: 0,
});

assert.equal(
  fakeClientQueries.some((entry) =>
    entry.sqlText.includes('"ops"."queue_jobs"'),
  ),
  true,
);
assert.equal(
  fakeClientQueries.some((entry) =>
    entry.sqlText.includes('"ops"."outbox_runtime"'),
  ),
  true,
);
assert.equal(
  fakeClientQueries.some((entry) =>
    entry.sqlText.includes('"ops"."cache_runtime"'),
  ),
  true,
);
assert.equal(
  fakeClientQueries.some((entry) => entry.sqlText.includes("pg_notify")),
  true,
);

const transactionClientQueries = [];
const transactionClient = {
  async query(sqlText, parameters = []) {
    transactionClientQueries.push({ sqlText, parameters });

    if (sqlText.includes("set_config")) {
      return { rows: [{ value: "tenant-a" }], rowCount: 1, command: "SELECT" };
    }

    if (sqlText.includes("dispatched_at is null")) {
      return {
        rows: [{ id: 601, event_name: "tx.event" }],
        rowCount: 1,
        command: "SELECT",
      };
    }

    if (sqlText.includes("for update skip locked")) {
      return {
        rows: [{ id: 602, attempts: 0, payload: { id: 602 } }],
        rowCount: 1,
        command: "UPDATE",
      };
    }

    return { rows: [{ ok: true }], rowCount: 1, command: "SELECT" };
  },
};

const transactionPool = {
  async query(sqlText) {
    if (sqlText === "begin" || sqlText === "commit" || sqlText === "rollback") {
      return { rows: [], rowCount: 0, command: sqlText.toUpperCase() };
    }

    return { rows: [], rowCount: 0, command: "SELECT" };
  },
  async connect() {
    return {
      query: transactionClient.query,
      release() {},
    };
  },
};

const transactionalSession = createPostgresSession({
  pool: transactionPool,
  executionContextSettings: integration.executionContextSettings,
});

await transactionalSession.transaction(
  async (txSession) => {
    const txRuntime = createPostgresRuntimeFromObjxSession(txSession, {
      source: registry,
    });

    await txRuntime.security.setLocalTenant("tenant-b");
    await txRuntime.queue.enqueue({
      jobName: "tx-job",
      payload: { id: 2 },
    });
    await txRuntime.events.publish({
      eventName: "tx.event",
      payload: { id: 2 },
    });
    await txRuntime.runQueueWorker(async () => {}, {
      maxLoops: 1,
      intervalMs: 0,
    });
    await txRuntime.runEventDispatcher(async () => {}, {
      maxLoops: 1,
      intervalMs: 0,
    });
  },
  {
    values: {
      tenantKey: "tenant-a",
    },
  },
);

assert.equal(
  transactionClientQueries.some((entry) =>
    entry.sqlText.includes("set_config"),
  ),
  true,
);
assert.equal(
  transactionClientQueries.some((entry) =>
    entry.sqlText.includes('"ops"."queue_jobs"'),
  ),
  true,
);
assert.equal(
  transactionClientQueries.some((entry) =>
    entry.sqlText.includes('"ops"."outbox_runtime"'),
  ),
  true,
);

const observedClientQueries = [];
let observedQueryCount = 0;
const observedClient = {
  async query(sqlText, parameters = []) {
    observedClientQueries.push({ sqlText, parameters });

    if (sqlText.includes('from "observed_jobs"')) {
      observedQueryCount += 1;

      if (observedQueryCount === 1) {
        return {
          rows: [{ id: 1, tenantId: "tenant-a" }],
          rowCount: 1,
          command: "SELECT",
        };
      }

      throw new Error("observed query boom");
    }

    throw new Error("observed query boom");
  },
};

const ObservedJobModel = defineModel({
  name: "ObservedJobModel",
  table: "observed_jobs",
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
  },
  plugins: [
    createPostgresObservabilityPlugin({
      slowQueryThresholdMs: 0,
      emit(event) {
        observabilityEvents.push(event);
      },
    }),
  ],
});

const observedSession = createPostgresSession({
  client: observedClient,
});

await observedSession.execute(ObservedJobModel.query());
await assert.rejects(
  () => observedSession.execute(ObservedJobModel.query()),
  /Failed to execute SQL query/,
);

assert.equal(
  observabilityEvents.some(
    (event) =>
      event.type === "query:execute" &&
      event.modelName === "ObservedJobModel" &&
      typeof event.sql === "string",
  ),
  true,
);
assert.equal(
  observabilityEvents.some(
    (event) =>
      event.type === "query:result" &&
      event.modelName === "ObservedJobModel" &&
      typeof event.durationMs === "number" &&
      event.isSlowQuery === true,
  ),
  true,
);
assert.equal(
  observabilityEvents.some(
    (event) =>
      event.type === "query:error" &&
      event.modelName === "ObservedJobModel" &&
      typeof event.durationMs === "number" &&
      event.isSlowQuery === true,
  ),
  true,
);
assert.equal(
  observabilityEvents.some(
    (event) =>
      Array.isArray(event.lintIssues) &&
      event.lintIssues.some((issue) => issue.code === "NO_LIMIT"),
  ),
  true,
);
assert.equal(
  observedClientQueries.some((entry) =>
    entry.sqlText.includes('from "observed_jobs"'),
  ),
  true,
);

console.log("postgres plugins ok");

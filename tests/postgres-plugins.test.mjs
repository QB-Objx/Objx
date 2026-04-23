import assert from 'node:assert/strict';

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
  createPostgresEventsPlugin,
  createPostgresInternalSchemaSql,
  createPostgresQueuePlugin,
  createPostgresSearchMigrationSql,
  createPostgresSpecialistPreset,
  createPostgresSpecialistRuntime,
  createPostgresVectorPlugin,
  createRetentionSql,
  createSetLocalTenantSql,
  createTenantIsolationPolicySql,
  createTimescaleCompressionSql,
  createVectorColumnSql,
  createVectorIndexSql,
  lintSqlAntiPatterns,
  quoteSqlIdentifier,
} from '@qbobjx/plugins';

const queuePlugin = createPostgresQueuePlugin({ defaultQueue: 'critical' });
assert.equal(queuePlugin.name, 'postgres-queue');

const eventsPlugin = createPostgresEventsPlugin({ notifyChannel: 'my_events' });
assert.equal(eventsPlugin.name, 'postgres-events');

const vectorPlugin = createPostgresVectorPlugin({ distance: 'l2', indexMethod: 'ivfflat' });
assert.equal(vectorPlugin.name, 'postgres-vector');

const preset = createPostgresSpecialistPreset();
assert.equal(preset.length, 9);
assert.deepEqual(createPostgresSpecialistPreset({ include: ['queue'] }).map((x) => x.name), ['postgres-queue']);
assert.deepEqual(createPostgresSpecialistPreset({ include: ['events'] }).map((x) => x.name), ['postgres-events']);

assert.ok(createPostgresSearchMigrationSql({ table: 'docs', sourceColumns: ['title', 'body'] })[0].includes('to_tsvector'));
assert.ok(buildPostgresSearchQuerySql({ table: 'docs', query: 'orm postgres', highlightColumn: 'body' }).includes('ts_headline'));

assert.equal(computeQueueBackoffMs(3, { strategy: 'exponential', baseMs: 100 }), 400);
assert.ok(buildQueueEnqueueSql().includes('insert into objx_internal.queue_jobs'));
assert.ok(buildQueueDequeueSql().includes('for update skip locked'));
assert.ok(buildQueueCompleteSql().includes("status = 'done'"));
assert.ok(buildQueueFailSql().includes("status = case when"));

assert.ok(buildOutboxPublishSql().includes('outbox_events'));
assert.ok(buildOutboxDispatchBatchSql().includes('dispatched_at is null'));
assert.equal(buildListenSql('abc'), 'listen abc;');
assert.equal(buildNotifySql('abc'), "select pg_notify('abc', $1);");

assert.ok(buildCacheUpsertSql().includes('on conflict (cache_key)'));
assert.ok(buildCacheGetSql().includes('hits = hits + 1'));
assert.ok(buildCachePruneExpiredSql().includes('expires_at <= now()'));
assert.ok(createMaterializedViewRefreshSql('mv_orders').includes('materialized view'));
assert.ok(createCacheInvalidationTriggerSql({ sourceTable: 'orders', keyExpression: 'old.id::text' }).includes('invalidate_orders_cache'));
assert.ok(buildCacheMetricsSql().includes('total_entries'));

assert.equal(buildJsonPathWhereSql('data', '$.tenant == "a"'), `data @@ '$.tenant == "a"'`);
assert.ok(buildJsonProjectionSql('data', ['profile,name']).includes('profile_name'));
assert.equal(createJsonIndexesSql({ table: 'users', jsonColumn: 'data', scalarPaths: ['profile,name'] }).length, 2);

assert.ok(createVectorColumnSql('docs').includes('vector(1536)'));
assert.ok(createVectorIndexSql({ table: 'docs' }).includes('using hnsw'));
assert.ok(buildVectorSimilarityQuerySql({ table: 'docs' }).includes('similarity_distance'));

assert.ok(createPartitionedTableSql({ table: 'events', timestampColumn: 'created_at' }).includes('partition by range'));
assert.ok(createPartitionSql({ table: 'events', partitionName: 'events_2026_01', from: '2026-01-01', to: '2026-02-01' }).includes('partition of'));
assert.ok(createRetentionSql({ table: 'events', timestampColumn: 'created_at', retentionDays: 30 }).includes("interval '30 days'"));
assert.ok(createTimescaleCompressionSql('events_hypertable').includes('timescaledb.compress'));

assert.equal(createEnableRlsSql('tenant_orders'), 'alter table tenant_orders enable row level security;');
assert.ok(createTenantIsolationPolicySql({ table: 'tenant_orders' }).includes('current_setting'));
assert.ok(createSetLocalTenantSql().includes('set_config'));

assert.ok(createExplainAnalyzeSql('select 1').startsWith('explain'));
assert.ok(createPgStatStatementsSql(10).includes('limit 10'));
assert.equal(lintSqlAntiPatterns('select * from users').some((issue) => issue.code === 'SELECT_STAR'), true);

const internalSchemaSql = createPostgresInternalSchemaSql();
assert.equal(internalSchemaSql.length, 6);
assert.ok(internalSchemaSql.some((statement) => statement.includes('runtime_migrations')));
assert.ok(internalSchemaSql.some((statement) => statement.includes('queue_jobs')));
assert.ok(internalSchemaSql.some((statement) => statement.includes('outbox_events')));
assert.equal(createPostgresAdvisoryLockSql(42), 'select pg_advisory_lock(42);');
assert.equal(createPostgresAdvisoryUnlockSql(42), 'select pg_advisory_unlock(42);');
assert.equal(quoteSqlIdentifier('tenant_id'), '"tenant_id"');
assert.throws(() => assertSafeSqlIdentifier('tenant-id'));

const executed = [];
const runtime = createPostgresSpecialistRuntime({
  async execute(sql, params = [], request = undefined) {
    executed.push({ sql, params, request });

    if (sql.includes('for update skip locked')) {
      return { id: 1, payload: { id: 1 } };
    }

    if (sql.includes('dispatched_at is null')) {
      return [{ id: 10, event_name: 'project.created' }];
    }

    return { ok: true };
  },
});

await runtime.provisionInternalSchema();
const contextualRuntime = runtime.withRequest({ transactionId: 'trx_1' });
await contextualRuntime.queue.enqueue({ queueName: 'default', jobName: 'sync', payload: { id: 1 } });
await contextualRuntime.events.publish({ eventName: 'project.created', payload: { id: 1 } });
await contextualRuntime.cache.set({ key: 'k', value: { ok: true }, tags: ['project'] });
await contextualRuntime.search.query({ table: 'docs', query: 'postgres' });
await contextualRuntime.vector.similarity({ table: 'docs', vector: [0.1, 0.2, 0.3] });
await contextualRuntime.timeseries.applyRetention('events', 'created_at', 30);
await contextualRuntime.security.setLocalTenant('tenant_a');
await contextualRuntime.observability.explainAnalyze('select 1');
await contextualRuntime.runQueueWorker(async () => {}, { maxLoops: 1, intervalMs: 0 });
await contextualRuntime.runEventDispatcher(async () => {}, { maxLoops: 1, intervalMs: 0 });


await assert.rejects(
  () => runtime.provisionInternalSchema({ strict: true, pluginName: 'x', version: '1' }),
  /Strict mode enabled/,
);

const queueHandle = contextualRuntime.startQueueWorker(async () => {}, { maxLoops: 1, intervalMs: 0 });
const eventHandle = contextualRuntime.startEventDispatcher(async () => {}, { maxLoops: 1, intervalMs: 0 });
await queueHandle.done;
await eventHandle.done;
queueHandle.stop();
eventHandle.stop();
assert.equal(contextualRuntime.observability.lint('select * from users').length > 0, true);
assert.equal(executed.some((call) => call.request?.transactionId === 'trx_1'), true);
assert.equal(runtime.metrics().queue.enqueued === 0, true);
assert.equal(contextualRuntime.metrics().queue.enqueued > 0, true);

console.log('postgres plugins ok');

import type {
  ExecutionContext,
  ModelPluginRegistration,
  ModelRegistry,
} from '@qbobjx/core';
import type { CompiledQuery, ObjxSession, SqlResultSet } from '@qbobjx/sql-engine';

import {
  buildCacheGetSql,
  buildCacheMetricsSql,
  buildCachePruneExpiredSql,
  buildCacheUpsertSql,
  type PostgresCachePluginMetadata,
} from './cache.js';
import {
  resolvePostgresConfig,
  type PostgresRegistrationSource,
  type PostgresRuntimeConfig,
} from './config.js';
import {
  buildListenSql,
  buildNotifySql,
  buildOutboxAckSql,
  buildOutboxDispatchBatchSql,
  buildOutboxFailSql,
  buildOutboxPublishSql,
  type PostgresEventsPluginMetadata,
} from './events.js';
import {
  createPostgresAdvisoryLockSql,
  createPostgresAdvisoryUnlockSql,
  createPostgresInternalSchemaSql,
} from './internal-schema.js';
import { buildJsonPathWhereSql, buildJsonProjectionSql } from './json.js';
import {
  createExplainAnalyzeSql,
  createPgStatStatementsSql,
  lintSqlAntiPatterns,
  type PostgresObservabilityPluginMetadata,
  type SqlLintIssue,
} from './observability.js';
import {
  buildQueueCompleteSql,
  buildQueueDequeueSql,
  buildQueueEnqueueSql,
  buildQueueFailSql,
  buildQueueReclaimExpiredSql,
  buildQueueRenewLeaseSql,
  computeQueueBackoffMs,
  type PostgresQueuePluginMetadata,
  type QueueBackoffOptions,
} from './queue.js';
import {
  buildPostgresSearchQuerySql,
  type PostgresSearchPluginMetadata,
} from './search.js';
import {
  createEnableRlsSql,
  createSetLocalTenantSql,
  createTenantIsolationPolicySql,
  type PostgresSecurityPluginMetadata,
} from './security.js';
import {
  createPartitionSql,
  createPartitionedTableSql,
  createRetentionSql,
  createTimescaleCompressionSql,
  type PostgresTimeseriesPluginMetadata,
} from './timeseries.js';
import {
  buildVectorSimilarityQuerySql,
  createVectorColumnSql,
  createVectorIndexSql,
  type PostgresVectorPluginMetadata,
} from './vector.js';

export interface PostgresExecutionRequest {
  readonly executionContext?: ExecutionContext;
  readonly transactionId?: string;
}

export interface PostgresRuntimeExecutor {
  execute<T = unknown>(
    sql: string,
    params?: readonly unknown[],
    request?: PostgresExecutionRequest,
  ): Promise<T>;
}

export interface PostgresSessionExecutorOptions {
  readonly resultMode?: 'smart' | 'result-set' | 'rows' | 'first-or-null';
}

export interface PostgresSessionLike<TTransaction = unknown> {
  execute(
    query: CompiledQuery,
    options?: {
      readonly executionContext?: ExecutionContext;
      readonly transaction?: TTransaction;
    },
  ): Promise<SqlResultSet>;
  currentExecutionContext?(): ExecutionContext | undefined;
}

export interface QueueEnqueueInput {
  readonly queueName?: string;
  readonly jobName: string;
  readonly payload: unknown;
  readonly priority?: number;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
  readonly dedupeKey?: string;
}

export interface QueueFailInput {
  readonly jobId: number;
  readonly attempt: number;
  readonly error: string;
  readonly backoff?: QueueBackoffOptions;
}

export interface QueueLeaseRenewInput {
  readonly jobId: number;
  readonly workerId: string;
  readonly leaseMs?: number;
}

export interface EventPublishInput {
  readonly eventName: string;
  readonly payload: unknown;
  readonly aggregateId?: string;
  readonly aggregateType?: string;
  readonly idempotencyKey?: string;
}

export interface CacheSetInput {
  readonly key: string;
  readonly value: unknown;
  readonly expiresAt?: Date | null;
  readonly tags?: readonly string[];
}

export interface SearchInput {
  readonly table: string;
  readonly query: string;
  readonly vectorColumn?: string;
  readonly language?: string;
  readonly rankFunction?: 'ts_rank' | 'ts_rank_cd';
  readonly limit?: number;
  readonly highlightColumn?: string;
}

export interface VectorSearchInput {
  readonly table: string;
  readonly vector: readonly number[];
  readonly column?: string;
  readonly whereSql?: string;
  readonly limit?: number;
}

export interface TimeseriesPartitionInput {
  readonly table: string;
  readonly partitionName: string;
  readonly from: string;
  readonly to: string;
}

export interface SecurityPolicyInput {
  readonly table: string;
  readonly tenantColumn?: string;
  readonly settingName?: string;
  readonly policyName?: string;
}

export interface QueueWorkerOptions {
  readonly workerId?: string;
  readonly intervalMs?: number;
  readonly idleDelayMs?: number;
  readonly maxLoops?: number;
  readonly autoComplete?: boolean;
  readonly autoFail?: boolean;
  readonly autoHeartbeat?: boolean;
  readonly heartbeatIntervalMs?: number;
  readonly leaseMs?: number;
  readonly backoff?: QueueBackoffOptions;
  readonly resolveJobId?: (job: unknown) => number | undefined;
  readonly formatError?: (error: unknown) => string;
}

export interface EventDispatcherOptions {
  readonly batchSize?: number;
  readonly intervalMs?: number;
  readonly maxLoops?: number;
  readonly autoAck?: boolean;
  readonly autoFail?: boolean;
  readonly dispatcherId?: string;
  readonly leaseMs?: number;
  readonly resolveEventId?: (event: unknown) => number | undefined;
  readonly formatError?: (error: unknown) => string;
}

export interface ProvisionOptions {
  readonly lockKey?: number;
  readonly pluginName?: string;
  readonly version?: string;
  readonly strict?: boolean;
}

export interface BackgroundHandle {
  stop(): void;
  readonly done: Promise<number>;
}

export interface PostgresRuntimeMetrics {
  readonly queue: {
    readonly enqueued: number;
    readonly dequeued: number;
    readonly completed: number;
    readonly failed: number;
  };
  readonly events: {
    readonly published: number;
    readonly acked: number;
    readonly failed: number;
    readonly dispatchedBatches: number;
  };
  readonly cache: {
    readonly hits: number;
    readonly sets: number;
    readonly prunes: number;
  };
}

export interface PostgresRuntimeOptions {
  readonly config?: PostgresRuntimeConfig;
}

export type PostgresRuntimeSource =
  | PostgresRegistrationSource
  | readonly ModelPluginRegistration[];

export interface CreatePostgresRuntimeFromSessionOptions<TTransaction = unknown>
  extends PostgresRuntimeOptions,
    PostgresSessionExecutorOptions {
  readonly source?: PostgresRuntimeSource;
  readonly executionContext?: ExecutionContext;
  readonly transaction?: TTransaction;
}

const INITIAL_METRICS: PostgresRuntimeMetrics = {
  queue: { enqueued: 0, dequeued: 0, completed: 0, failed: 0 },
  events: { published: 0, acked: 0, failed: 0, dispatchedBatches: 0 },
  cache: { hits: 0, sets: 0, prunes: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneMetrics(metrics: PostgresRuntimeMetrics): PostgresRuntimeMetrics {
  return {
    queue: { ...metrics.queue },
    events: { ...metrics.events },
    cache: { ...metrics.cache },
  };
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function resolveEntityId(
  value: unknown,
  explicitResolver: ((input: unknown) => number | undefined) | undefined,
): number | undefined {
  if (explicitResolver) {
    return explicitResolver(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.id === 'number' && Number.isFinite(value.id)) {
    return value.id;
  }

  return undefined;
}

function isRegistrySource(source: PostgresRuntimeSource): source is ModelRegistry {
  return typeof source === 'object' && source !== null && 'all' in source;
}

function registrationsFromSource(
  source: PostgresRuntimeSource,
): readonly ModelPluginRegistration[] {
  if (Array.isArray(source)) {
    return source;
  }

  if (isRegistrySource(source)) {
    return source.all();
  }

  return source;
}

function resolveQueueConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresQueuePluginMetadata> {
  return Object.freeze({
    schema: config.queue?.schema ?? config.events?.schema ?? config.cache?.schema ?? 'objx_internal',
    autoProvision: config.queue?.autoProvision ?? true,
    defaultQueue: config.queue?.defaultQueue ?? 'default',
    lockTtlMs: config.queue?.lockTtlMs ?? 30_000,
    maxAttempts: config.queue?.maxAttempts ?? 8,
  });
}

function resolveEventsConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresEventsPluginMetadata> {
  return Object.freeze({
    schema: config.events?.schema ?? config.queue?.schema ?? config.cache?.schema ?? 'objx_internal',
    autoProvision: config.events?.autoProvision ?? true,
    outboxTable: config.events?.outboxTable ?? 'outbox_events',
    notifyChannel: config.events?.notifyChannel ?? 'objx_events',
    claimTtlMs: config.events?.claimTtlMs ?? 30_000,
    dispatcherId: config.events?.dispatcherId ?? 'objx-dispatcher',
  });
}

function resolveCacheConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresCachePluginMetadata> {
  return Object.freeze({
    schema: config.cache?.schema ?? config.queue?.schema ?? config.events?.schema ?? 'objx_internal',
    autoProvision: config.cache?.autoProvision ?? true,
    defaultTtlSeconds: config.cache?.defaultTtlSeconds ?? 60,
    table: config.cache?.table ?? 'cache_entries',
  });
}

function resolveSearchConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresSearchPluginMetadata> {
  return Object.freeze({
    defaultLanguage: config.search?.defaultLanguage ?? 'simple',
    autoMigrateHelpers: config.search?.autoMigrateHelpers ?? true,
    rankFunction: config.search?.rankFunction ?? 'ts_rank_cd',
  });
}

function resolveSecurityConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresSecurityPluginMetadata> {
  return Object.freeze({
    tenantSettingName: config.security?.tenantSettingName ?? 'objx.tenant_id',
    enforceRls: config.security?.enforceRls ?? true,
  });
}

function resolveTimeseriesConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresTimeseriesPluginMetadata> {
  return Object.freeze({
    useTimescaleWhenAvailable: config.timeseries?.useTimescaleWhenAvailable ?? true,
    defaultRetentionDays: config.timeseries?.defaultRetentionDays ?? 30,
    defaultPartitionWindow: config.timeseries?.defaultPartitionWindow ?? 'week',
  });
}

function resolveObservabilityConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresObservabilityPluginMetadata> {
  return Object.freeze({
    captureExplainAnalyze: config.observability?.captureExplainAnalyze ?? false,
    usePgStatStatements: config.observability?.usePgStatStatements ?? true,
    slowQueryThresholdMs: config.observability?.slowQueryThresholdMs ?? 250,
  });
}

function resolveVectorConfig(
  config: PostgresRuntimeConfig,
): Readonly<PostgresVectorPluginMetadata> {
  return Object.freeze({
    extensionName: config.vector?.extensionName ?? 'vector',
    distance: config.vector?.distance ?? 'cosine',
    indexMethod: config.vector?.indexMethod ?? 'hnsw',
  });
}

function assignResolvedConfigIfDefined<TKey extends keyof PostgresRuntimeConfig>(
  target: Partial<PostgresRuntimeConfig>,
  key: TKey,
  value: PostgresRuntimeConfig[TKey] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function mergeResolvedConfig(
  resolved: PostgresRuntimeConfig,
  override?: PostgresRuntimeConfig,
): PostgresRuntimeConfig {
  if (!override) {
    return resolved;
  }

  const merged: Partial<PostgresRuntimeConfig> = {};

  assignResolvedConfigIfDefined(merged, 'queue', override.queue ?? resolved.queue);
  assignResolvedConfigIfDefined(merged, 'events', override.events ?? resolved.events);
  assignResolvedConfigIfDefined(merged, 'cache', override.cache ?? resolved.cache);
  assignResolvedConfigIfDefined(merged, 'search', override.search ?? resolved.search);
  assignResolvedConfigIfDefined(merged, 'json', override.json ?? resolved.json);
  assignResolvedConfigIfDefined(merged, 'security', override.security ?? resolved.security);
  assignResolvedConfigIfDefined(
    merged,
    'observability',
    override.observability ?? resolved.observability,
  );
  assignResolvedConfigIfDefined(
    merged,
    'timeseries',
    override.timeseries ?? resolved.timeseries,
  );
  assignResolvedConfigIfDefined(merged, 'vector', override.vector ?? resolved.vector);

  return Object.freeze(merged);
}

function createCompiledQuery(
  sqlText: string,
  params: readonly unknown[] = [],
): CompiledQuery {
  return {
    sql: sqlText,
    parameters: params.map((value) => ({ value })),
    metadata: Object.freeze({}),
  };
}

function normalizeSessionResult(
  resultSet: SqlResultSet,
  mode: PostgresSessionExecutorOptions['resultMode'],
): unknown {
  const resultMode = mode ?? 'smart';

  if (resultMode === 'result-set') {
    return resultSet;
  }

  if (resultMode === 'rows') {
    return resultSet.rows;
  }

  if (resultMode === 'first-or-null') {
    return resultSet.rows[0] ?? null;
  }

  if (resultSet.rows.length === 0) {
    return null;
  }

  if (resultSet.rows.length === 1) {
    return resultSet.rows[0];
  }

  return resultSet.rows;
}

export function createPostgresSessionExecutor<TTransaction = unknown>(
  session: PostgresSessionLike<TTransaction>,
  options: PostgresSessionExecutorOptions & {
    readonly executionContext?: ExecutionContext;
    readonly transaction?: TTransaction;
  } = {},
): PostgresRuntimeExecutor {
  return {
    async execute<T = unknown>(
      sqlText: string,
      params: readonly unknown[] = [],
      request?: PostgresExecutionRequest,
    ): Promise<T> {
      const compiledQuery = createCompiledQuery(sqlText, params);
      const executionContext =
        request?.executionContext ??
        options.executionContext ??
        session.currentExecutionContext?.();

      const resultSet = await session.execute(compiledQuery, {
        ...(executionContext ? { executionContext } : {}),
        ...(options.transaction !== undefined ? { transaction: options.transaction } : {}),
      });

      return normalizeSessionResult(resultSet, options.resultMode) as T;
    },
  };
}

export class PostgresRuntime {
  readonly #executor: PostgresRuntimeExecutor;
  readonly #request: PostgresExecutionRequest | undefined;
  readonly #config: PostgresRuntimeConfig;
  #metrics: PostgresRuntimeMetrics = INITIAL_METRICS;

  constructor(
    executor: PostgresRuntimeExecutor,
    request?: PostgresExecutionRequest,
    config: PostgresRuntimeConfig = Object.freeze({}),
  ) {
    this.#executor = executor;
    this.#request = request;
    this.#config = config;
  }

  get config(): PostgresRuntimeConfig {
    return this.#config;
  }

  async provisionInternalSchema(options: ProvisionOptions = {}): Promise<void> {
    const lockKey = options.lockKey ?? 883_201;
    const queueConfig = resolveQueueConfig(this.#config);
    const eventsConfig = resolveEventsConfig(this.#config);
    const cacheConfig = resolveCacheConfig(this.#config);
    const schema = queueConfig.schema;

    await this.#executor.execute(createPostgresAdvisoryLockSql(lockKey), [], this.#request);

    try {
      for (const ddl of createPostgresInternalSchemaSql({
        schema,
        queueTable: 'queue_jobs',
        dlqTable: 'queue_dlq',
        outboxTable: eventsConfig.outboxTable,
        cacheTable: cacheConfig.table,
        migrationsTable: 'runtime_migrations',
      })) {
        await this.#executor.execute(ddl, [], this.#request);
      }

      const pluginName = options.pluginName ?? 'postgres-runtime';
      const version = options.version ?? '1';

      if (options.strict) {
        const existing = await this.#executor.execute<{ rowCount?: number }>(
          `select count(*)::int as "rowCount" from "${schema}"."runtime_migrations" where plugin_name = $1 and version = $2;`,
          [pluginName, version],
          this.#request,
        );

        const count = typeof existing?.rowCount === 'number' ? existing.rowCount : 0;
        if (count === 0) {
          throw new Error(
            `Strict mode enabled and runtime migration ${pluginName}@${version} is not registered.`,
          );
        }
      } else {
        await this.#executor.execute(
          `insert into "${schema}"."runtime_migrations" (plugin_name, version) values ($1, $2) on conflict do nothing;`,
          [pluginName, version],
          this.#request,
        );
      }
    } finally {
      await this.#executor.execute(createPostgresAdvisoryUnlockSql(lockKey), [], this.#request);
    }
  }

  withRequest(request: PostgresExecutionRequest): PostgresRuntime {
    const next = new PostgresRuntime(this.#executor, request, this.#config);
    next.#metrics = cloneMetrics(this.#metrics);
    return next;
  }

  metrics(): PostgresRuntimeMetrics {
    return cloneMetrics(this.#metrics);
  }

  readonly queue = {
    enqueue: async (input: QueueEnqueueInput): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, enqueued: this.#metrics.queue.enqueued + 1 },
      };

      return this.#executor.execute(
        buildQueueEnqueueSql(queueConfig.schema),
        [
          input.queueName ?? queueConfig.defaultQueue,
          input.jobName,
          JSON.stringify(input.payload),
          input.priority ?? 0,
          input.runAt ?? new Date(),
          input.maxAttempts ?? queueConfig.maxAttempts,
          input.dedupeKey ?? null,
        ],
        this.#request,
      );
    },

    dequeue: async (workerId: string): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, dequeued: this.#metrics.queue.dequeued + 1 },
      };

      return this.#executor.execute(
        buildQueueDequeueSql(queueConfig.schema, 'queue_jobs', {
          lockTtlMs: queueConfig.lockTtlMs,
        }),
        [workerId, queueConfig.lockTtlMs],
        this.#request,
      );
    },

    renewLease: async (input: QueueLeaseRenewInput): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);
      const leaseMs = Math.max(1, Math.trunc(input.leaseMs ?? queueConfig.lockTtlMs));

      return this.#executor.execute(
        buildQueueRenewLeaseSql(queueConfig.schema, 'queue_jobs', {
          lockTtlMs: leaseMs,
        }),
        [input.jobId, input.workerId, leaseMs],
        this.#request,
      );
    },

    reclaimExpired: async (_workerId: string, leaseMs?: number): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);
      const effectiveLeaseMs = Math.max(1, Math.trunc(leaseMs ?? queueConfig.lockTtlMs));

      return this.#executor.execute(
        buildQueueReclaimExpiredSql(queueConfig.schema, 'queue_jobs', {
          lockTtlMs: effectiveLeaseMs,
        }),
        [effectiveLeaseMs],
        this.#request,
      );
    },

    complete: async (jobId: number): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, completed: this.#metrics.queue.completed + 1 },
      };

      return this.#executor.execute(
        buildQueueCompleteSql(queueConfig.schema),
        [jobId],
        this.#request,
      );
    },

    fail: async (input: QueueFailInput): Promise<unknown> => {
      const queueConfig = resolveQueueConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, failed: this.#metrics.queue.failed + 1 },
      };

      const retryDelayMs = computeQueueBackoffMs(input.attempt, input.backoff);

      return this.#executor.execute(
        buildQueueFailSql(queueConfig.schema),
        [input.jobId, retryDelayMs, input.error],
        this.#request,
      );
    },
  };

  readonly events = {
    publish: async (input: EventPublishInput): Promise<unknown> => {
      const eventsConfig = resolveEventsConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, published: this.#metrics.events.published + 1 },
      };

      const row = await this.#executor.execute(
        buildOutboxPublishSql(eventsConfig.schema, eventsConfig.outboxTable),
        [
          input.eventName,
          JSON.stringify(input.payload),
          input.aggregateId ?? null,
          input.aggregateType ?? null,
          input.idempotencyKey ?? null,
        ],
        this.#request,
      );

      await this.#executor.execute(
        buildNotifySql(eventsConfig.notifyChannel),
        [input.eventName],
        this.#request,
      );

      return row;
    },

    dispatchBatch: async (
      batchSize: number,
      options: {
        readonly dispatcherId?: string;
        readonly leaseMs?: number;
      } = {},
    ): Promise<unknown> => {
      const eventsConfig = resolveEventsConfig(this.#config);
      const dispatcherId = options.dispatcherId ?? eventsConfig.dispatcherId;
      const leaseMs = Math.max(1, Math.trunc(options.leaseMs ?? eventsConfig.claimTtlMs));

      this.#metrics = {
        ...this.#metrics,
        events: {
          ...this.#metrics.events,
          dispatchedBatches: this.#metrics.events.dispatchedBatches + 1,
        },
      };

      return this.#executor.execute(
        buildOutboxDispatchBatchSql(eventsConfig.schema, eventsConfig.outboxTable),
        [batchSize, dispatcherId, leaseMs],
        this.#request,
      );
    },

    ack: async (id: number): Promise<unknown> => {
      const eventsConfig = resolveEventsConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, acked: this.#metrics.events.acked + 1 },
      };

      return this.#executor.execute(
        buildOutboxAckSql(eventsConfig.schema, eventsConfig.outboxTable),
        [id],
        this.#request,
      );
    },

    fail: async (id: number, error: string): Promise<unknown> => {
      const eventsConfig = resolveEventsConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, failed: this.#metrics.events.failed + 1 },
      };

      return this.#executor.execute(
        buildOutboxFailSql(eventsConfig.schema, eventsConfig.outboxTable),
        [id, error],
        this.#request,
      );
    },

    listen: async (
      channel = resolveEventsConfig(this.#config).notifyChannel,
    ): Promise<unknown> => {
      return this.#executor.execute(buildListenSql(channel), [], this.#request);
    },
  };

  readonly cache = {
    get: async (key: string): Promise<unknown> => {
      const cacheConfig = resolveCacheConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, hits: this.#metrics.cache.hits + 1 },
      };

      return this.#executor.execute(
        buildCacheGetSql(cacheConfig.schema, cacheConfig.table),
        [key],
        this.#request,
      );
    },

    set: async (input: CacheSetInput): Promise<unknown> => {
      const cacheConfig = resolveCacheConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, sets: this.#metrics.cache.sets + 1 },
      };

      const expiresAt =
        input.expiresAt === undefined
          ? new Date(Date.now() + cacheConfig.defaultTtlSeconds * 1_000)
          : input.expiresAt;

      return this.#executor.execute(
        buildCacheUpsertSql(cacheConfig.schema, cacheConfig.table),
        [input.key, JSON.stringify(input.value), expiresAt ?? null, input.tags ?? []],
        this.#request,
      );
    },

    getOrCompute: async <TValue>(
      key: string,
      compute: () => Promise<TValue>,
      options: { expiresAt?: Date | null; tags?: readonly string[] } = {},
    ): Promise<TValue> => {
      const cached = await this.cache.get(key);

      if (cached && typeof cached === 'object' && 'value' in (cached as Record<string, unknown>)) {
        return (cached as { value: TValue }).value;
      }

      const value = await compute();

      await this.cache.set({
        key,
        value,
        ...(options.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
        ...(options.tags !== undefined ? { tags: options.tags } : {}),
      });

      return value;
    },

    pruneExpired: async (): Promise<unknown> => {
      const cacheConfig = resolveCacheConfig(this.#config);

      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, prunes: this.#metrics.cache.prunes + 1 },
      };

      return this.#executor.execute(
        buildCachePruneExpiredSql(cacheConfig.schema, cacheConfig.table),
        [],
        this.#request,
      );
    },

    metrics: async (): Promise<unknown> => {
      const cacheConfig = resolveCacheConfig(this.#config);

      return this.#executor.execute(
        buildCacheMetricsSql(cacheConfig.schema, cacheConfig.table),
        [],
        this.#request,
      );
    },
  };

  readonly search = {
    query: async (input: SearchInput): Promise<unknown> => {
      const searchConfig = resolveSearchConfig(this.#config);
      const sql = buildPostgresSearchQuerySql({
        ...input,
        language: input.language ?? searchConfig.defaultLanguage,
        rankFunction: input.rankFunction ?? searchConfig.rankFunction,
      });

      return this.#executor.execute(sql, [input.query], this.#request);
    },
  };

  readonly vector = {
    addColumn: async (
      table: string,
      column = 'embedding',
      dimensions = 1536,
    ): Promise<unknown> => {
      return this.#executor.execute(
        createVectorColumnSql(table, column, dimensions),
        [],
        this.#request,
      );
    },

    createIndex: async (
      table: string,
      column = 'embedding',
    ): Promise<unknown> => {
      const vectorConfig = resolveVectorConfig(this.#config);
      const operatorClass =
        vectorConfig.distance === 'l2'
          ? 'vector_l2_ops'
          : vectorConfig.distance === 'ip'
            ? 'vector_ip_ops'
            : 'vector_cosine_ops';

      return this.#executor.execute(
        createVectorIndexSql({
          table,
          column,
          method: vectorConfig.indexMethod,
          operatorClass,
        }),
        [],
        this.#request,
      );
    },

    similarity: async (input: VectorSearchInput): Promise<unknown> => {
      const vectorConfig = resolveVectorConfig(this.#config);
      const distanceOperator =
        vectorConfig.distance === 'l2'
          ? '<->'
          : vectorConfig.distance === 'ip'
            ? '<#>'
            : '<=>';

      const sql = buildVectorSimilarityQuerySql({
        ...input,
        distanceOperator,
      });

      return this.#executor.execute(
        sql,
        [`[${input.vector.join(',')}]`],
        this.#request,
      );
    },
  };

  readonly timeseries = {
    setupPartitioning: async (
      table: string,
      timestampColumn: string,
    ): Promise<unknown> => {
      return this.#executor.execute(
        createPartitionedTableSql({ table, timestampColumn }),
        [],
        this.#request,
      );
    },

    createPartition: async (input: TimeseriesPartitionInput): Promise<unknown> => {
      return this.#executor.execute(createPartitionSql(input), [], this.#request);
    },

    applyRetention: async (
      table: string,
      timestampColumn: string,
      retentionDays?: number,
    ): Promise<unknown> => {
      const timeseriesConfig = resolveTimeseriesConfig(this.#config);

      return this.#executor.execute(
        createRetentionSql({
          table,
          timestampColumn,
          retentionDays: retentionDays ?? timeseriesConfig.defaultRetentionDays,
        }),
        [],
        this.#request,
      );
    },

    enableTimescaleCompression: async (hypertable: string): Promise<unknown> => {
      return this.#executor.execute(
        createTimescaleCompressionSql(hypertable),
        [],
        this.#request,
      );
    },
  };

  readonly json = {
    wherePath: (column: string, path: string): string => buildJsonPathWhereSql(column, path),
    projection: (column: string, paths: readonly string[]): string =>
      buildJsonProjectionSql(column, paths),
  };

  readonly security = {
    enableRls: async (table: string): Promise<unknown> => {
      return this.#executor.execute(createEnableRlsSql(table), [], this.#request);
    },

    createTenantPolicy: async (input: SecurityPolicyInput): Promise<unknown> => {
      const securityConfig = resolveSecurityConfig(this.#config);

      return this.#executor.execute(
        createTenantIsolationPolicySql({
          ...input,
          settingName: input.settingName ?? securityConfig.tenantSettingName,
        }),
        [],
        this.#request,
      );
    },

    setLocalTenant: async (
      tenantId: string,
      settingName = resolveSecurityConfig(this.#config).tenantSettingName,
    ): Promise<unknown> => {
      return this.#executor.execute(
        createSetLocalTenantSql(settingName),
        [tenantId],
        this.#request,
      );
    },
  };

  readonly observability = {
    explainAnalyze: async (sqlText: string): Promise<unknown> => {
      return this.#executor.execute(createExplainAnalyzeSql(sqlText), [], this.#request);
    },

    topStatements: async (limit = 20): Promise<unknown> => {
      const observabilityConfig = resolveObservabilityConfig(this.#config);

      if (!observabilityConfig.usePgStatStatements) {
        throw new Error('pg_stat_statements support is disabled by runtime plugin config.');
      }

      return this.#executor.execute(createPgStatStatementsSql(limit), [], this.#request);
    },

    lint: (sqlText: string): readonly SqlLintIssue[] => lintSqlAntiPatterns(sqlText),
  };

  async runQueueWorker(
    handler: (job: unknown) => Promise<void>,
    options: QueueWorkerOptions = {},
  ): Promise<number> {
    const queueConfig = resolveQueueConfig(this.#config);
    const workerId = options.workerId ?? 'objx-worker';
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
    const idleDelayMs = options.idleDelayMs ?? options.intervalMs ?? 250;
    const autoHeartbeat = options.autoHeartbeat ?? false;
    const leaseMs = Math.max(1, Math.trunc(options.leaseMs ?? queueConfig.lockTtlMs));
    const heartbeatIntervalMs = Math.max(
      1,
      Math.trunc(options.heartbeatIntervalMs ?? Math.max(1, Math.floor(leaseMs / 2))),
    );
    let loops = 0;

    while (loops < maxLoops) {
      const job = await this.queue.dequeue(workerId);

      if (!job) {
        await delay(idleDelayMs);
        loops += 1;
        continue;
      }

      const jobId = resolveEntityId(job, options.resolveJobId);
      let heartbeatHandle: ReturnType<typeof setInterval> | undefined;

      try {
        if (autoHeartbeat && jobId !== undefined) {
          heartbeatHandle = setInterval(() => {
            void this.queue.renewLease({
              jobId,
              workerId,
              leaseMs,
            });
          }, heartbeatIntervalMs);
        }

        await handler(job);

        if (heartbeatHandle) {
          clearInterval(heartbeatHandle);
          heartbeatHandle = undefined;
        }

        if (options.autoComplete ?? true) {
          if (jobId !== undefined) {
            await this.queue.complete(jobId);
          }
        }
      } catch (error) {
        if (heartbeatHandle) {
          clearInterval(heartbeatHandle);
          heartbeatHandle = undefined;
        }

        if (options.autoFail ?? true) {
          if (jobId !== undefined) {
            await this.queue.fail({
              jobId,
              attempt:
                isRecord(job) && typeof job.attempts === 'number'
                  ? job.attempts + 1
                  : 1,
              error: options.formatError?.(error) ?? normalizeErrorMessage(error),
              ...(options.backoff !== undefined ? { backoff: options.backoff } : {}),
            });
          }
        }

        throw error;
      }

      loops += 1;
    }

    return loops;
  }

  async runEventDispatcher(
    handler: (event: unknown) => Promise<void>,
    options: EventDispatcherOptions = {},
  ): Promise<number> {
    const eventsConfig = resolveEventsConfig(this.#config);
    const batchSize = options.batchSize ?? 100;
    const intervalMs = options.intervalMs ?? 250;
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
    const dispatcherId = options.dispatcherId ?? eventsConfig.dispatcherId;
    const leaseMs = Math.max(1, Math.trunc(options.leaseMs ?? eventsConfig.claimTtlMs));
    let loops = 0;

    while (loops < maxLoops) {
      const batch = await this.events.dispatchBatch(batchSize, {
        dispatcherId,
        leaseMs,
      });

      if (!Array.isArray(batch) || batch.length === 0) {
        await delay(intervalMs);
        loops += 1;
        continue;
      }

      for (const event of batch) {
        try {
          await handler(event);

          if (options.autoAck ?? true) {
            const eventId = resolveEntityId(event, options.resolveEventId);

            if (eventId !== undefined) {
              await this.events.ack(eventId);
            }
          }
        } catch (error) {
          if (options.autoFail ?? true) {
            const eventId = resolveEntityId(event, options.resolveEventId);

            if (eventId !== undefined) {
              await this.events.fail(
                eventId,
                options.formatError?.(error) ?? normalizeErrorMessage(error),
              );
            }
          }

          throw error;
        }
      }

      loops += 1;
    }

    return loops;
  }

  startQueueWorker(
    handler: (job: unknown) => Promise<void>,
    options: QueueWorkerOptions = {},
  ): BackgroundHandle {
    let stopped = false;

    const done = (async () => {
      let loops = 0;
      const queueConfig = resolveQueueConfig(this.#config);
      const workerId = options.workerId ?? 'objx-worker';
      const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
      const idleDelayMs = options.idleDelayMs ?? options.intervalMs ?? 250;
      const autoHeartbeat = options.autoHeartbeat ?? false;
      const leaseMs = Math.max(1, Math.trunc(options.leaseMs ?? queueConfig.lockTtlMs));
      const heartbeatIntervalMs = Math.max(
        1,
        Math.trunc(options.heartbeatIntervalMs ?? Math.max(1, Math.floor(leaseMs / 2))),
      );

      while (!stopped && loops < maxLoops) {
        const job = await this.queue.dequeue(workerId);

        if (!job) {
          await delay(idleDelayMs);
          loops += 1;
          continue;
        }

        const jobId = resolveEntityId(job, options.resolveJobId);
        let heartbeatHandle: ReturnType<typeof setInterval> | undefined;

        try {
          if (autoHeartbeat && jobId !== undefined) {
            heartbeatHandle = setInterval(() => {
              void this.queue.renewLease({
                jobId,
                workerId,
                leaseMs,
              });
            }, heartbeatIntervalMs);
          }

          await handler(job);

          if (heartbeatHandle) {
            clearInterval(heartbeatHandle);
            heartbeatHandle = undefined;
          }

          if (options.autoComplete ?? true) {
            if (jobId !== undefined) {
              await this.queue.complete(jobId);
            }
          }
        } catch (error) {
          if (heartbeatHandle) {
            clearInterval(heartbeatHandle);
            heartbeatHandle = undefined;
          }

          if (options.autoFail ?? true) {
            if (jobId !== undefined) {
              await this.queue.fail({
                jobId,
                attempt:
                  isRecord(job) && typeof job.attempts === 'number'
                    ? job.attempts + 1
                    : 1,
                error: options.formatError?.(error) ?? normalizeErrorMessage(error),
                ...(options.backoff !== undefined ? { backoff: options.backoff } : {}),
              });
            }
          }

          throw error;
        }

        loops += 1;
      }

      return loops;
    })();

    return {
      stop() {
        stopped = true;
      },
      done,
    };
  }

  startEventDispatcher(
    handler: (event: unknown) => Promise<void>,
    options: EventDispatcherOptions = {},
  ): BackgroundHandle {
    let stopped = false;

    const done = (async () => {
      let loops = 0;
      const eventsConfig = resolveEventsConfig(this.#config);
      const batchSize = options.batchSize ?? 100;
      const intervalMs = options.intervalMs ?? 250;
      const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
      const dispatcherId = options.dispatcherId ?? eventsConfig.dispatcherId;
      const leaseMs = Math.max(1, Math.trunc(options.leaseMs ?? eventsConfig.claimTtlMs));

      while (!stopped && loops < maxLoops) {
        const batch = await this.events.dispatchBatch(batchSize, {
          dispatcherId,
          leaseMs,
        });

        if (!Array.isArray(batch) || batch.length === 0) {
          await delay(intervalMs);
          loops += 1;
          continue;
        }

        for (const event of batch) {
          if (stopped) {
            break;
          }

          try {
            await handler(event);

            if (options.autoAck ?? true) {
              const eventId = resolveEntityId(event, options.resolveEventId);

              if (eventId !== undefined) {
                await this.events.ack(eventId);
              }
            }
          } catch (error) {
            if (options.autoFail ?? true) {
              const eventId = resolveEntityId(event, options.resolveEventId);

              if (eventId !== undefined) {
                await this.events.fail(
                  eventId,
                  options.formatError?.(error) ?? normalizeErrorMessage(error),
                );
              }
            }

            throw error;
          }
        }

        loops += 1;
      }

      return loops;
    })();

    return {
      stop() {
        stopped = true;
      },
      done,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createPostgresRuntime(
  executor: PostgresRuntimeExecutor,
  options: PostgresRuntimeOptions = {},
): PostgresRuntime {
  return new PostgresRuntime(
    executor,
    undefined,
    options.config ?? Object.freeze({}),
  );
}

export function createPostgresRuntimeFromConfig(
  executor: PostgresRuntimeExecutor,
  config: PostgresRuntimeConfig,
): PostgresRuntime {
  return new PostgresRuntime(executor, undefined, config);
}

export function createPostgresRuntimeFromRegistrations(
  executor: PostgresRuntimeExecutor,
  source: PostgresRuntimeSource,
  options: PostgresRuntimeOptions = {},
): PostgresRuntime {
  const resolved = resolvePostgresConfig(registrationsFromSource(source));
  return new PostgresRuntime(
    executor,
    undefined,
    mergeResolvedConfig(resolved, options.config),
  );
}

export function createPostgresRuntimeFromRegistry(
  executor: PostgresRuntimeExecutor,
  registry: ModelRegistry,
  options: PostgresRuntimeOptions = {},
): PostgresRuntime {
  return createPostgresRuntimeFromRegistrations(executor, registry, options);
}

export function createPostgresRuntimeFromSession<TTransaction = unknown>(
  session: PostgresSessionLike<TTransaction>,
  options: CreatePostgresRuntimeFromSessionOptions<TTransaction> = {},
): PostgresRuntime {
  const executorOptions: PostgresSessionExecutorOptions & {
    readonly executionContext?: ExecutionContext;
    readonly transaction?: TTransaction;
  } = {
    ...(options.resultMode !== undefined ? { resultMode: options.resultMode } : {}),
    ...(options.executionContext ? { executionContext: options.executionContext } : {}),
    ...(options.transaction !== undefined ? { transaction: options.transaction } : {}),
  };

  const executor = createPostgresSessionExecutor(session, executorOptions);

  const resolvedConfig = options.source
    ? resolvePostgresConfig(registrationsFromSource(options.source))
    : Object.freeze({});

  return new PostgresRuntime(
    executor,
    options.executionContext ? { executionContext: options.executionContext } : undefined,
    mergeResolvedConfig(resolvedConfig, options.config),
  );
}

export function createPostgresRuntimeFromObjxSession<TTransaction = unknown>(
  session: ObjxSession<TTransaction>,
  options: CreatePostgresRuntimeFromSessionOptions<TTransaction> = {},
): PostgresRuntime {
  return createPostgresRuntimeFromSession(session, options);
}

/**
 * @deprecated Use `PostgresRuntimeOptions`.
 */
export type PostgresSpecialistRuntimeOptions = PostgresRuntimeOptions;

/**
 * @deprecated Use `PostgresRuntimeSource`.
 */
export type PostgresSpecialistRuntimeSource = PostgresRuntimeSource;

/**
 * @deprecated Use `PostgresRuntime`.
 */
export const PostgresSpecialistRuntime = PostgresRuntime;

/**
 * @deprecated Use `createPostgresRuntime`.
 */
export const createPostgresSpecialistRuntime = createPostgresRuntime;

/**
 * @deprecated Use `createPostgresRuntimeFromConfig`.
 */
export const createPostgresSpecialistRuntimeFromConfig =
  createPostgresRuntimeFromConfig;

/**
 * @deprecated Use `createPostgresRuntimeFromRegistrations`.
 */
export const createPostgresSpecialistRuntimeFromRegistrations =
  createPostgresRuntimeFromRegistrations;

/**
 * @deprecated Use `createPostgresRuntimeFromRegistry`.
 */
export const createPostgresSpecialistRuntimeFromRegistry =
  createPostgresRuntimeFromRegistry;

/**
 * @deprecated Use `createPostgresRuntimeFromSession`.
 */
export const createPostgresSpecialistRuntimeFromSession =
  createPostgresRuntimeFromSession;

/**
 * @deprecated Use `createPostgresRuntimeFromObjxSession`.
 */
export const createPostgresSpecialistRuntimeFromObjxSession =
  createPostgresRuntimeFromObjxSession;

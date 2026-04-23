import type { ExecutionContext } from '@qbobjx/core';

import {
  buildCacheGetSql,
  buildCacheMetricsSql,
  buildCachePruneExpiredSql,
  buildCacheUpsertSql,
} from './cache.js';
import {
  buildListenSql,
  buildNotifySql,
  buildOutboxAckSql,
  buildOutboxDispatchBatchSql,
  buildOutboxFailSql,
  buildOutboxPublishSql,
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
  type SqlLintIssue,
} from './observability.js';
import {
  buildQueueCompleteSql,
  buildQueueDequeueSql,
  buildQueueEnqueueSql,
  buildQueueFailSql,
  computeQueueBackoffMs,
  type QueueBackoffOptions,
} from './queue.js';
import { buildPostgresSearchQuerySql } from './search.js';
import {
  createEnableRlsSql,
  createSetLocalTenantSql,
  createTenantIsolationPolicySql,
} from './security.js';
import {
  createPartitionSql,
  createPartitionedTableSql,
  createRetentionSql,
  createTimescaleCompressionSql,
} from './timeseries.js';
import {
  buildVectorSimilarityQuerySql,
  createVectorColumnSql,
  createVectorIndexSql,
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

export interface QueueEnqueueInput {
  readonly queueName: string;
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
}

export interface EventDispatcherOptions {
  readonly batchSize?: number;
  readonly intervalMs?: number;
  readonly maxLoops?: number;
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

const INITIAL_METRICS: PostgresRuntimeMetrics = {
  queue: { enqueued: 0, dequeued: 0, completed: 0, failed: 0 },
  events: { published: 0, acked: 0, failed: 0, dispatchedBatches: 0 },
  cache: { hits: 0, sets: 0, prunes: 0 },
};

export class PostgresSpecialistRuntime {
  readonly #executor: PostgresRuntimeExecutor;
  readonly #request: PostgresExecutionRequest | undefined;
  #metrics: PostgresRuntimeMetrics = INITIAL_METRICS;

  constructor(executor: PostgresRuntimeExecutor, request?: PostgresExecutionRequest) {
    this.#executor = executor;
    this.#request = request;
  }

  async provisionInternalSchema(options: ProvisionOptions = {}): Promise<void> {
    const lockKey = options.lockKey ?? 883_201;
    await this.#executor.execute(createPostgresAdvisoryLockSql(lockKey), [], this.#request);

    try {
      for (const ddl of createPostgresInternalSchemaSql()) {
        await this.#executor.execute(ddl, [], this.#request);
      }

      const pluginName = options.pluginName ?? 'postgres-specialist-runtime';
      const version = options.version ?? '1';

      if (options.strict) {
        const existing = await this.#executor.execute<{ rowCount?: number }>(
          `select count(*)::int as rowCount from objx_internal.runtime_migrations where plugin_name = $1 and version = $2;`,
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
          `insert into objx_internal.runtime_migrations (plugin_name, version) values ($1, $2) on conflict do nothing;`,
          [pluginName, version],
          this.#request,
        );
      }
    } finally {
      await this.#executor.execute(createPostgresAdvisoryUnlockSql(lockKey), [], this.#request);
    }
  }

  withRequest(request: PostgresExecutionRequest): PostgresSpecialistRuntime {
    return new PostgresSpecialistRuntime(this.#executor, request);
  }

  metrics(): PostgresRuntimeMetrics {
    return {
      queue: { ...this.#metrics.queue },
      events: { ...this.#metrics.events },
      cache: { ...this.#metrics.cache },
    };
  }

  readonly queue = {
    enqueue: async (input: QueueEnqueueInput): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, enqueued: this.#metrics.queue.enqueued + 1 },
      };
      return this.#executor.execute(
        buildQueueEnqueueSql(),
        [
          input.queueName,
          input.jobName,
          JSON.stringify(input.payload),
          input.priority ?? 0,
          input.runAt ?? new Date(),
          input.maxAttempts ?? 8,
          input.dedupeKey ?? null,
        ],
        this.#request,
      );
    },
    dequeue: async (workerId: string): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, dequeued: this.#metrics.queue.dequeued + 1 },
      };
      return this.#executor.execute(buildQueueDequeueSql(), [workerId], this.#request);
    },
    complete: async (jobId: number): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, completed: this.#metrics.queue.completed + 1 },
      };
      return this.#executor.execute(buildQueueCompleteSql(), [jobId], this.#request);
    },
    fail: async (input: QueueFailInput): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        queue: { ...this.#metrics.queue, failed: this.#metrics.queue.failed + 1 },
      };
      const retryDelayMs = computeQueueBackoffMs(input.attempt, input.backoff);
      return this.#executor.execute(
        buildQueueFailSql(),
        [input.jobId, retryDelayMs, input.error],
        this.#request,
      );
    },
  };

  readonly events = {
    publish: async (input: EventPublishInput): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, published: this.#metrics.events.published + 1 },
      };
      const row = await this.#executor.execute(
        buildOutboxPublishSql(),
        [
          input.eventName,
          JSON.stringify(input.payload),
          input.aggregateId ?? null,
          input.aggregateType ?? null,
          input.idempotencyKey ?? null,
        ],
        this.#request,
      );
      await this.#executor.execute(buildNotifySql(), [input.eventName], this.#request);
      return row;
    },
    dispatchBatch: async (batchSize: number): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        events: {
          ...this.#metrics.events,
          dispatchedBatches: this.#metrics.events.dispatchedBatches + 1,
        },
      };
      return this.#executor.execute(buildOutboxDispatchBatchSql(), [batchSize], this.#request);
    },
    ack: async (id: number): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, acked: this.#metrics.events.acked + 1 },
      };
      return this.#executor.execute(buildOutboxAckSql(), [id], this.#request);
    },
    fail: async (id: number, error: string): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        events: { ...this.#metrics.events, failed: this.#metrics.events.failed + 1 },
      };
      return this.#executor.execute(buildOutboxFailSql(), [id, error], this.#request);
    },
    listen: async (channel = 'objx_events'): Promise<unknown> => {
      return this.#executor.execute(buildListenSql(channel), [], this.#request);
    },
  };

  readonly cache = {
    get: async (key: string): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, hits: this.#metrics.cache.hits + 1 },
      };
      return this.#executor.execute(buildCacheGetSql(), [key], this.#request);
    },
    set: async (input: CacheSetInput): Promise<unknown> => {
      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, sets: this.#metrics.cache.sets + 1 },
      };
      return this.#executor.execute(
        buildCacheUpsertSql(),
        [input.key, JSON.stringify(input.value), input.expiresAt ?? null, input.tags ?? []],
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
      this.#metrics = {
        ...this.#metrics,
        cache: { ...this.#metrics.cache, prunes: this.#metrics.cache.prunes + 1 },
      };
      return this.#executor.execute(buildCachePruneExpiredSql(), [], this.#request);
    },
    metrics: async (): Promise<unknown> =>
      this.#executor.execute(buildCacheMetricsSql(), [], this.#request),
  };

  readonly search = {
    query: async (input: SearchInput): Promise<unknown> => {
      const sql = buildPostgresSearchQuerySql(input);
      return this.#executor.execute(sql, [input.query], this.#request);
    },
  };

  readonly vector = {
    addColumn: async (table: string, column = 'embedding', dimensions = 1536): Promise<unknown> => {
      return this.#executor.execute(createVectorColumnSql(table, column, dimensions), [], this.#request);
    },
    createIndex: async (table: string, column = 'embedding'): Promise<unknown> => {
      return this.#executor.execute(createVectorIndexSql({ table, column }), [], this.#request);
    },
    similarity: async (input: VectorSearchInput): Promise<unknown> => {
      const sql = buildVectorSimilarityQuerySql(input);
      return this.#executor.execute(sql, [`[${input.vector.join(',')}]`], this.#request);
    },
  };

  readonly timeseries = {
    setupPartitioning: async (table: string, timestampColumn: string): Promise<unknown> => {
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
      retentionDays: number,
    ): Promise<unknown> => {
      return this.#executor.execute(
        createRetentionSql({ table, timestampColumn, retentionDays }),
        [],
        this.#request,
      );
    },
    enableTimescaleCompression: async (hypertable: string): Promise<unknown> => {
      return this.#executor.execute(createTimescaleCompressionSql(hypertable), [], this.#request);
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
      return this.#executor.execute(createTenantIsolationPolicySql(input), [], this.#request);
    },
    setLocalTenant: async (tenantId: string, settingName = 'objx.tenant_id'): Promise<unknown> => {
      return this.#executor.execute(createSetLocalTenantSql(settingName), [tenantId], this.#request);
    },
  };

  readonly observability = {
    explainAnalyze: async (sqlText: string): Promise<unknown> => {
      return this.#executor.execute(createExplainAnalyzeSql(sqlText), [], this.#request);
    },
    topStatements: async (limit = 20): Promise<unknown> => {
      return this.#executor.execute(createPgStatStatementsSql(limit), [], this.#request);
    },
    lint: (sqlText: string): readonly SqlLintIssue[] => lintSqlAntiPatterns(sqlText),
  };

  async runQueueWorker(
    handler: (job: unknown) => Promise<void>,
    options: QueueWorkerOptions = {},
  ): Promise<number> {
    const workerId = options.workerId ?? 'objx-worker';
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
    const idleDelayMs = options.idleDelayMs ?? options.intervalMs ?? 250;
    let loops = 0;

    while (loops < maxLoops) {
      const job = await this.queue.dequeue(workerId);

      if (!job) {
        await delay(idleDelayMs);
        loops += 1;
        continue;
      }

      await handler(job);
      loops += 1;
    }

    return loops;
  }

  async runEventDispatcher(
    handler: (event: unknown) => Promise<void>,
    options: EventDispatcherOptions = {},
  ): Promise<number> {
    const batchSize = options.batchSize ?? 100;
    const intervalMs = options.intervalMs ?? 250;
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
    let loops = 0;

    while (loops < maxLoops) {
      const batch = await this.events.dispatchBatch(batchSize);
      if (!Array.isArray(batch) || batch.length === 0) {
        await delay(intervalMs);
        loops += 1;
        continue;
      }

      for (const event of batch) {
        await handler(event);
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
    const workerId = options.workerId ?? 'objx-worker';
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;
    const idleDelayMs = options.idleDelayMs ?? options.intervalMs ?? 250;

    const done = (async () => {
      let loops = 0;
      while (!stopped && loops < maxLoops) {
        const job = await this.queue.dequeue(workerId);

        if (!job) {
          await delay(idleDelayMs);
          loops += 1;
          continue;
        }

        await handler(job);
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
    const batchSize = options.batchSize ?? 100;
    const intervalMs = options.intervalMs ?? 250;
    const maxLoops = options.maxLoops ?? Number.POSITIVE_INFINITY;

    const done = (async () => {
      let loops = 0;
      while (!stopped && loops < maxLoops) {
        const batch = await this.events.dispatchBatch(batchSize);

        if (!Array.isArray(batch) || batch.length === 0) {
          await delay(intervalMs);
          loops += 1;
          continue;
        }

        for (const event of batch) {
          if (stopped) {
            break;
          }
          await handler(event);
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

export function createPostgresSpecialistRuntime(
  executor: PostgresRuntimeExecutor,
): PostgresSpecialistRuntime {
  return new PostgresSpecialistRuntime(executor);
}

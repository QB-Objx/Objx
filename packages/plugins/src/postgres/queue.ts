import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
  assertSafeSqlIdentifier,
  quoteQualifiedSqlIdentifier,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresQueuePluginOptions extends PostgresPluginBaseOptions {
  readonly schema?: string;
  readonly autoProvision?: boolean;
  readonly defaultQueue?: string;
  readonly lockTtlMs?: number;
  readonly maxAttempts?: number;
}

export interface PostgresQueuePluginMetadata {
  readonly schema: string;
  readonly autoProvision: boolean;
  readonly defaultQueue: string;
  readonly lockTtlMs: number;
  readonly maxAttempts: number;
}

export type QueueBackoffStrategy = 'fixed' | 'exponential';

export interface QueueBackoffOptions {
  readonly strategy?: QueueBackoffStrategy;
  readonly baseMs?: number;
  readonly maxMs?: number;
}

export const POSTGRES_QUEUE_METADATA_KEY = 'postgres.queue';

export function createPostgresQueuePlugin(
  options: PostgresQueuePluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_QUEUE_METADATA_KEY);

  return definePlugin({
    name: 'postgres-queue',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          schema: options.schema ?? DEFAULT_INTERNAL_SCHEMA,
          autoProvision: options.autoProvision ?? true,
          defaultQueue: options.defaultQueue ?? 'default',
          lockTtlMs: options.lockTtlMs ?? 30_000,
          maxAttempts: options.maxAttempts ?? 8,
        } satisfies PostgresQueuePluginMetadata);
      },
    },
  });
}

export function computeQueueBackoffMs(attempt: number, options: QueueBackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 500;
  const maxMs = options.maxMs ?? 30_000;
  const strategy = options.strategy ?? 'exponential';

  if (attempt <= 0) {
    return baseMs;
  }

  if (strategy === 'fixed') {
    return Math.min(baseMs, maxMs);
  }

  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

function normalizeLeaseTtlMs(value: number | undefined): number {
  const normalized = Math.trunc(value ?? 30_000);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('Postgres queue lock TTL must be a finite number greater than zero.');
  }

  return normalized;
}

function resolveQueueTables(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
  dlqTable = 'queue_dlq',
): {
  readonly qualifiedQueueTable: string;
  readonly qualifiedDlqTable: string;
} {
  const safeSchema = assertSafeSqlIdentifier(schema);
  const safeTable = assertSafeSqlIdentifier(table);
  const safeDlqTable = assertSafeSqlIdentifier(dlqTable);

  return {
    qualifiedQueueTable: quoteQualifiedSqlIdentifier(safeSchema, safeTable),
    qualifiedDlqTable: quoteQualifiedSqlIdentifier(safeSchema, safeDlqTable),
  };
}

export function buildQueueEnqueueSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
): string {
  const { qualifiedQueueTable } = resolveQueueTables(schema, table);

  return `insert into ${qualifiedQueueTable} (queue_name, job_name, payload, priority, run_at, max_attempts, dedupe_key) values ($1, $2, $3::jsonb, $4, $5, $6, $7) on conflict do nothing returning id;`;
}

export function buildQueueDequeueSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
  options: {
    readonly lockTtlMs?: number;
  } = {},
): string {
  const { qualifiedQueueTable } = resolveQueueTables(schema, table);
  const lockTtlMs = normalizeLeaseTtlMs(options.lockTtlMs);

  return `with next_job as (select id from ${qualifiedQueueTable} where (status = 'pending' and run_at <= now()) or (status = 'running' and locked_at is not null and locked_at <= now() - ($2::int || ' milliseconds')::interval) order by priority desc, run_at asc, id asc limit 1 for update skip locked) update ${qualifiedQueueTable} as j set status = 'running', locked_at = now(), locked_by = $1, updated_at = now() from next_job where j.id = next_job.id returning j.*, ${lockTtlMs}::int as lock_ttl_ms;`;
}

export function buildQueueCompleteSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
): string {
  const { qualifiedQueueTable } = resolveQueueTables(schema, table);

  return `update ${qualifiedQueueTable} set status = 'done', locked_at = null, locked_by = null, updated_at = now() where id = $1 and status = 'running';`;
}

export function buildQueueFailSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
  dlqTable = 'queue_dlq',
): string {
  const { qualifiedQueueTable, qualifiedDlqTable } = resolveQueueTables(schema, table, dlqTable);

  return `with failed_job as (update ${qualifiedQueueTable} set status = case when attempts + 1 >= max_attempts then 'dead' else 'pending' end, attempts = attempts + 1, run_at = case when attempts + 1 >= max_attempts then run_at else now() + ($2::int || ' milliseconds')::interval end, last_error = $3, locked_at = null, locked_by = null, updated_at = now() where id = $1 returning id, queue_name, job_name, payload, status, last_error), inserted_dlq as (insert into ${qualifiedDlqTable} (job_id, queue_name, job_name, payload, error) select id, queue_name, job_name, payload, last_error from failed_job where status = 'dead' returning job_id) select * from failed_job;`;
}

export function buildQueueRenewLeaseSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
  options: {
    readonly lockTtlMs?: number;
  } = {},
): string {
  const { qualifiedQueueTable } = resolveQueueTables(schema, table);
  const lockTtlMs = normalizeLeaseTtlMs(options.lockTtlMs);

  return `update ${qualifiedQueueTable} set locked_at = now(), updated_at = now() where id = $1 and status = 'running' and locked_by = $2 and locked_at is not null and locked_at > now() - ($3::int || ' milliseconds')::interval returning *, ${lockTtlMs}::int as lock_ttl_ms;`;
}

export function buildQueueReclaimExpiredSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'queue_jobs',
  options: {
    readonly lockTtlMs?: number;
  } = {},
): string {
  const { qualifiedQueueTable } = resolveQueueTables(schema, table);
  const lockTtlMs = normalizeLeaseTtlMs(options.lockTtlMs);

  return `update ${qualifiedQueueTable} set status = 'pending', locked_at = null, locked_by = null, updated_at = now() where status = 'running' and locked_at is not null and locked_at <= now() - ($1::int || ' milliseconds')::interval returning *, ${lockTtlMs}::int as lock_ttl_ms;`;
}

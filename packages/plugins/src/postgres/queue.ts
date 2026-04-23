import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
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

export function buildQueueEnqueueSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'queue_jobs'): string {
  return `insert into ${schema}.${table} (queue_name, job_name, payload, priority, run_at, max_attempts, dedupe_key) values ($1, $2, $3::jsonb, $4, $5, $6, $7) on conflict do nothing returning id;`;
}

export function buildQueueDequeueSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'queue_jobs'): string {
  return `with next_job as (select id from ${schema}.${table} where status = 'pending' and run_at <= now() order by priority desc, run_at asc limit 1 for update skip locked) update ${schema}.${table} j set status = 'running', locked_at = now(), locked_by = $1, updated_at = now() from next_job where j.id = next_job.id returning j.*;`;
}

export function buildQueueCompleteSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'queue_jobs'): string {
  return `update ${schema}.${table} set status = 'done', updated_at = now() where id = $1 and status = 'running';`;
}

export function buildQueueFailSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'queue_jobs'): string {
  return `update ${schema}.${table} set status = case when attempts + 1 >= max_attempts then 'dead' else 'pending' end, attempts = attempts + 1, run_at = now() + ($2::int || ' milliseconds')::interval, last_error = $3, updated_at = now() where id = $1;`;
}

import { DEFAULT_INTERNAL_SCHEMA } from './shared.js';

export interface PostgresInternalSchemaOptions {
  readonly schema?: string;
  readonly queueTable?: string;
  readonly dlqTable?: string;
  readonly outboxTable?: string;
  readonly cacheTable?: string;
  readonly migrationsTable?: string;
}

export function createPostgresInternalSchemaSql(
  options: PostgresInternalSchemaOptions = {},
): readonly string[] {
  const schema = options.schema ?? DEFAULT_INTERNAL_SCHEMA;
  const queueTable = options.queueTable ?? 'queue_jobs';
  const dlqTable = options.dlqTable ?? 'queue_dlq';
  const outboxTable = options.outboxTable ?? 'outbox_events';
  const cacheTable = options.cacheTable ?? 'cache_entries';
  const migrationsTable = options.migrationsTable ?? 'runtime_migrations';

  return [
    `create schema if not exists ${schema};`,
    `create table if not exists ${schema}.${migrationsTable} (
      id bigserial primary key,
      plugin_name text not null,
      version text not null,
      applied_at timestamptz not null default now(),
      unique(plugin_name, version)
    );`,
    `create table if not exists ${schema}.${queueTable} (
      id bigserial primary key,
      queue_name text not null,
      job_name text not null,
      payload jsonb not null,
      status text not null default 'pending',
      priority int not null default 0,
      run_at timestamptz not null default now(),
      attempts int not null default 0,
      max_attempts int not null default 8,
      dedupe_key text,
      locked_at timestamptz,
      locked_by text,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );`,
    `create table if not exists ${schema}.${dlqTable} (
      id bigserial primary key,
      job_id bigint,
      queue_name text not null,
      job_name text not null,
      payload jsonb not null,
      failed_at timestamptz not null default now(),
      error text
    );`,
    `create table if not exists ${schema}.${outboxTable} (
      id bigserial primary key,
      event_name text not null,
      payload jsonb not null,
      aggregate_id text,
      aggregate_type text,
      idempotency_key text,
      occurred_at timestamptz not null default now(),
      dispatched_at timestamptz,
      attempts int not null default 0,
      last_error text
    );`,
    `create table if not exists ${schema}.${cacheTable} (
      cache_key text primary key,
      value jsonb not null,
      expires_at timestamptz,
      tags text[] not null default '{}',
      hits bigint not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );`,
  ] as const;
}

export function createPostgresAdvisoryLockSql(lockKey: number): string {
  return `select pg_advisory_lock(${Math.trunc(lockKey)});`;
}

export function createPostgresAdvisoryUnlockSql(lockKey: number): string {
  return `select pg_advisory_unlock(${Math.trunc(lockKey)});`;
}

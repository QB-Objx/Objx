import {
  DEFAULT_INTERNAL_SCHEMA,
  assertSafeSqlIdentifier,
  quoteQualifiedSqlIdentifier,
} from './shared.js';

export interface PostgresInternalSchemaOptions {
  readonly schema?: string;
  readonly queueTable?: string;
  readonly dlqTable?: string;
  readonly outboxTable?: string;
  readonly cacheTable?: string;
  readonly migrationsTable?: string;
}

function resolveInternalSchemaNames(options: PostgresInternalSchemaOptions = {}) {
  const schema = assertSafeSqlIdentifier(options.schema ?? DEFAULT_INTERNAL_SCHEMA);
  const queueTable = assertSafeSqlIdentifier(options.queueTable ?? 'queue_jobs');
  const dlqTable = assertSafeSqlIdentifier(options.dlqTable ?? 'queue_dlq');
  const outboxTable = assertSafeSqlIdentifier(options.outboxTable ?? 'outbox_events');
  const cacheTable = assertSafeSqlIdentifier(options.cacheTable ?? 'cache_entries');
  const migrationsTable = assertSafeSqlIdentifier(options.migrationsTable ?? 'runtime_migrations');

  return {
    schema,
    queueTable,
    dlqTable,
    outboxTable,
    cacheTable,
    migrationsTable,
    qualifiedSchema: quoteQualifiedSqlIdentifier(schema),
    qualifiedQueueTable: quoteQualifiedSqlIdentifier(schema, queueTable),
    qualifiedDlqTable: quoteQualifiedSqlIdentifier(schema, dlqTable),
    qualifiedOutboxTable: quoteQualifiedSqlIdentifier(schema, outboxTable),
    qualifiedCacheTable: quoteQualifiedSqlIdentifier(schema, cacheTable),
    qualifiedMigrationsTable: quoteQualifiedSqlIdentifier(schema, migrationsTable),
  };
}

export function createPostgresInternalSchemaSql(
  options: PostgresInternalSchemaOptions = {},
): readonly string[] {
  const names = resolveInternalSchemaNames(options);

  return [
    `create schema if not exists ${names.qualifiedSchema};`,
    `create table if not exists ${names.qualifiedMigrationsTable} (
      id bigserial primary key,
      plugin_name text not null,
      version text not null,
      applied_at timestamptz not null default now(),
      unique(plugin_name, version)
    );`,
    `create table if not exists ${names.qualifiedQueueTable} (
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
      updated_at timestamptz not null default now(),
      constraint ${quoteQualifiedSqlIdentifier(`${names.queueTable}_status_chk`)} check (
        status in ('pending', 'running', 'done', 'dead')
      )
    );`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.queueTable}_pending_idx`)} on ${names.qualifiedQueueTable} (priority desc, run_at asc, id asc) where status = 'pending';`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.queueTable}_running_locked_idx`)} on ${names.qualifiedQueueTable} (locked_at asc, id asc) where status = 'running' and locked_at is not null;`,
    `create unique index if not exists ${quoteQualifiedSqlIdentifier(`${names.queueTable}_dedupe_key_uidx`)} on ${names.qualifiedQueueTable} (dedupe_key) where dedupe_key is not null;`,
    `create table if not exists ${names.qualifiedDlqTable} (
      id bigserial primary key,
      job_id bigint,
      queue_name text not null,
      job_name text not null,
      payload jsonb not null,
      failed_at timestamptz not null default now(),
      error text
    );`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.dlqTable}_job_id_idx`)} on ${names.qualifiedDlqTable} (job_id);`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.dlqTable}_failed_at_idx`)} on ${names.qualifiedDlqTable} (failed_at desc);`,
    `create table if not exists ${names.qualifiedOutboxTable} (
      id bigserial primary key,
      event_name text not null,
      payload jsonb not null,
      aggregate_id text,
      aggregate_type text,
      idempotency_key text,
      occurred_at timestamptz not null default now(),
      claimed_at timestamptz,
      claim_expires_at timestamptz,
      claimed_by text,
      dispatched_at timestamptz,
      attempts int not null default 0,
      last_error text
    );`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.outboxTable}_pending_idx`)} on ${names.qualifiedOutboxTable} (occurred_at asc, id asc) where dispatched_at is null and claimed_at is null;`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.outboxTable}_claim_expired_idx`)} on ${names.qualifiedOutboxTable} (claim_expires_at asc, id asc) where dispatched_at is null and claim_expires_at is not null;`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.outboxTable}_claimed_by_idx`)} on ${names.qualifiedOutboxTable} (claimed_by, claim_expires_at desc) where dispatched_at is null and claimed_by is not null;`,
    `create unique index if not exists ${quoteQualifiedSqlIdentifier(`${names.outboxTable}_idempotency_uidx`)} on ${names.qualifiedOutboxTable} (idempotency_key) where idempotency_key is not null;`,
    `create table if not exists ${names.qualifiedCacheTable} (
      cache_key text primary key,
      value jsonb not null,
      expires_at timestamptz,
      tags text[] not null default '{}',
      hits bigint not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.cacheTable}_expires_at_idx`)} on ${names.qualifiedCacheTable} (expires_at) where expires_at is not null;`,
    `create index if not exists ${quoteQualifiedSqlIdentifier(`${names.cacheTable}_tags_gin_idx`)} on ${names.qualifiedCacheTable} using gin (tags);`,
  ] as const;
}

export function createPostgresAdvisoryLockSql(lockKey: number): string {
  return `select pg_advisory_lock(${Math.trunc(lockKey)});`;
}

export function createPostgresAdvisoryUnlockSql(lockKey: number): string {
  return `select pg_advisory_unlock(${Math.trunc(lockKey)});`;
}

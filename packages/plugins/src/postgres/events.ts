import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
  assertSafeSqlIdentifier,
  quoteQualifiedSqlIdentifier,
  quoteSqlLiteral,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresEventsPluginOptions extends PostgresPluginBaseOptions {
  readonly schema?: string;
  readonly autoProvision?: boolean;
  readonly outboxTable?: string;
  readonly notifyChannel?: string;
  readonly claimTtlMs?: number;
  readonly dispatcherId?: string;
}

export interface PostgresEventsPluginMetadata {
  readonly schema: string;
  readonly autoProvision: boolean;
  readonly outboxTable: string;
  readonly notifyChannel: string;
  readonly claimTtlMs: number;
  readonly dispatcherId: string;
}

export interface PostgresOutboxDispatchBatchSqlOptions {
  readonly claimTtlMs?: number;
  readonly dispatcherId?: string;
}

export const POSTGRES_EVENTS_METADATA_KEY = 'postgres.events';

export function createPostgresEventsPlugin(
  options: PostgresEventsPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_EVENTS_METADATA_KEY);

  return definePlugin({
    name: 'postgres-events',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          schema: options.schema ?? DEFAULT_INTERNAL_SCHEMA,
          autoProvision: options.autoProvision ?? true,
          outboxTable: options.outboxTable ?? 'outbox_events',
          notifyChannel: options.notifyChannel ?? 'objx_events',
          claimTtlMs: normalizeClaimTtlMs(options.claimTtlMs),
          dispatcherId: options.dispatcherId ?? 'objx-dispatcher',
        } satisfies PostgresEventsPluginMetadata);
      },
    },
  });
}

function resolveOutboxTable(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
): {
  readonly qualifiedOutboxTable: string;
} {
  const safeSchema = assertSafeSqlIdentifier(schema);
  const safeTable = assertSafeSqlIdentifier(table);

  return {
    qualifiedOutboxTable: quoteQualifiedSqlIdentifier(safeSchema, safeTable),
  };
}

function resolveChannel(channel = 'objx_events'): string {
  return assertSafeSqlIdentifier(channel);
}

function normalizeClaimTtlMs(value: number | undefined): number {
  const normalized = Math.trunc(value ?? 30_000);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('Postgres outbox claim TTL must be a finite number greater than zero.');
  }

  return normalized;
}

export function buildOutboxPublishSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
): string {
  const { qualifiedOutboxTable } = resolveOutboxTable(schema, table);

  return `insert into ${qualifiedOutboxTable} (event_name, payload, aggregate_id, aggregate_type, idempotency_key) values ($1, $2::jsonb, $3, $4, $5) on conflict do nothing returning id;`;
}

export function buildOutboxDispatchBatchSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
  options: PostgresOutboxDispatchBatchSqlOptions = {},
): string {
  const { qualifiedOutboxTable } = resolveOutboxTable(schema, table);
  const claimTtlMs = normalizeClaimTtlMs(options.claimTtlMs);

  return `with next_events as (select id from ${qualifiedOutboxTable} where dispatched_at is null and (claimed_at is null or claim_expires_at is null or claim_expires_at <= now()) order by occurred_at asc, id asc limit $1 for update skip locked) update ${qualifiedOutboxTable} as e set claimed_at = now(), claim_expires_at = now() + ($3::int || ' milliseconds')::interval, claimed_by = $2, attempts = attempts + 1 from next_events where e.id = next_events.id returning e.*, ${claimTtlMs}::int as claim_ttl_ms;`;
}

export function buildOutboxAckSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
): string {
  const { qualifiedOutboxTable } = resolveOutboxTable(schema, table);

  return `update ${qualifiedOutboxTable} set dispatched_at = now(), claimed_at = null, claim_expires_at = null, claimed_by = null where id = $1;`;
}

export function buildOutboxFailSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
): string {
  const { qualifiedOutboxTable } = resolveOutboxTable(schema, table);

  return `update ${qualifiedOutboxTable} set claimed_at = null, claim_expires_at = null, claimed_by = null, last_error = $2 where id = $1;`;
}

export function buildListenSql(channel = 'objx_events'): string {
  const safeChannel = resolveChannel(channel);
  return `listen ${safeChannel};`;
}

export function buildNotifySql(channel = 'objx_events'): string {
  const safeChannel = resolveChannel(channel);
  return `select pg_notify(${quoteSqlLiteral(safeChannel)}, $1);`;
}

import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresEventsPluginOptions extends PostgresPluginBaseOptions {
  readonly schema?: string;
  readonly autoProvision?: boolean;
  readonly outboxTable?: string;
  readonly notifyChannel?: string;
}

export interface PostgresEventsPluginMetadata {
  readonly schema: string;
  readonly autoProvision: boolean;
  readonly outboxTable: string;
  readonly notifyChannel: string;
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
        } satisfies PostgresEventsPluginMetadata);
      },
    },
  });
}

export function buildOutboxPublishSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'outbox_events'): string {
  return `insert into ${schema}.${table} (event_name, payload, aggregate_id, aggregate_type, idempotency_key) values ($1, $2::jsonb, $3, $4, $5) on conflict do nothing returning id;`;
}

export function buildOutboxDispatchBatchSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'outbox_events',
): string {
  return `select id, event_name, payload, aggregate_id, aggregate_type, occurred_at from ${schema}.${table} where dispatched_at is null order by occurred_at asc limit $1 for update skip locked;`;
}

export function buildOutboxAckSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'outbox_events'): string {
  return `update ${schema}.${table} set dispatched_at = now(), attempts = attempts + 1 where id = $1;`;
}

export function buildOutboxFailSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'outbox_events'): string {
  return `update ${schema}.${table} set attempts = attempts + 1, last_error = $2 where id = $1;`;
}

export function buildListenSql(channel = 'objx_events'): string {
  return `listen ${channel};`;
}

export function buildNotifySql(channel = 'objx_events'): string {
  return `select pg_notify('${channel}', $1);`;
}

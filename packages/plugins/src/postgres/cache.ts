import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresCachePluginOptions extends PostgresPluginBaseOptions {
  readonly schema?: string;
  readonly autoProvision?: boolean;
  readonly defaultTtlSeconds?: number;
  readonly table?: string;
}

export interface PostgresCachePluginMetadata {
  readonly schema: string;
  readonly autoProvision: boolean;
  readonly defaultTtlSeconds: number;
  readonly table: string;
}

export const POSTGRES_CACHE_METADATA_KEY = 'postgres.cache';

export function createPostgresCachePlugin(
  options: PostgresCachePluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_CACHE_METADATA_KEY);

  return definePlugin({
    name: 'postgres-cache',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          schema: options.schema ?? DEFAULT_INTERNAL_SCHEMA,
          autoProvision: options.autoProvision ?? true,
          defaultTtlSeconds: options.defaultTtlSeconds ?? 60,
          table: options.table ?? 'cache_entries',
        } satisfies PostgresCachePluginMetadata);
      },
    },
  });
}

export function buildCacheUpsertSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'cache_entries'): string {
  return `insert into ${schema}.${table} (cache_key, value, expires_at, tags, updated_at) values ($1, $2::jsonb, $3, $4::text[], now()) on conflict (cache_key) do update set value = excluded.value, expires_at = excluded.expires_at, tags = excluded.tags, updated_at = now();`;
}

export function buildCacheGetSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'cache_entries'): string {
  return `update ${schema}.${table} set hits = hits + 1 where cache_key = $1 and (expires_at is null or expires_at > now()) returning value;`;
}

export function buildCachePruneExpiredSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'cache_entries'): string {
  return `delete from ${schema}.${table} where expires_at is not null and expires_at <= now();`;
}

export function createMaterializedViewRefreshSql(name: string, concurrently = true): string {
  return concurrently ? `refresh materialized view concurrently ${name};` : `refresh materialized view ${name};`;
}

export function createCacheInvalidationTriggerSql(options: {
  readonly schema?: string;
  readonly sourceTable: string;
  readonly cacheTable?: string;
  readonly keyExpression: string;
}): string {
  const schema = options.schema ?? DEFAULT_INTERNAL_SCHEMA;
  const cacheTable = options.cacheTable ?? 'cache_entries';
  return `create or replace function ${schema}.invalidate_${options.sourceTable}_cache() returns trigger as $$ begin delete from ${schema}.${cacheTable} where cache_key = ${options.keyExpression}; return new; end; $$ language plpgsql;`;
}

export function buildCacheMetricsSql(schema = DEFAULT_INTERNAL_SCHEMA, table = 'cache_entries'): string {
  return `select count(*) as total_entries, coalesce(sum(hits), 0) as total_hits, count(*) filter (where expires_at is not null and expires_at <= now()) as expired_entries from ${schema}.${table};`;
}

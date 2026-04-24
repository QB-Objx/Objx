import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  DEFAULT_INTERNAL_SCHEMA,
  assertSafeSqlIdentifier,
  quoteQualifiedSqlIdentifier,
  quoteSqlIdentifier,
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

function resolveCacheTable(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'cache_entries',
): {
  readonly qualifiedCacheTable: string;
} {
  const safeSchema = assertSafeSqlIdentifier(schema);
  const safeTable = assertSafeSqlIdentifier(table);

  return {
    qualifiedCacheTable: quoteQualifiedSqlIdentifier(safeSchema, safeTable),
  };
}

export function buildCacheUpsertSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'cache_entries',
): string {
  const { qualifiedCacheTable } = resolveCacheTable(schema, table);

  return `insert into ${qualifiedCacheTable} (cache_key, value, expires_at, tags, updated_at) values ($1, $2::jsonb, $3, $4::text[], now()) on conflict (cache_key) do update set value = excluded.value, expires_at = excluded.expires_at, tags = excluded.tags, updated_at = now();`;
}

export function buildCacheGetSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'cache_entries',
): string {
  const { qualifiedCacheTable } = resolveCacheTable(schema, table);

  return `update ${qualifiedCacheTable} set hits = hits + 1 where cache_key = $1 and (expires_at is null or expires_at > now()) returning value;`;
}

export function buildCachePruneExpiredSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'cache_entries',
): string {
  const { qualifiedCacheTable } = resolveCacheTable(schema, table);

  return `delete from ${qualifiedCacheTable} where expires_at is not null and expires_at <= now();`;
}

export function createMaterializedViewRefreshSql(name: string, concurrently = true): string {
  const safeName = quoteSqlIdentifier(assertSafeSqlIdentifier(name));
  return concurrently
    ? `refresh materialized view concurrently ${safeName};`
    : `refresh materialized view ${safeName};`;
}

export function createCacheInvalidationTriggerSql(options: {
  readonly schema?: string;
  readonly sourceTable: string;
  readonly cacheTable?: string;
  readonly keyExpression: string;
}): string {
  const schema = options.schema ?? DEFAULT_INTERNAL_SCHEMA;
  const safeSchema = assertSafeSqlIdentifier(schema);
  const safeSourceTable = assertSafeSqlIdentifier(options.sourceTable);
  const { qualifiedCacheTable } = resolveCacheTable(schema, options.cacheTable ?? 'cache_entries');
  const functionName = quoteQualifiedSqlIdentifier(
    safeSchema,
    `invalidate_${safeSourceTable}_cache`,
  );

  return `create or replace function ${functionName}() returns trigger as $$ begin delete from ${qualifiedCacheTable} where cache_key = ${options.keyExpression}; return new; end; $$ language plpgsql;`;
}

export function buildCacheMetricsSql(
  schema = DEFAULT_INTERNAL_SCHEMA,
  table = 'cache_entries',
): string {
  const { qualifiedCacheTable } = resolveCacheTable(schema, table);

  return `select count(*) as total_entries, coalesce(sum(hits), 0) as total_hits, count(*) filter (where expires_at is not null and expires_at <= now()) as expired_entries from ${qualifiedCacheTable};`;
}

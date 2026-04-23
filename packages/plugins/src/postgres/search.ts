import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

export interface PostgresSearchPluginOptions extends PostgresPluginBaseOptions {
  readonly defaultLanguage?: string;
  readonly autoMigrateHelpers?: boolean;
  readonly rankFunction?: 'ts_rank' | 'ts_rank_cd';
}

export interface PostgresSearchPluginMetadata {
  readonly defaultLanguage: string;
  readonly autoMigrateHelpers: boolean;
  readonly rankFunction: 'ts_rank' | 'ts_rank_cd';
}

export interface PostgresSearchMigrationOptions {
  readonly table: string;
  readonly sourceColumns: readonly string[];
  readonly vectorColumn?: string;
  readonly language?: string;
  readonly indexName?: string;
}

export interface PostgresSearchQueryOptions {
  readonly table: string;
  readonly vectorColumn?: string;
  readonly query: string;
  readonly language?: string;
  readonly rankAlias?: string;
  readonly limit?: number;
  readonly highlightColumn?: string;
}

export const POSTGRES_SEARCH_METADATA_KEY = 'postgres.search';

export function createPostgresSearchPlugin(
  options: PostgresSearchPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_SEARCH_METADATA_KEY);

  return definePlugin({
    name: 'postgres-search',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          defaultLanguage: options.defaultLanguage ?? 'simple',
          autoMigrateHelpers: options.autoMigrateHelpers ?? true,
          rankFunction: options.rankFunction ?? 'ts_rank_cd',
        } satisfies PostgresSearchPluginMetadata);
      },
    },
  });
}

export function createPostgresSearchMigrationSql(
  options: PostgresSearchMigrationOptions,
): readonly string[] {
  const vectorColumn = options.vectorColumn ?? 'search_vector';
  const language = options.language ?? 'simple';
  const indexName = options.indexName ?? `${options.table}_${vectorColumn}_gin_idx`;
  const vectorExpression = options.sourceColumns
    .map((column) => `coalesce(${column}, '')`)
    .join(` || ' ' || `);

  return [
    `alter table ${options.table} add column if not exists ${vectorColumn} tsvector generated always as (to_tsvector('${language}', ${vectorExpression})) stored;`,
    `create index if not exists ${indexName} on ${options.table} using gin (${vectorColumn});`,
  ] as const;
}

export function buildPostgresSearchQuerySql(options: PostgresSearchQueryOptions): string {
  const vectorColumn = options.vectorColumn ?? 'search_vector';
  const language = options.language ?? 'simple';
  const rankAlias = options.rankAlias ?? 'search_rank';
  const limitClause = options.limit ? ` limit ${Math.max(1, options.limit)}` : '';
  const queryExpr = `websearch_to_tsquery('${language}', $1)`;
  const headline = options.highlightColumn
    ? `, ts_headline('${language}', ${options.highlightColumn}, ${queryExpr}) as highlight`
    : '';

  return `select *, ts_rank_cd(${vectorColumn}, ${queryExpr}) as ${rankAlias}${headline} from ${options.table} where ${vectorColumn} @@ ${queryExpr} order by ${rankAlias} desc${limitClause};`;
}

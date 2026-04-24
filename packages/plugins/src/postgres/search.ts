import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  assertSafeSqlIdentifier,
  quoteSqlIdentifier,
  quoteSqlLiteral,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

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
  readonly rankFunction?: 'ts_rank' | 'ts_rank_cd';
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

function resolveSearchTable(table: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(table));
}

function resolveSearchColumn(column: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(column));
}

function resolveSearchLanguage(language: string | undefined): string {
  return quoteSqlLiteral(language ?? 'simple');
}

function resolveSearchRankFunction(
  rankFunction: PostgresSearchQueryOptions['rankFunction'],
): 'ts_rank' | 'ts_rank_cd' {
  return rankFunction ?? 'ts_rank_cd';
}

export function createPostgresSearchMigrationSql(
  options: PostgresSearchMigrationOptions,
): readonly string[] {
  const qualifiedTable = resolveSearchTable(options.table);
  const vectorColumn = resolveSearchColumn(options.vectorColumn ?? 'search_vector');
  const language = resolveSearchLanguage(options.language);
  const indexName = quoteSqlIdentifier(
    assertSafeSqlIdentifier(options.indexName ?? `${options.table}_${options.vectorColumn ?? 'search_vector'}_gin_idx`),
  );
  const vectorExpression = options.sourceColumns
    .map((column) => `coalesce(${resolveSearchColumn(column)}, '')`)
    .join(` || ' ' || `);

  return [
    `alter table ${qualifiedTable} add column if not exists ${vectorColumn} tsvector generated always as (to_tsvector(${language}, ${vectorExpression})) stored;`,
    `create index if not exists ${indexName} on ${qualifiedTable} using gin (${vectorColumn});`,
  ] as const;
}

export function buildPostgresSearchQuerySql(options: PostgresSearchQueryOptions): string {
  const qualifiedTable = resolveSearchTable(options.table);
  const vectorColumn = resolveSearchColumn(options.vectorColumn ?? 'search_vector');
  const language = resolveSearchLanguage(options.language);
  const rankAlias = quoteSqlIdentifier(assertSafeSqlIdentifier(options.rankAlias ?? 'search_rank'));
  const rankFunction = resolveSearchRankFunction(options.rankFunction);
  const limitClause = options.limit ? ` limit ${Math.max(1, Math.trunc(options.limit))}` : '';
  const queryExpr = `websearch_to_tsquery(${language}, $1)`;
  const highlightColumn = options.highlightColumn
    ? resolveSearchColumn(options.highlightColumn)
    : undefined;
  const headline = highlightColumn
    ? `, ts_headline(${language}, ${highlightColumn}, ${queryExpr}) as "highlight"`
    : '';

  return `select ${qualifiedTable}.*, ${rankFunction}(${vectorColumn}, ${queryExpr}) as ${rankAlias}${headline} from ${qualifiedTable} where ${vectorColumn} @@ ${queryExpr} order by ${rankAlias} desc${limitClause};`;
}

import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  assertSafeSqlIdentifier,
  quoteSqlIdentifier,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresVectorPluginOptions extends PostgresPluginBaseOptions {
  readonly extensionName?: string;
  readonly distance?: 'cosine' | 'l2' | 'ip';
  readonly indexMethod?: 'ivfflat' | 'hnsw';
}

export interface PostgresVectorPluginMetadata {
  readonly extensionName: string;
  readonly distance: 'cosine' | 'l2' | 'ip';
  readonly indexMethod: 'ivfflat' | 'hnsw';
}

export const POSTGRES_VECTOR_METADATA_KEY = 'postgres.vector';

export function createPostgresVectorPlugin(
  options: PostgresVectorPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_VECTOR_METADATA_KEY);

  return definePlugin({
    name: 'postgres-vector',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          extensionName: options.extensionName ?? 'vector',
          distance: options.distance ?? 'cosine',
          indexMethod: options.indexMethod ?? 'hnsw',
        } satisfies PostgresVectorPluginMetadata);
      },
    },
  });
}

function resolveTable(table: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(table));
}

function resolveColumn(column: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(column));
}

function resolveIndexName(indexName: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(indexName));
}

function resolveOperatorClass(
  operatorClass: 'vector_cosine_ops' | 'vector_l2_ops' | 'vector_ip_ops' | undefined,
): 'vector_cosine_ops' | 'vector_l2_ops' | 'vector_ip_ops' {
  return operatorClass ?? 'vector_cosine_ops';
}

function resolveDistanceOperator(
  distanceOperator: '<=>' | '<->' | '<#>' | undefined,
): '<=>' | '<->' | '<#>' {
  return distanceOperator ?? '<=>';
}

export function createVectorColumnSql(
  table: string,
  column = 'embedding',
  dimensions = 1536,
): string {
  const qualifiedTable = resolveTable(table);
  const quotedColumn = resolveColumn(column);
  const safeDimensions = Math.max(1, Math.trunc(dimensions));

  return `alter table ${qualifiedTable} add column if not exists ${quotedColumn} vector(${safeDimensions});`;
}

export function createVectorIndexSql(options: {
  readonly table: string;
  readonly column?: string;
  readonly method?: 'ivfflat' | 'hnsw';
  readonly operatorClass?: 'vector_cosine_ops' | 'vector_l2_ops' | 'vector_ip_ops';
  readonly indexName?: string;
}): string {
  const tableName = assertSafeSqlIdentifier(options.table);
  const columnName = assertSafeSqlIdentifier(options.column ?? 'embedding');
  const method = options.method ?? 'hnsw';
  const operatorClass = resolveOperatorClass(options.operatorClass);
  const indexName = resolveIndexName(options.indexName ?? `${tableName}_${columnName}_${method}_idx`);
  const qualifiedTable = resolveTable(tableName);
  const quotedColumn = resolveColumn(columnName);

  return `create index if not exists ${indexName} on ${qualifiedTable} using ${method} (${quotedColumn} ${operatorClass});`;
}

export function buildVectorSimilarityQuerySql(options: {
  readonly table: string;
  readonly column?: string;
  readonly distanceOperator?: '<=>' | '<->' | '<#>';
  readonly whereSql?: string;
  readonly limit?: number;
}): string {
  const qualifiedTable = resolveTable(options.table);
  const quotedColumn = resolveColumn(options.column ?? 'embedding');
  const distanceOperator = resolveDistanceOperator(options.distanceOperator);
  const whereClause = options.whereSql ? ` where ${options.whereSql}` : '';
  const limit = Math.max(1, Math.trunc(options.limit ?? 20));

  return `select ${qualifiedTable}.*, ${quotedColumn} ${distanceOperator} $1::vector as "similarity_distance" from ${qualifiedTable}${whereClause} order by ${quotedColumn} ${distanceOperator} $1::vector asc limit ${limit};`;
}

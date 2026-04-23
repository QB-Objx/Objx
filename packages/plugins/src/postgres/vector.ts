import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

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

export function createVectorColumnSql(table: string, column = 'embedding', dimensions = 1536): string {
  return `alter table ${table} add column if not exists ${column} vector(${dimensions});`;
}

export function createVectorIndexSql(options: {
  readonly table: string;
  readonly column?: string;
  readonly method?: 'ivfflat' | 'hnsw';
  readonly operatorClass?: 'vector_cosine_ops' | 'vector_l2_ops' | 'vector_ip_ops';
  readonly indexName?: string;
}): string {
  const column = options.column ?? 'embedding';
  const method = options.method ?? 'hnsw';
  const operatorClass = options.operatorClass ?? 'vector_cosine_ops';
  const indexName = options.indexName ?? `${options.table}_${column}_${method}_idx`;
  return `create index if not exists ${indexName} on ${options.table} using ${method} (${column} ${operatorClass});`;
}

export function buildVectorSimilarityQuerySql(options: {
  readonly table: string;
  readonly column?: string;
  readonly distanceOperator?: '<=>' | '<->' | '<#>';
  readonly whereSql?: string;
  readonly limit?: number;
}): string {
  const column = options.column ?? 'embedding';
  const distanceOperator = options.distanceOperator ?? '<=>';
  const whereClause = options.whereSql ? ` where ${options.whereSql}` : '';
  const limit = options.limit ?? 20;
  return `select *, ${column} ${distanceOperator} $1::vector as similarity_distance from ${options.table}${whereClause} order by ${column} ${distanceOperator} $1::vector asc limit ${limit};`;
}

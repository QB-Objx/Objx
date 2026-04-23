import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

export interface PostgresJsonPluginOptions extends PostgresPluginBaseOptions {
  readonly defaultPathMode?: 'strict' | 'lax';
  readonly suggestIndexes?: boolean;
}

export interface PostgresJsonPluginMetadata {
  readonly defaultPathMode: 'strict' | 'lax';
  readonly suggestIndexes: boolean;
}

export const POSTGRES_JSON_METADATA_KEY = 'postgres.json';

export function createPostgresJsonPlugin(
  options: PostgresJsonPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_JSON_METADATA_KEY);

  return definePlugin({
    name: 'postgres-json',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          defaultPathMode: options.defaultPathMode ?? 'lax',
          suggestIndexes: options.suggestIndexes ?? true,
        } satisfies PostgresJsonPluginMetadata);
      },
    },
  });
}

export function buildJsonPathWhereSql(column: string, jsonPath: string): string {
  return `${column} @@ '${jsonPath}'`;
}

export function buildJsonProjectionSql(column: string, projection: readonly string[]): string {
  return projection.map((path) => `${column} #>> '{${path}}' as "${path.replaceAll(',', '_')}"`).join(', ');
}

export function createJsonIndexesSql(options: {
  readonly table: string;
  readonly jsonColumn: string;
  readonly scalarPaths?: readonly string[];
}): readonly string[] {
  const scalarPaths = options.scalarPaths ?? [];
  return [
    `create index if not exists ${options.table}_${options.jsonColumn}_gin_idx on ${options.table} using gin (${options.jsonColumn});`,
    ...scalarPaths.map(
      (path, index) =>
        `create index if not exists ${options.table}_${options.jsonColumn}_scalar_${index}_idx on ${options.table} (( ${options.jsonColumn} #>> '{${path}}' ));`,
    ),
  ] as const;
}

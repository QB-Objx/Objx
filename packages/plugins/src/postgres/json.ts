import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  assertSafeSqlIdentifier,
  quoteSqlIdentifier,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

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

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function resolveJsonColumn(column: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(column));
}

function resolveJsonPathSegments(path: string): readonly string[] {
  const segments = path
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new Error('JSON path must contain at least one segment.');
  }

  return segments.map((segment) => {
    if (!/^[a-zA-Z0-9_]+$/.test(segment)) {
      throw new Error(`Unsafe JSON path segment "${segment}".`);
    }

    return segment;
  });
}

function toJsonPathArrayLiteral(path: string): string {
  return resolveJsonPathSegments(path)
    .map((segment) => `"${segment.replaceAll('"', '""')}"`)
    .join(',');
}

export function buildJsonPathWhereSql(column: string, jsonPath: string): string {
  const resolvedColumn = resolveJsonColumn(column);
  return `${resolvedColumn} @@ '${escapeSqlLiteral(jsonPath)}'`;
}

export function buildJsonProjectionSql(column: string, projection: readonly string[]): string {
  const resolvedColumn = resolveJsonColumn(column);

  return projection
    .map((path) => {
      const segments = resolveJsonPathSegments(path);
      const alias = quoteSqlIdentifier(segments.join('_'));
      const pathLiteral = toJsonPathArrayLiteral(path);

      return `${resolvedColumn} #>> '{${pathLiteral}}' as ${alias}`;
    })
    .join(', ');
}

export function createJsonIndexesSql(options: {
  readonly table: string;
  readonly jsonColumn: string;
  readonly scalarPaths?: readonly string[];
}): readonly string[] {
  const table = assertSafeSqlIdentifier(options.table);
  const jsonColumn = assertSafeSqlIdentifier(options.jsonColumn);
  const qualifiedTable = quoteSqlIdentifier(table);
  const quotedJsonColumn = quoteSqlIdentifier(jsonColumn);
  const scalarPaths = options.scalarPaths ?? [];

  return [
    `create index if not exists ${quoteSqlIdentifier(`${table}_${jsonColumn}_gin_idx`)} on ${qualifiedTable} using gin (${quotedJsonColumn});`,
    ...scalarPaths.map((path, index) => {
      const pathLiteral = toJsonPathArrayLiteral(path);

      return `create index if not exists ${quoteSqlIdentifier(`${table}_${jsonColumn}_scalar_${index}_idx`)} on ${qualifiedTable} (( ${quotedJsonColumn} #>> '{${pathLiteral}}' ));`;
    }),
  ] as const;
}

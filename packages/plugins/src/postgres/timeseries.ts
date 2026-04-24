import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import {
  assertSafeSqlIdentifier,
  quoteSqlIdentifier,
  quoteSqlLiteral,
  type PostgresPluginBaseOptions,
  withDefaultMetadataKey,
} from './shared.js';

export interface PostgresTimeseriesPluginOptions extends PostgresPluginBaseOptions {
  readonly useTimescaleWhenAvailable?: boolean;
  readonly defaultRetentionDays?: number;
  readonly defaultPartitionWindow?: 'day' | 'week' | 'month';
}

export interface PostgresTimeseriesPluginMetadata {
  readonly useTimescaleWhenAvailable: boolean;
  readonly defaultRetentionDays: number;
  readonly defaultPartitionWindow: 'day' | 'week' | 'month';
}

export const POSTGRES_TIMESERIES_METADATA_KEY = 'postgres.timeseries';

export function createPostgresTimeseriesPlugin(
  options: PostgresTimeseriesPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(options.metadataKey, POSTGRES_TIMESERIES_METADATA_KEY);

  return definePlugin({
    name: 'postgres-timeseries',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          useTimescaleWhenAvailable: options.useTimescaleWhenAvailable ?? true,
          defaultRetentionDays: options.defaultRetentionDays ?? 30,
          defaultPartitionWindow: options.defaultPartitionWindow ?? 'week',
        } satisfies PostgresTimeseriesPluginMetadata);
      },
    },
  });
}

function resolveTableIdentifier(table: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(table));
}

function resolveColumnIdentifier(column: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(column));
}

function resolvePartitionName(partitionName: string): string {
  return quoteSqlIdentifier(assertSafeSqlIdentifier(partitionName));
}

function normalizeRetentionDays(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Retention days must be a finite number.');
  }

  const normalized = Math.trunc(value);

  if (normalized < 0) {
    throw new Error('Retention days must be zero or greater.');
  }

  return normalized;
}

export function createPartitionedTableSql(options: {
  readonly table: string;
  readonly timestampColumn: string;
}): string {
  const table = resolveTableIdentifier(options.table);
  const timestampColumn = resolveColumnIdentifier(options.timestampColumn);

  return `create table if not exists ${table} (${timestampColumn} timestamptz not null) partition by range (${timestampColumn});`;
}

export function createPartitionSql(options: {
  readonly table: string;
  readonly partitionName: string;
  readonly from: string;
  readonly to: string;
}): string {
  const table = resolveTableIdentifier(options.table);
  const partitionName = resolvePartitionName(options.partitionName);
  const from = quoteSqlLiteral(options.from);
  const to = quoteSqlLiteral(options.to);

  return `create table if not exists ${partitionName} partition of ${table} for values from (${from}) to (${to});`;
}

export function createRetentionSql(options: {
  readonly table: string;
  readonly timestampColumn: string;
  readonly retentionDays: number;
}): string {
  const table = resolveTableIdentifier(options.table);
  const timestampColumn = resolveColumnIdentifier(options.timestampColumn);
  const retentionDays = normalizeRetentionDays(options.retentionDays);

  return `delete from ${table} where ${timestampColumn} < now() - interval '${retentionDays} days';`;
}

export function createTimescaleCompressionSql(hypertable: string): string {
  const table = resolveTableIdentifier(hypertable);
  return `alter table ${table} set (timescaledb.compress = true);`;
}

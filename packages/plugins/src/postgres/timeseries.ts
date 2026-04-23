import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

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

export function createPartitionedTableSql(options: {
  readonly table: string;
  readonly timestampColumn: string;
}): string {
  return `alter table ${options.table} partition by range (${options.timestampColumn});`;
}

export function createPartitionSql(options: {
  readonly table: string;
  readonly partitionName: string;
  readonly from: string;
  readonly to: string;
}): string {
  return `create table if not exists ${options.partitionName} partition of ${options.table} for values from ('${options.from}') to ('${options.to}');`;
}

export function createRetentionSql(options: {
  readonly table: string;
  readonly timestampColumn: string;
  readonly retentionDays: number;
}): string {
  return `delete from ${options.table} where ${options.timestampColumn} < now() - interval '${options.retentionDays} days';`;
}

export function createTimescaleCompressionSql(hypertable: string): string {
  return `alter table ${hypertable} set (timescaledb.compress = true);`;
}

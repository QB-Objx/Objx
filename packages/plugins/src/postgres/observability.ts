import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

export interface PostgresObservabilityPluginOptions extends PostgresPluginBaseOptions {
  readonly captureExplainAnalyze?: boolean;
  readonly usePgStatStatements?: boolean;
  readonly slowQueryThresholdMs?: number;
}

export interface PostgresObservabilityPluginMetadata {
  readonly captureExplainAnalyze: boolean;
  readonly usePgStatStatements: boolean;
  readonly slowQueryThresholdMs: number;
}

export interface SqlLintIssue {
  readonly code: 'SELECT_STAR' | 'MISSING_WHERE' | 'NO_LIMIT';
  readonly message: string;
}

export const POSTGRES_OBSERVABILITY_METADATA_KEY = 'postgres.observability';

export function createPostgresObservabilityPlugin(
  options: PostgresObservabilityPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(
    options.metadataKey,
    POSTGRES_OBSERVABILITY_METADATA_KEY,
  );

  return definePlugin({
    name: 'postgres-observability',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          captureExplainAnalyze: options.captureExplainAnalyze ?? false,
          usePgStatStatements: options.usePgStatStatements ?? true,
          slowQueryThresholdMs: options.slowQueryThresholdMs ?? 250,
        } satisfies PostgresObservabilityPluginMetadata);
      },
    },
  });
}

export function createExplainAnalyzeSql(sqlText: string): string {
  return `explain (analyze, buffers, format json) ${sqlText}`;
}

export function createPgStatStatementsSql(limit = 20): string {
  return `select query, calls, total_exec_time, mean_exec_time from pg_stat_statements order by total_exec_time desc limit ${Math.max(1, limit)};`;
}

export function lintSqlAntiPatterns(sqlText: string): readonly SqlLintIssue[] {
  const normalized = sqlText.toLowerCase();
  const issues: SqlLintIssue[] = [];

  if (normalized.includes('select *')) {
    issues.push({ code: 'SELECT_STAR', message: 'Avoid SELECT * in production queries.' });
  }

  if (normalized.startsWith('update ') && !normalized.includes(' where ')) {
    issues.push({ code: 'MISSING_WHERE', message: 'UPDATE without WHERE detected.' });
  }

  if (normalized.startsWith('select ') && !normalized.includes(' limit ')) {
    issues.push({ code: 'NO_LIMIT', message: 'SELECT without LIMIT can be expensive.' });
  }

  return issues;
}

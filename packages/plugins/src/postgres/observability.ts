import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

import { type PostgresPluginBaseOptions, withDefaultMetadataKey } from './shared.js';

export interface PostgresObservabilityPluginOptions extends PostgresPluginBaseOptions {
  readonly captureExplainAnalyze?: boolean;
  readonly usePgStatStatements?: boolean;
  readonly slowQueryThresholdMs?: number;
  emit?(event: PostgresObservabilityEvent): void;
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

export interface PostgresObservabilityBaseEvent {
  readonly plugin: 'postgres-observability';
  readonly modelName?: string;
  readonly tableName?: string;
  readonly queryKind?: string;
  readonly executionContextId?: string;
  readonly transactionId?: string;
  readonly sql?: string;
  readonly parameterCount?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly lintIssues: readonly SqlLintIssue[];
}

export interface PostgresObservabilityQueryExecuteEvent
  extends PostgresObservabilityBaseEvent {
  readonly type: 'query:execute';
  readonly startedAt: Date;
}

export interface PostgresObservabilityQueryResultEvent
  extends PostgresObservabilityBaseEvent {
  readonly type: 'query:result';
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly rowCount?: number;
  readonly isSlowQuery: boolean;
}

export interface PostgresObservabilityQueryErrorEvent
  extends PostgresObservabilityBaseEvent {
  readonly type: 'query:error';
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly error: unknown;
  readonly isSlowQuery: boolean;
}

export type PostgresObservabilityEvent =
  | PostgresObservabilityQueryExecuteEvent
  | PostgresObservabilityQueryResultEvent
  | PostgresObservabilityQueryErrorEvent;

export const POSTGRES_OBSERVABILITY_METADATA_KEY = 'postgres.observability';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveLintIssues(sqlText: string | undefined): readonly SqlLintIssue[] {
  return sqlText ? lintSqlAntiPatterns(sqlText) : [];
}

function resolveTimingInfo(context: {
  readonly timing?: {
    readonly startedAt: Date;
    readonly finishedAt?: Date;
    readonly durationMs?: number;
  };
}): {
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly durationMs?: number;
} {
  return {
    ...(context.timing?.startedAt ? { startedAt: context.timing.startedAt } : {}),
    ...(context.timing?.finishedAt ? { finishedAt: context.timing.finishedAt } : {}),
    ...(context.timing?.durationMs !== undefined
      ? { durationMs: context.timing.durationMs }
      : {}),
  };
}

function resolveRowCount(result: unknown): number | undefined {
  if (typeof result === 'number' && Number.isFinite(result)) {
    return result;
  }

  if (Array.isArray(result)) {
    return result.length;
  }

  if (isRecord(result)) {
    if (typeof result.rowCount === 'number' && Number.isFinite(result.rowCount)) {
      return result.rowCount;
    }

    if (Array.isArray(result.rows)) {
      return result.rows.length;
    }
  }

  return undefined;
}

function extractCompiledQueryInfo(
  context: {
    readonly compiledQuery:
      | {
          readonly sql: string;
          readonly parameterCount: number;
          readonly metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined;
  },
): {
  readonly sql?: string;
  readonly parameterCount?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  const compiledQuery = context.compiledQuery;

  if (!compiledQuery) {
    return {};
  }

  return {
    sql: compiledQuery.sql,
    parameterCount: compiledQuery.parameterCount,
    ...(compiledQuery.metadata ? { metadata: compiledQuery.metadata } : {}),
  };
}

function extractExecutionInfo(context: {
  readonly executionContext:
    | {
        readonly id?: string;
        readonly transaction?: {
          readonly id?: string;
        };
      }
    | undefined;
}): {
  readonly executionContextId?: string;
  readonly transactionId?: string;
} {
  return {
    ...(context.executionContext?.id
      ? { executionContextId: context.executionContext.id }
      : {}),
    ...(context.executionContext?.transaction?.id
      ? { transactionId: context.executionContext.transaction.id }
      : {}),
  };
}

function createBaseEvent(
  context: {
    readonly model:
      | {
          readonly name: string;
          readonly dbTable?: string;
        }
      | undefined;
    readonly queryKind: string | undefined;
    readonly executionContext:
      | {
          readonly id?: string;
          readonly transaction?: {
            readonly id?: string;
          };
        }
      | undefined;
    readonly compiledQuery:
      | {
          readonly sql: string;
          readonly parameterCount: number;
          readonly metadata?: Readonly<Record<string, unknown>>;
        }
      | undefined;
  },
): PostgresObservabilityBaseEvent {
  const queryInfo = extractCompiledQueryInfo(context);
  const lintIssues = resolveLintIssues(queryInfo.sql);
  const executionInfo = extractExecutionInfo(context);

  return {
    plugin: 'postgres-observability',
    ...(context.model?.name ? { modelName: context.model.name } : {}),
    ...(context.model?.dbTable ? { tableName: context.model.dbTable } : {}),
    ...(context.queryKind ? { queryKind: context.queryKind } : {}),
    ...(executionInfo.executionContextId
      ? { executionContextId: executionInfo.executionContextId }
      : {}),
    ...(executionInfo.transactionId ? { transactionId: executionInfo.transactionId } : {}),
    ...(queryInfo.sql ? { sql: queryInfo.sql } : {}),
    ...(queryInfo.parameterCount !== undefined
      ? { parameterCount: queryInfo.parameterCount }
      : {}),
    ...(queryInfo.metadata ? { metadata: queryInfo.metadata } : {}),
    lintIssues,
  };
}

export function createPostgresObservabilityPlugin(
  options: PostgresObservabilityPluginOptions = {},
): Readonly<ObjxPlugin> {
  const metadataKey = withDefaultMetadataKey(
    options.metadataKey,
    POSTGRES_OBSERVABILITY_METADATA_KEY,
  );
  const emitEvent = (event: PostgresObservabilityEvent) => {
    options.emit?.(event);
  };

  const slowQueryThresholdMs = options.slowQueryThresholdMs ?? 250;

  return definePlugin({
    name: 'postgres-observability',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          captureExplainAnalyze: options.captureExplainAnalyze ?? false,
          usePgStatStatements: options.usePgStatStatements ?? true,
          slowQueryThresholdMs,
        } satisfies PostgresObservabilityPluginMetadata);
      },

      onQueryExecute(context) {
        const timing = resolveTimingInfo(context);
        const startedAt = timing.startedAt ?? new Date();

        emitEvent({
          type: 'query:execute',
          ...createBaseEvent({
            model: context.model,
            queryKind: context.queryKind,
            executionContext: context.executionContext,
            compiledQuery: context.compiledQuery,
          }),
          startedAt,
        });
      },

      onResult(context) {
        const timing = resolveTimingInfo(context);
        const finishedAt = timing.finishedAt ?? new Date();
        const startedAt = timing.startedAt ?? finishedAt;
        const durationMs = timing.durationMs ?? finishedAt.getTime() - startedAt.getTime();
        const rowCount = resolveRowCount(context.result);

        emitEvent({
          type: 'query:result',
          ...createBaseEvent({
            model: context.model,
            queryKind: context.queryKind,
            executionContext: context.executionContext,
            compiledQuery: context.compiledQuery,
          }),
          startedAt,
          finishedAt,
          durationMs,
          ...(rowCount !== undefined ? { rowCount } : {}),
          isSlowQuery: durationMs >= slowQueryThresholdMs,
        });

        return undefined;
      },

      onError(context) {
        const timing = resolveTimingInfo(context);
        const finishedAt = timing.finishedAt ?? new Date();
        const startedAt = timing.startedAt ?? finishedAt;
        const durationMs = timing.durationMs ?? finishedAt.getTime() - startedAt.getTime();

        emitEvent({
          type: 'query:error',
          ...createBaseEvent({
            model: context.model,
            queryKind: context.queryKind,
            executionContext: context.executionContext,
            compiledQuery: context.compiledQuery,
          }),
          startedAt,
          finishedAt,
          durationMs,
          error: context.error,
          isSlowQuery: durationMs >= slowQueryThresholdMs,
        });

        return undefined;
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

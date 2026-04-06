import { definePlugin, type ObjxPlugin } from '@qbobjx/core';

export interface TimestampsPluginOptions {
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly metadataKey?: string;
}

export function createTimestampsPlugin(
  options: TimestampsPluginOptions = {},
): Readonly<ObjxPlugin> {
  const createdAt = options.createdAt ?? 'createdAt';
  const updatedAt = options.updatedAt ?? 'updatedAt';
  const metadataKey = options.metadataKey ?? 'timestamps';

  return definePlugin({
    name: 'timestamps',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          createdAt,
          updatedAt,
        });
      },
    },
  });
}

export interface SnakeCaseNamingPluginOptions {
  readonly table?: boolean | string;
  readonly exclude?: readonly string[];
  readonly overrides?: Readonly<Record<string, string>>;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

export function createSnakeCaseNamingPlugin(
  options: SnakeCaseNamingPluginOptions = {},
): Readonly<ObjxPlugin> {
  const tableOption = options.table ?? false;
  const excluded = new Set(options.exclude ?? []);
  const overrides = options.overrides ?? {};

  return definePlugin({
    name: 'snake-case-naming',
    hooks: {
      onModelDefine(context) {
        if (tableOption) {
          context.setTableDbName(
            typeof tableOption === 'string' ? tableOption : toSnakeCase(context.table),
          );
        }

        for (const columnKey of Object.keys(context.columnDefinitions)) {
          if (excluded.has(columnKey)) {
            continue;
          }

          context.setColumnDbName(columnKey, overrides[columnKey] ?? toSnakeCase(columnKey));
        }
      },
    },
  });
}

export const SOFT_DELETE_METADATA_KEY = 'softDelete';

export interface SoftDeletePluginMetadata {
  readonly column: string;
  readonly activeValue?: unknown;
  readonly deletedValue?: unknown;
  readonly deletedValueFactory?: () => unknown;
}

export interface SoftDeletePluginOptions {
  readonly column?: string;
  readonly strategy?: 'timestamp' | 'boolean';
  readonly metadataKey?: string;
  readonly activeValue?: unknown;
  readonly deletedValue?: unknown;
  readonly deletedValueFactory?: () => unknown;
}

export function createSoftDeletePlugin(
  options: SoftDeletePluginOptions = {},
): Readonly<ObjxPlugin> {
  const strategy = options.strategy ?? 'timestamp';
  const column = options.column ?? (strategy === 'boolean' ? 'isDeleted' : 'deletedAt');
  const metadataKey = options.metadataKey ?? SOFT_DELETE_METADATA_KEY;
  const activeValue =
    options.activeValue !== undefined ? options.activeValue : strategy === 'boolean' ? false : null;
  const deletedValue =
    options.deletedValue !== undefined ? options.deletedValue : strategy === 'boolean' ? true : undefined;
  const deletedValueFactory =
    options.deletedValueFactory ??
    (strategy === 'timestamp' && deletedValue === undefined ? () => new Date() : undefined);

  return definePlugin({
    name: 'soft-delete',
    hooks: {
      onModelRegister(context) {
        if (!(column in context.model.columnDefinitions)) {
          throw new Error(
            `Soft delete column "${column}" was not found on model "${context.model.name}".`,
          );
        }

        const metadata: SoftDeletePluginMetadata = deletedValueFactory
          ? {
              column,
              activeValue,
              deletedValueFactory,
            }
          : {
              column,
              activeValue,
              deletedValue,
            };

        context.setMetadata(metadataKey, metadata);
      },
    },
  });
}

export const AUDIT_TRAIL_METADATA_KEY = 'auditTrail';

export type AuditTrailOperation = 'insert' | 'update' | 'delete' | 'select';

export interface AuditTrailEntry {
  readonly at: Date;
  readonly model: string;
  readonly table: string;
  readonly operation: AuditTrailOperation;
  readonly actorId?: unknown;
  readonly actorKey: string;
  readonly rowCount?: number;
  readonly executionContextId?: string;
  readonly transactionId?: string;
  readonly result?: unknown;
}

export interface AuditTrailPluginMetadata {
  readonly actorKey: string;
  readonly operations: readonly AuditTrailOperation[];
  readonly includeResult: boolean;
}

export interface AuditTrailPluginOptions {
  readonly actorKey?: string;
  readonly metadataKey?: string;
  readonly operations?: readonly AuditTrailOperation[];
  readonly includeResult?: boolean;
  emit(entry: AuditTrailEntry): void;
}

function isAuditTrailOperation(value: string | undefined): value is AuditTrailOperation {
  return value === 'insert' || value === 'update' || value === 'delete' || value === 'select';
}

function resolveAuditRowCount(result: unknown): number | undefined {
  if (typeof result === 'number') {
    return result;
  }

  if (Array.isArray(result)) {
    return result.length;
  }

  if (
    typeof result === 'object' &&
    result !== null &&
    'rowCount' in result &&
    typeof result.rowCount === 'number'
  ) {
    return result.rowCount;
  }

  return undefined;
}

export function createAuditTrailPlugin(
  options: AuditTrailPluginOptions,
): Readonly<ObjxPlugin> {
  const actorKey = options.actorKey ?? 'actorId';
  const metadataKey = options.metadataKey ?? AUDIT_TRAIL_METADATA_KEY;
  const operations = options.operations ?? ['insert', 'update', 'delete'];
  const includeResult = options.includeResult ?? false;

  return definePlugin({
    name: 'audit-trail',
    hooks: {
      onModelRegister(context) {
        context.setMetadata(metadataKey, {
          actorKey,
          operations,
          includeResult,
        } satisfies AuditTrailPluginMetadata);
      },
      onResult(context) {
        if (!context.model || !isAuditTrailOperation(context.queryKind)) {
          return undefined;
        }

        const metadata = context.metadata.get(metadataKey) as AuditTrailPluginMetadata | undefined;

        if (!metadata || !metadata.operations.includes(context.queryKind)) {
          return undefined;
        }

        const entry: {
          at: Date;
          model: string;
          table: string;
          operation: AuditTrailOperation;
          actorKey: string;
          actorId?: unknown;
          rowCount?: number;
          executionContextId?: string;
          transactionId?: string;
          result?: unknown;
        } = {
          at: new Date(),
          model: context.model.name,
          table: context.model.dbTable,
          operation: context.queryKind,
          actorKey: metadata.actorKey,
        };

        const actorId = context.executionContext?.values.get(metadata.actorKey);
        const rowCount = resolveAuditRowCount(context.result);

        if (actorId !== undefined) {
          entry.actorId = actorId;
        }

        if (rowCount !== undefined) {
          entry.rowCount = rowCount;
        }

        if (context.executionContext?.id) {
          entry.executionContextId = context.executionContext.id;
        }

        if (context.executionContext?.transaction?.id) {
          entry.transactionId = context.executionContext.transaction.id;
        }

        if (metadata.includeResult) {
          entry.result = context.result;
        }

        options.emit(entry);

        return undefined;
      },
    },
  });
}

export const TENANT_SCOPE_METADATA_KEY = 'tenantScope';

export interface TenantScopePluginMetadata {
  readonly column: string;
  readonly contextKey: string;
  readonly bypassKey: string;
  readonly required: boolean;
}

export interface TenantScopePluginOptions {
  readonly column?: string;
  readonly contextKey?: string;
  readonly metadataKey?: string;
  readonly bypassKey?: string;
  readonly required?: boolean;
}

export function createTenantScopePlugin(
  options: TenantScopePluginOptions = {},
): Readonly<ObjxPlugin> {
  const column = options.column ?? 'tenantId';
  const contextKey = options.contextKey ?? 'tenantId';
  const metadataKey = options.metadataKey ?? TENANT_SCOPE_METADATA_KEY;
  const bypassKey = options.bypassKey ?? 'objx.tenantScope.bypass';
  const required = options.required ?? true;

  return definePlugin({
    name: 'tenant-scope',
    hooks: {
      onModelRegister(context) {
        if (!(column in context.model.columnDefinitions)) {
          throw new Error(
            `Tenant scope column "${column}" was not found on model "${context.model.name}".`,
          );
        }

        context.setMetadata(metadataKey, {
          column,
          contextKey,
          bypassKey,
          required,
        } satisfies TenantScopePluginMetadata);
      },
    },
  });
}

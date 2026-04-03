import type { AnyColumnDefinition } from './columns.js';
import type { AnyModelDefinition, InferModelShape } from './model.js';

export interface HydrationOptions {
  readonly preserveUnknownKeys?: boolean;
}

export type ColumnHydrator<TValue = unknown> = (
  value: unknown,
  column: AnyColumnDefinition,
) => TValue;

function hasOwnKey(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === 't' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === 'f' || normalized === '0') {
      return false;
    }
  }

  return value;
}

function coerceNumber(value: unknown): unknown {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function coerceBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return value;
    }

    return BigInt(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (normalized === '' || !/^-?\d+$/.test(normalized)) {
      return value;
    }

    try {
      return BigInt(normalized);
    } catch {
      return value;
    }
  }

  return value;
}

function coerceTimestamp(value: unknown): unknown {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  return value;
}

function coerceJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();

  if (normalized === '') {
    return value;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return value;
  }
}

export function hydrateColumnValue(
  definition: AnyColumnDefinition,
  value: unknown,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const customHydrator = definition.config.hydrate;

  if (typeof customHydrator === 'function') {
    return (customHydrator as ColumnHydrator)(value, definition);
  }

  switch (definition.kind) {
    case 'int':
      return coerceNumber(value);
    case 'bigint':
      return coerceBigInt(value);
    case 'boolean':
      return coerceBoolean(value);
    case 'json':
      return coerceJson(value);
    case 'timestamp':
      return coerceTimestamp(value);
    default:
      return value;
  }
}

export function hydrateModelRow<TModel extends AnyModelDefinition>(
  model: TModel,
  row: Readonly<Record<string, unknown>>,
  options: HydrationOptions = {},
): InferModelShape<TModel> & Record<string, unknown> {
  const preserveUnknownKeys = options.preserveUnknownKeys ?? true;
  const hydrated: Record<string, unknown> = preserveUnknownKeys ? { ...row } : {};

  for (const [columnName, definition] of Object.entries(model.columnDefinitions) as [
    string,
    AnyColumnDefinition,
  ][]) {
    const configuredDbName = definition.config.dbName;
    const sourceColumnName =
      typeof configuredDbName === 'string' && configuredDbName.trim().length > 0
        ? configuredDbName
        : columnName;

    if (!hasOwnKey(row, sourceColumnName)) {
      continue;
    }

    hydrated[columnName] = hydrateColumnValue(definition, row[sourceColumnName]);

    if (preserveUnknownKeys && sourceColumnName !== columnName) {
      delete hydrated[sourceColumnName];
    }
  }

  return hydrated as InferModelShape<TModel> & Record<string, unknown>;
}

export function hydrateModelRows<TModel extends AnyModelDefinition>(
  model: TModel,
  rows: readonly Readonly<Record<string, unknown>>[],
  options?: HydrationOptions,
): readonly (InferModelShape<TModel> & Record<string, unknown>)[] {
  return rows.map((row) => hydrateModelRow(model, row, options));
}

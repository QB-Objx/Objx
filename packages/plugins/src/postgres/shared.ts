export const DEFAULT_INTERNAL_SCHEMA = 'objx_internal';

export interface PostgresPluginBaseOptions {
  readonly metadataKey?: string;
}

export function withDefaultMetadataKey(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertSafeSqlIdentifier(identifier: string): string {
  if (!IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Unsafe SQL identifier "${identifier}".`);
  }

  return identifier;
}

export function quoteSqlIdentifier(identifier: string): string {
  return `"${assertSafeSqlIdentifier(identifier).replaceAll('"', '""')}"`;
}

export function quoteQualifiedSqlIdentifier(...path: readonly string[]): string {
  if (path.length === 0) {
    throw new Error('Expected at least one SQL identifier part.');
  }

  return path.map((part) => quoteSqlIdentifier(part)).join('.');
}

export function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function resolveSchemaAndTable(
  schema: string,
  table: string,
): {
  readonly schema: string;
  readonly table: string;
  readonly qualifiedName: string;
} {
  const safeSchema = assertSafeSqlIdentifier(schema);
  const safeTable = assertSafeSqlIdentifier(table);

  return {
    schema: safeSchema,
    table: safeTable,
    qualifiedName: quoteQualifiedSqlIdentifier(safeSchema, safeTable),
  };
}

export function resolveTableAndColumn(
  table: string,
  column: string,
): {
  readonly table: string;
  readonly column: string;
  readonly qualifiedTable: string;
  readonly quotedColumn: string;
} {
  const safeTable = assertSafeSqlIdentifier(table);
  const safeColumn = assertSafeSqlIdentifier(column);

  return {
    table: safeTable,
    column: safeColumn,
    qualifiedTable: quoteSqlIdentifier(safeTable),
    quotedColumn: quoteSqlIdentifier(safeColumn),
  };
}

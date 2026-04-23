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

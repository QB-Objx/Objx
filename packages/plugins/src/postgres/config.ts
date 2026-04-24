import type { ModelPluginRegistration, ModelRegistry } from '@qbobjx/core';

import { POSTGRES_CACHE_METADATA_KEY, type PostgresCachePluginMetadata } from './cache.js';
import { POSTGRES_EVENTS_METADATA_KEY, type PostgresEventsPluginMetadata } from './events.js';
import { POSTGRES_JSON_METADATA_KEY, type PostgresJsonPluginMetadata } from './json.js';
import {
  POSTGRES_OBSERVABILITY_METADATA_KEY,
  type PostgresObservabilityPluginMetadata,
} from './observability.js';
import { POSTGRES_QUEUE_METADATA_KEY, type PostgresQueuePluginMetadata } from './queue.js';
import { POSTGRES_SEARCH_METADATA_KEY, type PostgresSearchPluginMetadata } from './search.js';
import {
  POSTGRES_SECURITY_METADATA_KEY,
  type PostgresSecurityPluginMetadata,
} from './security.js';
import {
  POSTGRES_TIMESERIES_METADATA_KEY,
  type PostgresTimeseriesPluginMetadata,
} from './timeseries.js';
import { POSTGRES_VECTOR_METADATA_KEY, type PostgresVectorPluginMetadata } from './vector.js';

type AnyRegistration = ModelPluginRegistration;

type MetadataValue =
  | PostgresQueuePluginMetadata
  | PostgresEventsPluginMetadata
  | PostgresCachePluginMetadata
  | PostgresSearchPluginMetadata
  | PostgresJsonPluginMetadata
  | PostgresSecurityPluginMetadata
  | PostgresObservabilityPluginMetadata
  | PostgresTimeseriesPluginMetadata
  | PostgresVectorPluginMetadata;

export interface PostgresRuntimeConfig {
  readonly queue?: Readonly<PostgresQueuePluginMetadata>;
  readonly events?: Readonly<PostgresEventsPluginMetadata>;
  readonly cache?: Readonly<PostgresCachePluginMetadata>;
  readonly search?: Readonly<PostgresSearchPluginMetadata>;
  readonly json?: Readonly<PostgresJsonPluginMetadata>;
  readonly security?: Readonly<PostgresSecurityPluginMetadata>;
  readonly observability?: Readonly<PostgresObservabilityPluginMetadata>;
  readonly timeseries?: Readonly<PostgresTimeseriesPluginMetadata>;
  readonly vector?: Readonly<PostgresVectorPluginMetadata>;
}

export interface PostgresExecutionContextSettingBinding {
  readonly setting: string;
  readonly contextKey: string;
  readonly required?: boolean;
  readonly isLocal?: boolean;
  readonly applyOnNestedTransactions?: boolean;
}

export interface PostgresExecutionContextSettingsOptions {
  readonly bindings: readonly PostgresExecutionContextSettingBinding[];
}

export interface ResolvePostgresConfigOptions {
  readonly throwOnConflict?: boolean;
}

export type PostgresRegistrationSource = ModelRegistry | readonly AnyRegistration[];

export interface ResolvePostgresIntegrationOptions extends ResolvePostgresConfigOptions {
  readonly tenantContextKey?: string;
  readonly required?: boolean;
  readonly isLocal?: boolean;
  readonly applyOnNestedTransactions?: boolean;
}

export interface PostgresIntegration {
  readonly config: PostgresRuntimeConfig;
  readonly executionContextSettings?: PostgresExecutionContextSettingsOptions;
}

interface RegistrationLikeRegistry {
  all(): readonly AnyRegistration[];
}

function isRegistryLike(value: unknown): value is RegistrationLikeRegistry {
  return typeof value === 'object' && value !== null && 'all' in value && typeof value.all === 'function';
}

function freezeIfDefined<TValue>(value: TValue | undefined): Readonly<TValue> | undefined {
  return value === undefined ? undefined : Object.freeze({ ...value });
}

function registrationsFromSource(
  source: PostgresRegistrationSource,
): readonly AnyRegistration[] {
  if (Array.isArray(source)) {
    return source;
  }

  if (isRegistryLike(source)) {
    return source.all();
  }

  return [];
}

function stableValue(value: unknown): string {
  return JSON.stringify(value, (_key, nextValue) => {
    if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
      return Object.fromEntries(
        Object.entries(nextValue as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }

    return nextValue;
  });
}

function describeConflict(
  metadataKey: string,
  values: readonly { modelName: string; value: MetadataValue }[],
): string {
  const details = values
    .map(({ modelName, value }) => `${modelName}=${stableValue(value)}`)
    .join(', ');

  return `Conflicting PostgreSQL runtime plugin metadata for "${metadataKey}": ${details}`;
}

function resolveUniqueMetadata<TValue extends MetadataValue>(
  registrations: readonly AnyRegistration[],
  metadataKey: string,
  options: ResolvePostgresConfigOptions,
): TValue | undefined {
  const values = registrations
    .map((registration) => ({
      modelName: registration.model.name,
      value: registration.metadata.get(metadataKey),
    }))
    .filter(
      (entry): entry is { modelName: string; value: TValue } => entry.value !== undefined,
    );

  const firstEntry = values[0];

  if (!firstEntry) {
    return undefined;
  }

  const first = stableValue(firstEntry.value);
  const hasConflict = values.some((entry) => stableValue(entry.value) !== first);

  if (hasConflict && (options.throwOnConflict ?? true)) {
    throw new Error(describeConflict(metadataKey, values));
  }

  return firstEntry.value;
}

function assignIfDefined<TKey extends keyof PostgresRuntimeConfig>(
  target: Partial<PostgresRuntimeConfig>,
  key: TKey,
  value: PostgresRuntimeConfig[TKey] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function resolvePostgresConfig(
  source: PostgresRegistrationSource,
  options: ResolvePostgresConfigOptions = {},
): PostgresRuntimeConfig {
  const registrations = registrationsFromSource(source);
  const config: Partial<PostgresRuntimeConfig> = {};

  assignIfDefined(
    config,
    'queue',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresQueuePluginMetadata>(
        registrations,
        POSTGRES_QUEUE_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'events',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresEventsPluginMetadata>(
        registrations,
        POSTGRES_EVENTS_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'cache',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresCachePluginMetadata>(
        registrations,
        POSTGRES_CACHE_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'search',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresSearchPluginMetadata>(
        registrations,
        POSTGRES_SEARCH_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'json',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresJsonPluginMetadata>(
        registrations,
        POSTGRES_JSON_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'security',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresSecurityPluginMetadata>(
        registrations,
        POSTGRES_SECURITY_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'observability',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresObservabilityPluginMetadata>(
        registrations,
        POSTGRES_OBSERVABILITY_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'timeseries',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresTimeseriesPluginMetadata>(
        registrations,
        POSTGRES_TIMESERIES_METADATA_KEY,
        options,
      ),
    ),
  );

  assignIfDefined(
    config,
    'vector',
    freezeIfDefined(
      resolveUniqueMetadata<PostgresVectorPluginMetadata>(
        registrations,
        POSTGRES_VECTOR_METADATA_KEY,
        options,
      ),
    ),
  );

  return Object.freeze(config);
}

export function createPostgresExecutionContextSettingsFromConfig(
  config: PostgresRuntimeConfig,
  options: {
    readonly tenantContextKey?: string;
    readonly required?: boolean;
    readonly isLocal?: boolean;
    readonly applyOnNestedTransactions?: boolean;
  } = {},
): PostgresExecutionContextSettingsOptions | undefined {
  if (!config.security?.tenantSettingName) {
    return undefined;
  }

  const binding: PostgresExecutionContextSettingBinding =
    options.applyOnNestedTransactions !== undefined
      ? {
          setting: config.security.tenantSettingName,
          contextKey: options.tenantContextKey ?? 'tenantId',
          required: options.required ?? true,
          isLocal: options.isLocal ?? true,
          applyOnNestedTransactions: options.applyOnNestedTransactions,
        }
      : {
          setting: config.security.tenantSettingName,
          contextKey: options.tenantContextKey ?? 'tenantId',
          required: options.required ?? true,
          isLocal: options.isLocal ?? true,
        };

  return Object.freeze({
    bindings: Object.freeze([Object.freeze(binding)]),
  });
}

export function createPostgresExecutionContextSettingsFromRegistrations(
  source: PostgresRegistrationSource,
  options: ResolvePostgresIntegrationOptions = {},
): PostgresExecutionContextSettingsOptions | undefined {
  const config = resolvePostgresConfig(source, options);
  const executionOptions =
    options.tenantContextKey !== undefined ||
    options.required !== undefined ||
    options.isLocal !== undefined ||
    options.applyOnNestedTransactions !== undefined
      ? {
          ...(options.tenantContextKey !== undefined
            ? { tenantContextKey: options.tenantContextKey }
            : {}),
          ...(options.required !== undefined ? { required: options.required } : {}),
          ...(options.isLocal !== undefined ? { isLocal: options.isLocal } : {}),
          ...(options.applyOnNestedTransactions !== undefined
            ? { applyOnNestedTransactions: options.applyOnNestedTransactions }
            : {}),
        }
      : {};

  return createPostgresExecutionContextSettingsFromConfig(config, executionOptions);
}

export function resolvePostgresIntegration(
  source: PostgresRegistrationSource,
  options: ResolvePostgresIntegrationOptions = {},
): PostgresIntegration {
  const config = resolvePostgresConfig(source, options);
  const executionContextSettings = createPostgresExecutionContextSettingsFromConfig(config, {
    ...(options.tenantContextKey !== undefined
      ? { tenantContextKey: options.tenantContextKey }
      : {}),
    ...(options.required !== undefined ? { required: options.required } : {}),
    ...(options.isLocal !== undefined ? { isLocal: options.isLocal } : {}),
    ...(options.applyOnNestedTransactions !== undefined
      ? { applyOnNestedTransactions: options.applyOnNestedTransactions }
      : {}),
  });

  return Object.freeze({
    config,
    ...(executionContextSettings ? { executionContextSettings } : {}),
  });
}

/**
 * @deprecated Use `PostgresRuntimeConfig`.
 */
export type PostgresSpecialistResolvedConfig = PostgresRuntimeConfig;

/**
 * @deprecated Use `PostgresExecutionContextSettingBinding`.
 */
export type PostgresSpecialistExecutionContextSettingBinding =
  PostgresExecutionContextSettingBinding;

/**
 * @deprecated Use `PostgresExecutionContextSettingsOptions`.
 */
export type PostgresSpecialistExecutionContextSettingsOptions =
  PostgresExecutionContextSettingsOptions;

/**
 * @deprecated Use `ResolvePostgresConfigOptions`.
 */
export type ResolvePostgresSpecialistConfigOptions = ResolvePostgresConfigOptions;

/**
 * @deprecated Use `PostgresRegistrationSource`.
 */
export type PostgresSpecialistRegistrationSource = PostgresRegistrationSource;

/**
 * @deprecated Use `resolvePostgresConfig`.
 */
export const resolvePostgresSpecialistConfig = resolvePostgresConfig;

/**
 * @deprecated Use `resolvePostgresIntegration`.
 */
export const resolvePostgresSpecialistIntegration = resolvePostgresIntegration;

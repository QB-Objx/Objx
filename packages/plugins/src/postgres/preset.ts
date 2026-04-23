import type { ObjxPlugin } from '@qbobjx/core';

import { createPostgresCachePlugin } from './cache.js';
import { createPostgresEventsPlugin, type PostgresEventsPluginOptions } from './events.js';
import { createPostgresJsonPlugin } from './json.js';
import { createPostgresObservabilityPlugin } from './observability.js';
import { createPostgresQueuePlugin, type PostgresQueuePluginOptions } from './queue.js';
import { createPostgresSearchPlugin } from './search.js';
import { createPostgresSecurityPlugin } from './security.js';
import { DEFAULT_INTERNAL_SCHEMA } from './shared.js';
import { createPostgresTimeseriesPlugin } from './timeseries.js';
import { createPostgresVectorPlugin } from './vector.js';

export type PostgresSpecialistFeature =
  | 'search'
  | 'queue'
  | 'events'
  | 'cache'
  | 'vector'
  | 'timeseries'
  | 'json'
  | 'security'
  | 'observability';

const DEFAULT_SPECIALIST_FEATURES: readonly PostgresSpecialistFeature[] = [
  'search',
  'queue',
  'events',
  'cache',
  'vector',
  'timeseries',
  'json',
  'security',
  'observability',
] as const;

export interface PostgresPluginPresetOptions {
  readonly schema?: string;
  readonly include?: readonly PostgresSpecialistFeature[];
  readonly queue?: Omit<PostgresQueuePluginOptions, 'schema'>;
  readonly events?: Omit<PostgresEventsPluginOptions, 'schema'>;
}

export function createPostgresSpecialistPreset(
  options: PostgresPluginPresetOptions = {},
): readonly Readonly<ObjxPlugin>[] {
  const schema = options.schema ?? DEFAULT_INTERNAL_SCHEMA;
  const enabled = new Set(options.include ?? DEFAULT_SPECIALIST_FEATURES);
  const plugins: Readonly<ObjxPlugin>[] = [];

  if (enabled.has('search')) {
    plugins.push(createPostgresSearchPlugin());
  }

  if (enabled.has('queue')) {
    plugins.push(createPostgresQueuePlugin({ schema, ...options.queue }));
  }

  if (enabled.has('events')) {
    plugins.push(createPostgresEventsPlugin({ schema, ...options.events }));
  }

  if (enabled.has('cache')) {
    plugins.push(createPostgresCachePlugin({ schema }));
  }

  if (enabled.has('vector')) {
    plugins.push(createPostgresVectorPlugin());
  }

  if (enabled.has('timeseries')) {
    plugins.push(createPostgresTimeseriesPlugin());
  }

  if (enabled.has('json')) {
    plugins.push(createPostgresJsonPlugin());
  }

  if (enabled.has('security')) {
    plugins.push(createPostgresSecurityPlugin());
  }

  if (enabled.has('observability')) {
    plugins.push(createPostgresObservabilityPlugin());
  }

  return plugins;
}

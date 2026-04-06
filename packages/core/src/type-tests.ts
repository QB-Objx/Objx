import { col } from './columns.js';
import { defineModel, type InferInsertShape, type InferUpdateShape } from './model.js';

const SnowflakeRecord = defineModel({
  name: 'SnowflakeRecord',
  table: 'snowflake_records',
  columns: {
    id: col.bigInt().primary().default(() => 1n),
    tenantId: col.text().generated(),
    name: col.text(),
    archivedAt: col.timestamp().nullable(),
  },
});

const AnalyticsRecord = defineModel({
  name: 'AnalyticsRecord',
  table: 'analytics_records',
  columns: {
    id: col.uuid().primary(),
    amount: col.numeric(),
    ratio: col.float(),
    score: col.double(),
    eventDate: col.date(),
    eventTime: col.time(),
    payload: col.jsonb<{ ok: boolean }>(),
    status: col.enum(['draft', 'published'] as const),
    tags: col.array(col.text()),
  },
});

const validInsert: InferInsertShape<typeof SnowflakeRecord> = {
  name: 'alpha',
};

const validInsertWithGeneratedValues: InferInsertShape<typeof SnowflakeRecord> = {
  id: 2n,
  tenantId: 'tenant_a',
  name: 'beta',
};

const validUpdate: InferUpdateShape<typeof SnowflakeRecord> = {
  tenantId: 'tenant_b',
};

const advancedInsert: InferInsertShape<typeof AnalyticsRecord> = {
  amount: '12.50',
  ratio: 1.25,
  score: 9.5,
  eventDate: new Date('2026-04-06T00:00:00.000Z'),
  eventTime: '10:30:00',
  payload: {
    ok: true,
  },
  status: 'draft',
  tags: ['orm', 'sql'],
};

void SnowflakeRecord;
void AnalyticsRecord;
void validInsert;
void validInsertWithGeneratedValues;
void validUpdate;
void advancedInsert;

// @ts-expect-error name is required for inserts when there is no default, nullability or generated marker.
const invalidInsert: InferInsertShape<typeof SnowflakeRecord> = {};

void invalidInsert;

const invalidAdvancedInsert: InferInsertShape<typeof AnalyticsRecord> = {
  amount: '15.00',
  ratio: 1,
  score: 2,
  eventDate: new Date(),
  eventTime: '10:00:00',
  payload: {
    ok: true,
  },
  // @ts-expect-error enum values must match the configured literal union.
  status: 'archived',
  tags: ['bad'],
};

void invalidAdvancedInsert;

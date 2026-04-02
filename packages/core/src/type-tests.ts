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

void SnowflakeRecord;
void validInsert;
void validInsertWithGeneratedValues;
void validUpdate;

// @ts-expect-error name is required for inserts when there is no default, nullability or generated marker.
const invalidInsert: InferInsertShape<typeof SnowflakeRecord> = {};

void invalidInsert;

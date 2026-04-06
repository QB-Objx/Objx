# @qbobjx/sql-engine

Embedded SQL engine for OBJX: SQL compilation, execution session contracts, and raw SQL helpers.

## Install

```bash
npm install @qbobjx/sql-engine
```

## Quick Usage

```ts
import { identifier, sql } from '@qbobjx/sql-engine';

const query = sql`select * from ${identifier('projects')}`;
```

## Model Column Names

When a model column is configured with `dbName`, `@qbobjx/sql-engine` compiles SQL against the physical column name and aliases full-model selections back to the logical model key.

```ts
import { col, defineModel } from '@qbobjx/core';
import { ObjxSqlCompiler } from '@qbobjx/sql-engine';

const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text().configure({ dbName: 'tenant_id' }),
  },
});

const compiled = new ObjxSqlCompiler({ dialect: 'sqlite3' }).compile(
  Account.query().where(({ tenantId }, op) => op.eq(tenantId, 'tenant_a')),
);
```

The generated SQL uses `tenant_id` in predicates and result selection, while keeping `tenantId` as the logical field name exposed by the model.

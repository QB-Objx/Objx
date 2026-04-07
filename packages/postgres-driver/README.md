# @qbobjx/postgres-driver

Official Postgres driver/session package for OBJX.

## Install

```bash
npm install @qbobjx/postgres-driver @qbobjx/sql-engine @qbobjx/core pg
```

## Quick Usage

```ts
import { Pool } from 'pg';
import { createPostgresSession } from '@qbobjx/postgres-driver';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const session = createPostgresSession({ pool });
```

## Execution Context Settings For RLS

If your PostgreSQL policies depend on `current_setting(...)`, you can map `ExecutionContext`
values into `set_config(...)` automatically at the start of every OBJX transaction:

```ts
import { createExecutionContextManager } from '@qbobjx/core';
import { createPostgresSession } from '@qbobjx/postgres-driver';

const executionContextManager = createExecutionContextManager();

const session = createPostgresSession({
  pool,
  executionContextManager,
  executionContextSettings: {
    bindings: [
      { setting: 'app.tenant_id', contextKey: 'tenantId', required: true },
      { setting: 'app.actor_id', contextKey: 'actorId' },
    ],
  },
});

await executionContextManager.run(
  {
    values: {
      tenantId: 'tenant_a',
      actorId: 'user_123',
    },
  },
  () =>
    session.transaction(async (transactionSession) => {
      await transactionSession.execute(Project.query());
    }),
);
```

Important: with pooled PostgreSQL connections this is intentionally applied inside
`session.transaction(...)`, where OBJX can guarantee the `set_config(...)` calls and the protected
queries use the same physical connection.

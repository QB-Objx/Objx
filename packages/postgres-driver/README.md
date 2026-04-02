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

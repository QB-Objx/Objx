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

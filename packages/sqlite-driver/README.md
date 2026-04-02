# @qbobjx/sqlite-driver

Official SQLite driver/session package for OBJX.

## Install

```bash
npm install @qbobjx/sqlite-driver @qbobjx/sql-engine @qbobjx/core
```

## Quick Usage

```ts
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const session = createSqliteSession({
  databasePath: './app.sqlite',
});
```

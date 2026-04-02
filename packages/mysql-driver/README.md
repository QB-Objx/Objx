# @qbobjx/mysql-driver

Official MySQL driver/session package for OBJX.

## Install

```bash
npm install @qbobjx/mysql-driver @qbobjx/sql-engine @qbobjx/core mysql2
```

## Quick Usage

```ts
import mysql from 'mysql2/promise';
import { createMySqlSession } from '@qbobjx/mysql-driver';

const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
const session = createMySqlSession({ pool });
```

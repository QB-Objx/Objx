import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createExecutionContextManager } from '@qbobjx/core';
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databasePath = path.join(exampleDir, 'app.sqlite');
const schemaPath = path.join(exampleDir, 'schema.sql');

const database = new DatabaseSync(databasePath);
database.exec(readFileSync(schemaPath, 'utf8'));

const executionContextManager = createExecutionContextManager();

export const session = createSqliteSession({
  database,
  executionContextManager,
  hydrateByDefault: true,
  pragmas: ['foreign_keys = on'],
});

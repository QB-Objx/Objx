import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createExecutionContextManager } from '@qbobjx/core';
import {
  createAuditTrailPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@qbobjx/plugins';
import { createSqliteSession } from '@qbobjx/sqlite-driver';

const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(exampleDir, 'schema.sql');
const databasePath = path.join(exampleDir, 'app.sqlite');
const database = new DatabaseSync(databasePath);

database.exec(await readFile(schemaPath, 'utf8'));

export const auditTrailEntries = [];
export const executionContextManager = createExecutionContextManager();

export const session = createSqliteSession({
  database,
  executionContextManager,
  hydrateByDefault: true,
  pragmas: ['foreign_keys = on'],
  plugins: [
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
    createAuditTrailPlugin({
      actorKey: 'actorId',
      operations: ['insert', 'update', 'delete'],
      emit(entry) {
        auditTrailEntries.push(entry);
      },
    }),
  ],
});

export function closeDatabase() {
  database.close();
}

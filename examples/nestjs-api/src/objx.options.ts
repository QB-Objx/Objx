import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutionContextManager } from '@qbobjx/core';
import type { ObjxModuleResolvedOptions } from '@qbobjx/nestjs';
import {
  createAuditTrailPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@qbobjx/plugins';
import {
  createSqliteDriver,
  createSqliteSession,
} from '@qbobjx/sqlite-driver';
import { AuditTrailStore } from './audit-trail.store.js';

const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(exampleDir, 'data', 'app.sqlite');

export function createObjxNestModuleOptions(
  auditTrailStore: AuditTrailStore,
): ObjxModuleResolvedOptions<ReturnType<typeof createSqliteSession>> {
  const executionContextManager = createExecutionContextManager();
  const driver = createSqliteDriver({
    databasePath,
    pragmas: ['foreign_keys = on'],
  });
  const session = createSqliteSession({
    driver,
    executionContextManager,
    hydrateByDefault: true,
    plugins: [
      createTenantScopePlugin(),
      createSoftDeletePlugin(),
      createAuditTrailPlugin({
        actorKey: 'actorId',
        operations: ['insert', 'update', 'delete'],
        emit: (entry) => {
          auditTrailStore.append(entry);
        },
      }),
    ],
  });

  return {
    session,
    dispose: () => driver.close(),
    requestContext: {
      enabled: true,
    },
  };
}

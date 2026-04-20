import assert from 'node:assert/strict';

import { createExecutionContextManager } from '@qbobjx/core';
import { ObjxValidationError } from '@qbobjx/validation';
import {
  createObjxRequestContext,
  defineObjxAction,
  defineObjxLoader,
  mapObjxErrorToResponse,
  runObjxAction,
  withObjxContext,
} from '../packages/fullstack/dist/index.js';

function createFakeSession() {
  const executionContextManager = createExecutionContextManager();
  let transactionCalls = 0;

  return {
    executionContextManager,
    transactionCalls: () => transactionCalls,
    async transaction(callback) {
      transactionCalls += 1;
      return callback();
    },
  };
}

async function testCreateObjxRequestContext() {
  const request = {
    method: 'POST',
    url: 'https://example.test/projects',
    headers: new Headers({
      'x-tenant-id': 'tenant_a',
      'x-actor-id': 'actor_1',
      'x-request-id': 'req_42',
    }),
  };

  const values = await createObjxRequestContext(request, {
    staticValues: {
      region: 'us',
    },
    resolveValues: async () => ({
      source: 'test',
    }),
  });

  assert.deepEqual(values, {
    region: 'us',
    tenantId: 'tenant_a',
    actorId: 'actor_1',
    requestId: 'req_42',
    requestMethod: 'POST',
    requestPath: 'https://example.test/projects',
    source: 'test',
  });
}

async function testWithObjxContext() {
  const session = createFakeSession();
  const request = {
    headers: {
      'x-tenant-id': 'tenant_b',
    },
  };

  const result = await withObjxContext(session, request, async () => {
    const current = session.executionContextManager.current();
    assert.ok(current);
    assert.equal(current.values.get('tenantId'), 'tenant_b');
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(session.executionContextManager.current(), undefined);
}

async function testRunObjxActionTransactionToggle() {
  const session = createFakeSession();

  const defaultResult = await runObjxAction(
    session,
    { headers: { 'x-tenant-id': 'tenant_tx' } },
    async () => 'default',
  );
  assert.equal(defaultResult, 'default');
  assert.equal(session.transactionCalls(), 1);

  const explicitResult = await runObjxAction(
    session,
    { headers: { 'x-tenant-id': 'tenant_no_tx' } },
    async () => 'no-tx',
    {
      execution: {
        useTransaction: false,
      },
    },
  );
  assert.equal(explicitResult, 'no-tx');
  assert.equal(session.transactionCalls(), 1);
}

async function testDefineWrappers() {
  const session = createFakeSession();

  const loader = defineObjxLoader(session, async ({ request }) => {
    const current = session.executionContextManager.current();
    return {
      tenant: current?.values.get('tenantId'),
      method: request.method,
    };
  });

  const action = defineObjxAction(
    session,
    async ({ request }) => ({
      url: request.url,
      tenant: session.executionContextManager.getValue('tenantId'),
    }),
    {
      execution: {
        useTransaction: false,
      },
    },
  );

  const loaderResult = await loader({
    request: {
      method: 'GET',
      headers: {
        'x-tenant-id': 'tenant_loader',
      },
    },
  });
  assert.deepEqual(loaderResult, {
    tenant: 'tenant_loader',
    method: 'GET',
  });

  const actionResult = await action({
    request: {
      url: 'https://example.test/action',
      headers: {
        'x-tenant-id': 'tenant_action',
      },
    },
  });
  assert.deepEqual(actionResult, {
    url: 'https://example.test/action',
    tenant: 'tenant_action',
  });
}

async function testMapObjxErrorToResponse() {
  const error = new ObjxValidationError('Invalid payload', {
    adapterName: 'zod',
    operation: 'insert',
    modelName: 'Project',
    tableName: 'projects',
    issues: [
      {
        code: 'invalid_type',
        message: 'Expected string',
        path: 'name',
      },
    ],
  });

  const response = mapObjxErrorToResponse(error);
  assert.ok(response);
  assert.equal(response.status, 422);

  const body = await response.json();
  assert.equal(body.error, 'objx_validation_failed');
  assert.equal(body.modelName, 'Project');
  assert.equal(body.tableName, 'projects');
  assert.equal(body.adapter, 'zod');
  assert.equal(body.operation, 'insert');
  assert.equal(body.issues.length, 1);

  const unknownResponse = mapObjxErrorToResponse(new Error('boom'));
  assert.equal(unknownResponse, undefined);
}

await testCreateObjxRequestContext();
await testWithObjxContext();
await testRunObjxActionTransactionToggle();
await testDefineWrappers();
await testMapObjxErrorToResponse();

# @qbobjx/fullstack

Official fullstack integration for OBJX runtimes that use the Web Fetch API.

## Install

```bash
npm install @qbobjx/fullstack
```

Add driver/core packages as needed, for example:

```bash
npm install @qbobjx/core @qbobjx/sqlite-driver @qbobjx/plugins
```

## What You Get

- request-context helpers based on `Request`/`headers`
- `withObjxContext(...)` for explicit context boundaries
- `defineObjxLoader(...)` and `defineObjxAction(...)`
- optional transaction boundary helper for actions
- `mapObjxErrorToResponse(...)` for OBJX validation errors

## Quick Usage

```ts
import { defineObjxAction, defineObjxLoader, mapObjxErrorToResponse } from '@qbobjx/fullstack';
import { session } from './objx.server';
import { Project } from './models.server';

export const loader = defineObjxLoader(session, async ({ request }, objx) => {
  const rows = await objx.execute(Project.query());
  return Response.json({ data: rows });
});

export const action = defineObjxAction(
  session,
  async ({ request }, objx) => {
    const payload = await request.json();
    const inserted = await objx.insertGraph(Project, payload, { hydrate: true });
    return Response.json({ data: inserted }, { status: 201 });
  },
  {
    execution: {
      useTransaction: true,
    },
  },
);

export async function actionWithErrorMapping(args: { request: Request }) {
  try {
    return await action(args);
  } catch (error) {
    return mapObjxErrorToResponse(error) ?? new Response('Internal Server Error', { status: 500 });
  }
}
```

## Request Context

By default, OBJX request context extraction reads:

- `x-tenant-id` -> `tenantId`
- `x-actor-id` -> `actorId`
- `x-request-id` -> `requestId`

You can override headers and enrich values with `resolveValues(request)`.

# @qbobjx/plugins

Official OBJX plugins, including timestamps, snake case naming, soft delete, tenant scope, and audit trail.

## Install

```bash
npm install @qbobjx/plugins
```

## Quick Usage

```ts
import { col, defineModel } from '@qbobjx/core';
import {
  createSnakeCaseNamingPlugin,
  createSoftDeletePlugin,
  createTenantScopePlugin,
} from '@qbobjx/plugins';

export const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    deletedAt: col.timestamp().nullable(),
  },
  plugins: [
    createSnakeCaseNamingPlugin(),
    createTenantScopePlugin(),
    createSoftDeletePlugin(),
  ],
});
```

## Included Plugins

- `createTimestampsPlugin()`
- `createSnakeCaseNamingPlugin()`
- `createSoftDeletePlugin()`
- `createTenantScopePlugin()`
- `createAuditTrailPlugin()`

## Snake Case Naming

Use `createSnakeCaseNamingPlugin()` when your model keys are camelCase but your physical database columns are snake_case.

```ts
import { col, defineModel } from '@qbobjx/core';
import { createSnakeCaseNamingPlugin } from '@qbobjx/plugins';

export const Account = defineModel({
  table: 'accounts',
  columns: {
    id: col.int().primary(),
    tenantId: col.text(),
    createdAt: col.timestamp(),
  },
  plugins: [
    createSnakeCaseNamingPlugin({
      exclude: ['id'],
      overrides: {
        createdAt: 'created_on',
      },
    }),
  ],
});
```

The compiler emits physical names like `tenant_id`, while hydrated rows continue to use model keys like `tenantId`.

Important: this plugin should be attached at model definition time. It updates column metadata in
the `onModelDefine` hook, so adding it only as a session-global plugin is too late for remapping.

Repository examples using this pattern:

- `examples/complex-runtime`
- `examples/express-api`
- `examples/nestjs-api`

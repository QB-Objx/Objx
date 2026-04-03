# @qbobjx/core

Core runtime for OBJX: model metadata, columns, relations, typed query builder, and execution context contracts.

## Install

```bash
npm install @qbobjx/core
```

## Quick Usage

```ts
import { col, defineModel } from '@qbobjx/core';

export const Project = defineModel({
  table: 'projects',
  columns: {
    id: col.int().primary(),
    name: col.text(),
    tenantId: col.text().generated(),
  },
});
```

## Plugin Authoring

`@qbobjx/core` also exports the public plugin contracts used by official and custom plugins.

```ts
import { definePlugin } from '@qbobjx/core';

export const snakeCasePlugin = definePlugin({
  name: 'snake-case-naming',
  hooks: {
    onModelDefine(context) {
      context.setColumnDbName('tenantId', 'tenant_id');
      context.setColumnDbName('createdAt', 'created_at');
    },
  },
});
```

`onModelDefine` runs during `defineModel(...)` after column inputs are resolved and before the final model metadata is frozen. Use it to inspect `columnDefinitions`, read existing `dbName` mappings with `getColumnDbName(...)`, or apply naming conventions with `setColumnDbName(...)`.

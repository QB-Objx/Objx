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
  },
});
```

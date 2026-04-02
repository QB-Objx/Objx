# @qbobjx/plugins

Official OBJX plugins, including timestamps, soft delete, tenant scope, and audit trail.

## Install

```bash
npm install @qbobjx/plugins
```

## Quick Usage

```ts
import { createSoftDeletePlugin } from '@qbobjx/plugins';

const plugins = [createSoftDeletePlugin()];
```

---
'@qbobjx/core': minor
'@qbobjx/sql-engine': minor
'@qbobjx/plugins': minor
---

Added a model-definition plugin stage in `@qbobjx/core` with `onModelDefine` and `ModelDefinePluginContext`, allowing plugins to inspect columns and remap physical database column names before model metadata is finalized.

Added `createSnakeCaseNamingPlugin()` in `@qbobjx/plugins` and updated `@qbobjx/sql-engine` plus hydration flows to respect configured `dbName` mappings for compiled SQL, full-model selections, predicates, inserts, updates, and hydrated results.

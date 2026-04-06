# Complex Runtime Example

This example is an end-to-end OBJX workflow using a real SQLite database file and advanced runtime features.

## What It Demonstrates

- tenant-scoped models with `createTenantScopePlugin`
- camelCase model keys over snake_case physical columns with `createSnakeCaseNamingPlugin`
- soft delete with `createSoftDeletePlugin`
- audit events with `createAuditTrailPlugin`
- nested `insertGraph` and `upsertGraph`
- `relate` and `unrelate` on relations
- nested eager loading and composed relation expressions
- grouped `AND/OR` predicates in typed `where` clauses
- composed `joinRelated` expressions and SQL compilation
- raw SQL escape hatch through `sql`, `identifier` and `ref`
- transaction + nested transaction rollback via savepoints

## Files

- `schema.sql`: resets and creates a multi-table relational schema with snake_case columns
- `src/models.mjs`: model definitions with relations and plugins
- `src/app.mjs`: orchestrates a complex workflow and prints a summary JSON

## Run

1. Build packages so `dist` imports exist:

```bash
npm run build
```

2. Execute the example:

```bash
node examples/complex-runtime/src/app.mjs
```

The script writes `examples/complex-runtime/app.sqlite`, runs the workflow, and prints a summary payload with counts, sample hydrated graph data, and compiled join SQL. The schema keeps physical columns like `tenant_id`, `company_id`, and `project_id`, while the runtime code keeps logical keys such as `tenantId`, `companyId`, and `projectId`.

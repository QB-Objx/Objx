# OBJX Getting Started

This document covers the current happy path of the repository.

## 1. Introspect a SQLite Database

Build the workspace first:

```bash
npm run build
```

Generate an introspection snapshot from a real SQLite database:

```bash
npm run codegen -- introspect --dialect sqlite3 --database ./app.sqlite --out ./generated/schema.json
```

This uses the built-in `node:sqlite` adapter currently shipped in `@objx/codegen`.

## 2. Generate Models

Convert the introspection snapshot into OBJX models:

```bash
npm run codegen -- generate --input ./generated/schema.json --out ./generated/models
```

The generated files follow the current `defineModel` API and preserve primary keys and nullability.

## 3. Generate a Starter Template

Create a starter SQLite service:

```bash
npm run codegen -- template --template sqlite-starter --out ./starter --package-name my-objx-app
```

The template contains:

- `schema.sql`
- `src/models.mjs`
- `src/app.mjs`
- `README.md`

## 4. Runtime Capabilities Already Available

- SQL-first typed query builder
- embedded SQL compiler/engine
- official SQLite driver package
- official Postgres driver package
- `insertGraph`, `upsertGraph`, `relate`, `unrelate`
- eager loading
- `soft delete`
- `audit trail`
- `tenant scope`
- async execution context using `AsyncLocalStorage`

## 5. Current Constraint

Real database introspection is implemented for SQLite first. Other dialects are still pending.

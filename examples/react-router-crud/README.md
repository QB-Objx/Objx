# OBJX React Router CRUD Example

Simple fullstack CRUD app using React Router + `@qbobjx/fullstack`.

## What this example shows

- React Router `loader`/`action` integrated with OBJX context helpers.
- SQLite session bootstrap with `@qbobjx/sqlite-driver`.
- Simple CRUD on `projects` table:
  - list projects
  - create project
  - update status
  - delete project

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Files

- `app/lib/objx.server.ts`: session bootstrap and schema init
- `app/lib/models.ts`: OBJX model definitions
- `app/routes/projects.tsx`: loader/action + UI CRUD page
- `schema.sql`: SQLite schema

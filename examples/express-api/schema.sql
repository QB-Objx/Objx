create table if not exists projects (
  id integer primary key,
  name text not null,
  status text not null default 'planned',
  tenant_id text not null,
  deleted_at text null
);

create table if not exists tasks (
  id integer primary key,
  project_id integer not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  tenant_id text not null,
  deleted_at text null
);

create index if not exists idx_projects_tenant_status on projects (tenant_id, status);
create index if not exists idx_tasks_project_status on tasks (project_id, status);

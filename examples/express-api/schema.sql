create table if not exists projects (
  id integer primary key,
  name text not null,
  status text not null default 'planned',
  tenantId text not null,
  deletedAt text null
);

create table if not exists tasks (
  id integer primary key,
  projectId integer not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  tenantId text not null,
  deletedAt text null
);

create index if not exists idx_projects_tenant_status on projects (tenantId, status);
create index if not exists idx_tasks_project_status on tasks (projectId, status);

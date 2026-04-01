import { defineMigration } from '@qbobjx/codegen';

export default defineMigration({
  name: '000001_init',
  description: 'create projects and tasks tables',
  up: [
    `create table projects (
      id integer primary key autoincrement,
      name text not null,
      status text not null default 'planned',
      tenantId text not null,
      deletedAt text
    );`,
    `create table tasks (
      id integer primary key autoincrement,
      projectId integer not null,
      title text not null,
      status text not null default 'todo',
      tenantId text not null,
      deletedAt text,
      foreign key (projectId) references projects(id) on delete cascade
    );`,
    'create index idx_projects_tenant_id on projects(tenantId);',
    'create index idx_tasks_project_id on tasks(projectId);',
    'create index idx_tasks_tenant_id on tasks(tenantId);',
  ],
  down: [
    'drop index if exists idx_tasks_tenant_id;',
    'drop index if exists idx_tasks_project_id;',
    'drop index if exists idx_projects_tenant_id;',
    'drop table if exists tasks;',
    'drop table if exists projects;',
  ],
});

import { defineMigration } from '@qbobjx/codegen';

export default defineMigration({
  name: '000001_init',
  description: 'create projects and tasks tables',
  up: [
    `create table projects (
      id integer primary key autoincrement,
      name text not null,
      status text not null default 'planned',
      tenant_id text not null,
      deleted_at text
    );`,
    `create table tasks (
      id integer primary key autoincrement,
      project_id integer not null,
      title text not null,
      status text not null default 'todo',
      tenant_id text not null,
      deleted_at text,
      foreign key (project_id) references projects(id) on delete cascade
    );`,
    'create index idx_projects_tenant_id on projects(tenant_id);',
    'create index idx_tasks_project_id on tasks(project_id);',
    'create index idx_tasks_tenant_id on tasks(tenant_id);',
  ],
  down: [
    'drop index if exists idx_tasks_tenant_id;',
    'drop index if exists idx_tasks_project_id;',
    'drop index if exists idx_projects_tenant_id;',
    'drop table if exists tasks;',
    'drop table if exists projects;',
  ],
});

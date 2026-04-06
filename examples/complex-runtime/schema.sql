drop table if exists task_comments;
drop table if exists tasks;
drop table if exists projects;
drop table if exists users;
drop table if exists companies;

create table companies (
  id integer primary key,
  name text not null,
  tenant_id text not null
);

create table users (
  id integer primary key,
  email text not null,
  company_id integer,
  tenant_id text not null,
  deleted_at text,
  foreign key (company_id) references companies(id)
);

create table projects (
  id integer primary key,
  company_id integer not null,
  owner_id integer,
  name text not null,
  status text not null,
  tenant_id text not null,
  deleted_at text,
  foreign key (company_id) references companies(id),
  foreign key (owner_id) references users(id)
);

create table tasks (
  id integer primary key,
  project_id integer,
  assignee_id integer,
  title text not null,
  status text not null,
  tenant_id text not null,
  deleted_at text,
  foreign key (project_id) references projects(id),
  foreign key (assignee_id) references users(id)
);

create table task_comments (
  id integer primary key,
  task_id integer not null,
  author_id integer,
  body text not null,
  tenant_id text not null,
  foreign key (task_id) references tasks(id),
  foreign key (author_id) references users(id)
);

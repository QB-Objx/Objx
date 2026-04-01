drop table if exists task_comments;
drop table if exists tasks;
drop table if exists projects;
drop table if exists users;
drop table if exists companies;

create table companies (
  id integer primary key,
  name text not null,
  tenantId text not null
);

create table users (
  id integer primary key,
  email text not null,
  companyId integer,
  tenantId text not null,
  deletedAt text,
  foreign key (companyId) references companies(id)
);

create table projects (
  id integer primary key,
  companyId integer not null,
  ownerId integer,
  name text not null,
  status text not null,
  tenantId text not null,
  deletedAt text,
  foreign key (companyId) references companies(id),
  foreign key (ownerId) references users(id)
);

create table tasks (
  id integer primary key,
  projectId integer,
  assigneeId integer,
  title text not null,
  status text not null,
  tenantId text not null,
  deletedAt text,
  foreign key (projectId) references projects(id),
  foreign key (assigneeId) references users(id)
);

create table task_comments (
  id integer primary key,
  taskId integer not null,
  authorId integer,
  body text not null,
  tenantId text not null,
  foreign key (taskId) references tasks(id),
  foreign key (authorId) references users(id)
);

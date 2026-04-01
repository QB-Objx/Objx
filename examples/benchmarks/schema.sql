drop table if exists pets;
drop table if exists people;

create table people (
  id integer primary key,
  name text not null,
  active integer not null,
  createdAt text not null
);

create table pets (
  id integer primary key,
  ownerId integer not null,
  name text not null,
  status text not null,
  foreign key (ownerId) references people(id) on delete cascade
);

create index idx_people_active on people(active);
create index idx_pets_owner_id on pets(ownerId);

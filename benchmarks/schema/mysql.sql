drop table if exists pets;
drop table if exists people;

create table people (
  id int not null auto_increment primary key,
  email varchar(191) not null unique,
  name varchar(191) not null,
  active boolean not null default true,
  created_at datetime(3) not null default current_timestamp(3)
) engine=InnoDB;

create table pets (
  id int not null auto_increment primary key,
  owner_id int not null,
  name varchar(191) not null,
  species varchar(80) not null,
  adopted boolean not null default false,
  created_at datetime(3) not null default current_timestamp(3),
  constraint fk_pets_owner foreign key (owner_id) references people(id) on delete cascade,
  index idx_pets_owner_id (owner_id)
) engine=InnoDB;

create index idx_people_active on people(active);

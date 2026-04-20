create table if not exists projects (
  id integer primary key autoincrement,
  name text not null,
  status text not null default 'planned',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

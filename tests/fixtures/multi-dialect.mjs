import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const postgresConnectionString =
  process.env.OBJX_POSTGRES_URL ?? process.env.POSTGRES_DATABASE_URL;

export const mySqlConnectionString =
  process.env.OBJX_MYSQL_URL ?? process.env.MYSQL_DATABASE_URL;

export async function resetTaskTable(dialect, pool, tableName = 'task_items') {
  if (dialect === 'postgres') {
    await pool.query(`drop table if exists ${tableName}`);
    await pool.query(`
      create table ${tableName} (
        id integer generated always as identity primary key,
        title text not null,
        done boolean not null default false
      )
    `);
    return;
  }

  if (dialect === 'mysql') {
    await pool.query(`drop table if exists ${tableName}`);
    await pool.query(`
      create table ${tableName} (
        id integer not null auto_increment primary key,
        title varchar(255) not null,
        done boolean not null default false
      )
    `);
    return;
  }

  throw new Error(`Unsupported dialect "${dialect}" for resetTaskTable().`);
}

export async function cleanupCodegenTables(dialect, pool, tableName) {
  if (dialect === 'postgres') {
    await pool.query(`drop table if exists "public"."objx_seed_history"`);
    await pool.query(`drop table if exists "public"."objx_migration_history"`);
    await pool.query(`drop table if exists "public"."${tableName}"`);
    return;
  }

  if (dialect === 'mysql') {
    await pool.query('drop table if exists `objx_seed_history`');
    await pool.query('drop table if exists `objx_migration_history`');
    await pool.query(`drop table if exists \`${tableName}\``);
    return;
  }

  throw new Error(`Unsupported dialect "${dialect}" for cleanupCodegenTables().`);
}

export async function createCodegenSchemaDirectory(tempDir, dialect, tableName) {
  const migrationDir = path.join(tempDir, 'db', 'migrations');
  const seedDir = path.join(tempDir, 'db', 'seeds');

  await mkdir(migrationDir, { recursive: true });
  await mkdir(seedDir, { recursive: true });

  const migrationSql =
    dialect === 'postgres'
      ? `create table ${tableName} (
  id integer generated always as identity primary key,
  name text not null
);`
      : `create table ${tableName} (
  id integer not null auto_increment primary key,
  name varchar(255) not null
);`;

  await writeFile(
    path.join(migrationDir, '000001_init.migration.mjs'),
    `export default {
  name: '000001_init',
  up: [
    \`${migrationSql}\`,
  ],
  down: [
    'drop table if exists ${tableName};',
  ],
};
`,
    'utf8',
  );

  await writeFile(
    path.join(seedDir, '000001_projects.seed.mjs'),
    `export default {
  name: '000001_projects',
  run: [
    \`insert into ${tableName} (name) values ('Alpha');\`,
  ],
  revert: [
    "delete from ${tableName} where name = 'Alpha';",
  ],
};
`,
    'utf8',
  );

  return {
    migrationDir,
    seedDir,
  };
}

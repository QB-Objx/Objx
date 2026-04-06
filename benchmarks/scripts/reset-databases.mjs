import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
import {
  applyDefaultDatabaseEnvironment,
  parseBenchmarkArgs,
} from '../src/config.mjs';
import {
  chunkArray,
  createSeedRows,
  formatMySqlDateTime,
} from '../src/dataset.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function flattenValues(rows, mapper) {
  return rows.flatMap(mapper);
}

function createMySqlConnectionOptions(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    multipleStatements: true,
  };
}

async function seedPostgres(client, seedRows) {
  const peopleChunks = chunkArray(seedRows.people, 500);
  const petChunks = chunkArray(seedRows.pets, 1000);

  for (const chunk of peopleChunks) {
    const valuesSql = chunk
      .map((_, index) => {
        const offset = index * 5;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      })
      .join(', ');

    await client.query(
      `insert into people (id, email, name, active, created_at) values ${valuesSql}`,
      flattenValues(chunk, (row) => [row.id, row.email, row.name, row.active, row.createdAt]),
    );
  }

  for (const chunk of petChunks) {
    const valuesSql = chunk
      .map((_, index) => {
        const offset = index * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      })
      .join(', ');

    await client.query(
      `insert into pets (id, owner_id, name, species, adopted, created_at) values ${valuesSql}`,
      flattenValues(chunk, (row) => [
        row.id,
        row.ownerId,
        row.name,
        row.species,
        row.adopted,
        row.createdAt,
      ]),
    );
  }

  await client.query(
    "select setval(pg_get_serial_sequence('people', 'id'), coalesce((select max(id) from people), 1))",
  );
  await client.query(
    "select setval(pg_get_serial_sequence('pets', 'id'), coalesce((select max(id) from pets), 1))",
  );
}

async function seedMySql(connection, seedRows) {
  const peopleChunks = chunkArray(seedRows.people, 500);
  const petChunks = chunkArray(seedRows.pets, 1000);

  for (const chunk of peopleChunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
    await connection.query(
      `insert into people (id, email, name, active, created_at) values ${placeholders}`,
      flattenValues(chunk, (row) => [
        row.id,
        row.email,
        row.name,
        row.active,
        formatMySqlDateTime(row.createdAt),
      ]),
    );
  }

  for (const chunk of petChunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    await connection.query(
      `insert into pets (id, owner_id, name, species, adopted, created_at) values ${placeholders}`,
      flattenValues(chunk, (row) => [
        row.id,
        row.ownerId,
        row.name,
        row.species,
        row.adopted,
        formatMySqlDateTime(row.createdAt),
      ]),
    );
  }
}

async function main() {
  const config = parseBenchmarkArgs(process.argv.slice(2));
  applyDefaultDatabaseEnvironment(config);
  const schemaPostgres = await readFile(path.join(rootDir, 'schema', 'postgres.sql'), 'utf8');
  const schemaMySql = await readFile(path.join(rootDir, 'schema', 'mysql.sql'), 'utf8');
  const seedRows = createSeedRows(config);

  const postgres = new Client({
    connectionString: config.postgresUrl,
  });
  const mysqlConnection = await mysql.createConnection(
    createMySqlConnectionOptions(config.mysqlUrl),
  );

  try {
    await postgres.connect();

    process.stdout.write('Resetting PostgreSQL schema...\n');
    await postgres.query(schemaPostgres);
    process.stdout.write('Seeding PostgreSQL...\n');
    await seedPostgres(postgres, seedRows);

    process.stdout.write('Resetting MySQL schema...\n');
    await mysqlConnection.query(schemaMySql);
    process.stdout.write('Seeding MySQL...\n');
    await seedMySql(mysqlConnection, seedRows);

    process.stdout.write(
      `Done. Seeded ${seedRows.people.length} people and ${seedRows.pets.length} pets in each database.\n`,
    );
  } finally {
    await postgres.end().catch(() => {});
    await mysqlConnection.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

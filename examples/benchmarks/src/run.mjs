import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  identifier,
  sql,
} from '../../../packages/sql-engine/dist/index.js';
import {
  createMySqlDriver,
  createMySqlSession,
} from '../../../packages/mysql-driver/dist/index.js';
import {
  createPostgresDriver,
  createPostgresSession,
} from '../../../packages/postgres-driver/dist/index.js';
import { createSqliteSession } from '../../../packages/sqlite-driver/dist/index.js';
import { Person } from './models.mjs';

const SUPPORTED_DRIVERS = ['sqlite', 'postgres', 'mysql'];
const OPTIONAL_IDENTIFIER_QUOTE = '["`]?';

const DEFAULTS = {
  people: 3000,
  petsPerPerson: 3,
  warmup: 100,
  iterations: 1000,
  drivers: [...SUPPORTED_DRIVERS],
};

const STATUS_VALUES = ['healthy', 'needs_attention', 'adopted'];

function parseNumericArg(value, name) {
  const numeric = Number.parseInt(value, 10);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid value for "${name}": ${value}`);
  }

  return numeric;
}

function parseDriversArg(value) {
  if (!value) {
    throw new Error('Missing value for "--drivers".');
  }

  const parsed = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error('At least one driver must be provided in "--drivers".');
  }

  const drivers = [...new Set(parsed)];

  for (const driver of drivers) {
    if (!SUPPORTED_DRIVERS.includes(driver)) {
      throw new Error(
        `Unsupported driver "${driver}". Supported drivers: ${SUPPORTED_DRIVERS.join(', ')}`,
      );
    }
  }

  return drivers;
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    drivers: [...DEFAULTS.drivers],
    databasePath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--people') {
      options.people = parseNumericArg(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--pets-per-person') {
      options.petsPerPerson = parseNumericArg(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--warmup') {
      options.warmup = parseNumericArg(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--iterations') {
      options.iterations = parseNumericArg(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--database') {
      options.databasePath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--drivers') {
      options.drivers = parseDriversArg(argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function createSeedRows(config) {
  const people = [];
  const pets = [];
  const createdAt = '2026-03-31T10:00:00.000Z';
  let petId = 1;

  for (let personId = 1; personId <= config.people; personId += 1) {
    people.push({
      id: personId,
      name: `Person ${personId}`,
      active: personId % 2 === 0,
      createdAt,
    });

    for (let petIndex = 0; petIndex < config.petsPerPerson; petIndex += 1) {
      pets.push({
        id: petId,
        ownerId: personId,
        name: `Pet ${petId}`,
        status: STATUS_VALUES[petId % STATUS_VALUES.length],
      });

      petId += 1;
    }
  }

  return {
    people,
    pets,
  };
}

function seedSqliteDatabase(database, seedRows) {
  const insertPerson = database.prepare(
    'insert into people (id, name, active, createdAt) values (?, ?, ?, ?)',
  );
  const insertPet = database.prepare(
    'insert into pets (id, ownerId, name, status) values (?, ?, ?, ?)',
  );

  database.exec('begin');

  try {
    for (const person of seedRows.people) {
      insertPerson.run(
        person.id,
        person.name,
        person.active ? 1 : 0,
        person.createdAt,
      );
    }

    for (const pet of seedRows.pets) {
      insertPet.run(
        pet.id,
        pet.ownerId,
        pet.name,
        pet.status,
      );
    }

    database.exec('commit');
  } catch (error) {
    database.exec('rollback');
    throw error;
  }
}

function valuesEqual(left, right) {
  return String(left) === String(right);
}

function normalizeSql(sqlText) {
  return sqlText.trim().replace(/\s+/g, ' ');
}

function buildColumnPattern(table, column) {
  return `(?:${OPTIONAL_IDENTIFIER_QUOTE}${table}${OPTIONAL_IDENTIFIER_QUOTE}\\.)?${OPTIONAL_IDENTIFIER_QUOTE}${column}${OPTIONAL_IDENTIFIER_QUOTE}`;
}

function buildPlaceholderMap(sqlText) {
  const placeholderMap = new Map();
  let questionParamIndex = 0;

  for (const match of sqlText.matchAll(/\$\d+|\?/g)) {
    const token = match[0];
    const tokenStart = match.index ?? 0;
    const parameterIndex = token.startsWith('$')
      ? Number.parseInt(token.slice(1), 10) - 1
      : questionParamIndex++;

    placeholderMap.set(tokenStart, parameterIndex);
  }

  return placeholderMap;
}

function resolvePlaceholderValue(token, tokenStart, parameters, placeholderMap) {
  if (token.startsWith('$')) {
    const index = Number.parseInt(token.slice(1), 10) - 1;
    return parameters[index];
  }

  const parameterIndex = placeholderMap.get(tokenStart);

  if (parameterIndex === undefined) {
    return undefined;
  }

  return parameters[parameterIndex];
}

function extractEqualsValue(sqlText, table, column, parameters, placeholderMap) {
  const columnPattern = buildColumnPattern(table, column);
  const matcher = new RegExp(`${columnPattern}\\s*=\\s*(\\$\\d+|\\?)`, 'i');
  const match = matcher.exec(sqlText);

  if (!match) {
    return undefined;
  }

  const token = match[1];
  const tokenStart = (match.index ?? 0) + match[0].lastIndexOf(token);
  return resolvePlaceholderValue(token, tokenStart, parameters, placeholderMap);
}

function extractInValues(sqlText, table, column, parameters, placeholderMap) {
  const columnPattern = buildColumnPattern(table, column);
  const matcher = new RegExp(`${columnPattern}\\s+in\\s*\\(([^)]+)\\)`, 'i');
  const match = matcher.exec(sqlText);

  if (!match) {
    return undefined;
  }

  const clauseBody = match[1];
  const clauseStart = (match.index ?? 0) + match[0].indexOf(clauseBody);
  const values = [];

  for (const placeholderMatch of clauseBody.matchAll(/\$\d+|\?/g)) {
    const token = placeholderMatch[0];
    const tokenStart = clauseStart + (placeholderMatch.index ?? 0);
    const value = resolvePlaceholderValue(token, tokenStart, parameters, placeholderMap);

    if (value !== undefined) {
      values.push(value);
    }
  }

  return values;
}

function extractLimitValue(sqlText, parameters, placeholderMap) {
  const match = /\blimit\s+(\$[0-9]+|\?|[0-9]+)/i.exec(sqlText);

  if (!match) {
    return undefined;
  }

  const token = match[1];

  if (/^[0-9]+$/.test(token)) {
    return Number.parseInt(token, 10);
  }

  const tokenStart = (match.index ?? 0) + match[0].lastIndexOf(token);
  const resolved = resolvePlaceholderValue(token, tokenStart, parameters, placeholderMap);
  const numeric = Number.parseInt(String(resolved), 10);

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function extractCountAlias(sqlText) {
  const match = /count\(\*\)\s+as\s+["`]?([^"`\s]+)["`]?/i.exec(sqlText);
  return match?.[1] ?? 'count';
}

function isSelectFromTable(sqlText, table) {
  return /^select\b/i.test(sqlText) &&
    new RegExp(`\\bfrom\\s+${OPTIONAL_IDENTIFIER_QUOTE}${table}${OPTIONAL_IDENTIFIER_QUOTE}\\b`, 'i').test(sqlText);
}

function isPetCountQuery(sqlText) {
  return /^select\s+count\(\*\)/i.test(sqlText) && isSelectFromTable(sqlText, 'pets');
}

class InMemoryBenchmarkStore {
  constructor(seedRows) {
    this.people = seedRows.people.map((row) => ({ ...row }));
    this.pets = seedRows.pets.map((row) => ({ ...row }));
  }

  selectPeople(options = {}) {
    let rows = this.people;

    if (options.id !== undefined) {
      rows = rows.filter((row) => valuesEqual(row.id, options.id));
    }

    if (options.limit !== undefined) {
      rows = rows.slice(0, options.limit);
    }

    return rows.map((row) => ({ ...row }));
  }

  selectPets(options = {}) {
    let rows = this.pets;

    if (Array.isArray(options.ownerIds) && options.ownerIds.length > 0) {
      rows = rows.filter((row) =>
        options.ownerIds.some((ownerId) => valuesEqual(row.ownerId, ownerId)),
      );
    } else if (options.ownerId !== undefined) {
      rows = rows.filter((row) => valuesEqual(row.ownerId, options.ownerId));
    }

    if (options.limit !== undefined) {
      rows = rows.slice(0, options.limit);
    }

    return rows.map((row) => ({ ...row }));
  }

  countPetsByOwnerId(ownerId) {
    if (ownerId === undefined) {
      return this.pets.length;
    }

    return this.pets.filter((row) => valuesEqual(row.ownerId, ownerId)).length;
  }
}

function selectPeopleFromQuery(sqlText, parameters, store) {
  const placeholderMap = buildPlaceholderMap(sqlText);
  const id = extractEqualsValue(sqlText, 'people', 'id', parameters, placeholderMap);
  const limit = extractLimitValue(sqlText, parameters, placeholderMap);

  return store.selectPeople({
    ...(id !== undefined ? { id } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
}

function selectPetsFromQuery(sqlText, parameters, store) {
  const placeholderMap = buildPlaceholderMap(sqlText);
  const ownerIds = extractInValues(sqlText, 'pets', 'ownerId', parameters, placeholderMap);
  const ownerId = extractEqualsValue(sqlText, 'pets', 'ownerId', parameters, placeholderMap);
  const limit = extractLimitValue(sqlText, parameters, placeholderMap);

  return store.selectPets({
    ...(ownerIds && ownerIds.length > 0 ? { ownerIds } : {}),
    ...(ownerIds && ownerIds.length > 0
      ? {}
      : ownerId !== undefined
        ? { ownerId }
        : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
}

function countPetsFromQuery(sqlText, parameters, store) {
  const placeholderMap = buildPlaceholderMap(sqlText);
  const ownerId = extractEqualsValue(sqlText, 'pets', 'ownerId', parameters, placeholderMap);
  return store.countPetsByOwnerId(ownerId);
}

class BenchmarkPostgresPoolClient {
  constructor(pool) {
    this.pool = pool;
    this.released = false;
  }

  async query(sqlText, parameters = []) {
    return this.pool.query(sqlText, parameters);
  }

  release() {
    if (this.released) {
      return;
    }

    this.released = true;
    this.pool.releaseCount += 1;
  }
}

class BenchmarkPostgresPool {
  constructor(store) {
    this.store = store;
    this.connectCount = 0;
    this.releaseCount = 0;
    this.ended = false;
  }

  async query(sqlText, parameters = []) {
    const compactSql = normalizeSql(sqlText);

    if (isSelectFromTable(compactSql, 'people')) {
      const rows = selectPeopleFromQuery(compactSql, parameters, this.store);

      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
      };
    }

    if (isSelectFromTable(compactSql, 'pets') && !isPetCountQuery(compactSql)) {
      const rows = selectPetsFromQuery(compactSql, parameters, this.store);

      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
      };
    }

    if (isPetCountQuery(compactSql)) {
      const count = countPetsFromQuery(compactSql, parameters, this.store);
      const alias = extractCountAlias(compactSql);

      return {
        rows: [{ [alias]: count }],
        rowCount: 1,
        command: 'SELECT',
      };
    }

    return {
      rows: [],
      rowCount: 0,
      command: 'UNKNOWN',
    };
  }

  async connect() {
    this.connectCount += 1;
    return new BenchmarkPostgresPoolClient(this);
  }

  async end() {
    this.ended = true;
  }
}

class BenchmarkMySqlPoolConnection {
  constructor(pool) {
    this.pool = pool;
    this.released = false;
  }

  async query(sqlText, parameters = []) {
    return this.pool.query(sqlText, parameters);
  }

  release() {
    if (this.released) {
      return;
    }

    this.released = true;
    this.pool.releaseCount += 1;
  }
}

class BenchmarkMySqlPool {
  constructor(store) {
    this.store = store;
    this.connectCount = 0;
    this.releaseCount = 0;
    this.ended = false;
  }

  async query(sqlText, parameters = []) {
    const compactSql = normalizeSql(sqlText);

    if (isSelectFromTable(compactSql, 'people')) {
      const rows = selectPeopleFromQuery(compactSql, parameters, this.store);
      return [rows];
    }

    if (isSelectFromTable(compactSql, 'pets') && !isPetCountQuery(compactSql)) {
      const rows = selectPetsFromQuery(compactSql, parameters, this.store);
      return [rows];
    }

    if (isPetCountQuery(compactSql)) {
      const count = countPetsFromQuery(compactSql, parameters, this.store);
      const alias = extractCountAlias(compactSql);
      return [[{ [alias]: count }]];
    }

    return [{ affectedRows: 0 }];
  }

  async getConnection() {
    this.connectCount += 1;
    return new BenchmarkMySqlPoolConnection(this);
  }

  async end() {
    this.ended = true;
  }
}

async function runBenchmark(driver, scenario, config, task) {
  for (let index = 0; index < config.warmup; index += 1) {
    await task(index);
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const startedAt = performance.now();

  for (let index = 0; index < config.iterations; index += 1) {
    await task(index);
  }

  const durationMs = performance.now() - startedAt;
  const avgMs = durationMs / config.iterations;
  const opsPerSec = config.iterations / (durationMs / 1000);

  return {
    driver,
    scenario,
    name: `${driver}.${scenario}`,
    iterations: config.iterations,
    warmup: config.warmup,
    totalMs: Number(durationMs.toFixed(3)),
    avgMs: Number(avgMs.toFixed(6)),
    opsPerSec: Number(opsPerSec.toFixed(2)),
  };
}

function printSummary(report) {
  console.log('\nOBJX Public Benchmarks\n');
  console.log(`node: ${report.runtime.node}`);
  console.log(`platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(
    `dataset: ${report.config.people} people | ${report.config.petsPerPerson} pets/person`,
  );
  console.log(
    `runs: ${report.config.warmup} warmup + ${report.config.iterations} measured`,
  );
  console.log(`drivers: ${report.config.drivers.join(', ')}`);
  console.log('');

  for (const driver of report.config.drivers) {
    const driverResults = report.results.filter((result) => result.driver === driver);

    if (driverResults.length === 0) {
      continue;
    }

    console.log(`[${driver}]`);

    for (const result of driverResults) {
      console.log(
        `  ${result.scenario.padEnd(34)} ${result.opsPerSec
          .toString()
          .padStart(10)} ops/s | ${result.avgMs.toFixed(6)} ms/op`,
      );
    }

    console.log('');
  }

  console.log('\nJSON:\n');
  console.log(JSON.stringify(report, null, 2));
}

async function createSqliteRuntime(seedRows, schemaSql, databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(schemaSql);
  seedSqliteDatabase(database, seedRows);

  const session = createSqliteSession({
    database,
    hydrateByDefault: false,
    pragmas: ['foreign_keys = on'],
  });

  return {
    driver: 'sqlite',
    session,
    metadata: {
      adapter: 'node:sqlite',
      databasePath,
    },
    async close() {
      database.close();
    },
  };
}

function createPostgresRuntime(seedRows) {
  const store = new InMemoryBenchmarkStore(seedRows);
  const pool = new BenchmarkPostgresPool(store);
  const driver = createPostgresDriver({
    pool,
    closePoolOnDispose: true,
  });
  const session = createPostgresSession({
    driver,
    hydrateByDefault: false,
  });

  return {
    driver: 'postgres',
    session,
    metadata: {
      adapter: 'in-memory-pool',
    },
    async close() {
      await driver.close();
    },
  };
}

function createMySqlRuntime(seedRows) {
  const store = new InMemoryBenchmarkStore(seedRows);
  const pool = new BenchmarkMySqlPool(store);
  const driver = createMySqlDriver({
    pool,
    closePoolOnDispose: true,
  });
  const session = createMySqlSession({
    driver,
    hydrateByDefault: false,
  });

  return {
    driver: 'mysql',
    session,
    metadata: {
      adapter: 'in-memory-pool',
    },
    async close() {
      await driver.close();
    },
  };
}

async function runDriverBenchmarks(runtime, config, lookupIds) {
  const nextLookupId = (index) => lookupIds[index % lookupIds.length];
  const session = runtime.session;
  const driver = runtime.driver;
  const results = [];

  results.push(
    await runBenchmark(driver, 'compile.select.and-or', config, async (index) => {
      const lookupId = nextLookupId(index);

      session.compile(
        Person.query()
          .where(({ id, active, name }, operators) =>
            operators.and(
              operators.eq(active, true),
              operators.or(
                operators.eq(id, lookupId),
                operators.like(name, 'Person%'),
              ),
            ),
          )
          .orderBy(({ id }) => id)
          .limit(25),
      );
    }),
  );

  results.push(
    await runBenchmark(driver, 'compile.joinRelated', config, async () => {
      session.compile(
        Person.query().joinRelated({
          pets: true,
        }),
      );
    }),
  );

  results.push(
    await runBenchmark(driver, 'execute.select.hydrated', config, async (index) => {
      const lookupId = nextLookupId(index);

      await session.execute(
        Person.query()
          .where(({ id }, operators) => operators.eq(id, lookupId))
          .limit(1),
        {
          hydrate: true,
        },
      );
    }),
  );

  results.push(
    await runBenchmark(driver, 'execute.withRelated.hydrated', config, async (index) => {
      const lookupId = nextLookupId(index);

      await session.execute(
        Person.query()
          .where(({ id }, operators) => operators.eq(id, lookupId))
          .withRelated('pets'),
        {
          hydrate: true,
        },
      );
    }),
  );

  results.push(
    await runBenchmark(driver, 'execute.raw.pet-count', config, async (index) => {
      const lookupId = nextLookupId(index);

      await session.execute(
        sql`select count(*) as ${identifier('petCount')} from ${identifier('pets')} where ${identifier('pets', 'ownerId')} = ${lookupId}`,
      );
    }),
  );

  return results;
}

const run = async () => {
  const config = parseArgs(process.argv.slice(2));
  const exampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const schemaPath = path.join(exampleDir, 'schema.sql');
  const databasePath =
    config.databasePath ?? path.join(exampleDir, 'benchmark.sqlite');
  const schemaSql = await readFile(schemaPath, 'utf8');
  const seedRows = createSeedRows(config);
  const runtimes = [];

  try {
    for (const driver of config.drivers) {
      if (driver === 'sqlite') {
        runtimes.push(
          await createSqliteRuntime(seedRows, schemaSql, databasePath),
        );
        continue;
      }

      if (driver === 'postgres') {
        runtimes.push(createPostgresRuntime(seedRows));
        continue;
      }

      if (driver === 'mysql') {
        runtimes.push(createMySqlRuntime(seedRows));
      }
    }

    const lookupIds = Array.from(
      { length: config.iterations },
      (_, index) => (index % config.people) + 1,
    );
    const results = [];

    for (const runtime of runtimes) {
      const runtimeResults = await runDriverBenchmarks(runtime, config, lookupIds);
      results.push(...runtimeResults);
    }

    const runtimeMetadata = Object.fromEntries(
      runtimes.map((runtime) => [runtime.driver, runtime.metadata]),
    );

    const report = {
      generatedAt: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      config: {
        people: config.people,
        petsPerPerson: config.petsPerPerson,
        warmup: config.warmup,
        iterations: config.iterations,
        drivers: config.drivers,
        sqliteDatabasePath: config.drivers.includes('sqlite') ? databasePath : undefined,
      },
      drivers: runtimeMetadata,
      results,
    };

    printSummary(report);
  } finally {
    for (let index = runtimes.length - 1; index >= 0; index -= 1) {
      await runtimes[index].close();
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

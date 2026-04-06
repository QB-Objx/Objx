export const SUPPORTED_DIALECTS = ['postgres', 'mysql'];
export const SUPPORTED_ORMS = ['objx', 'prisma', 'sequelize', 'knex'];

export const DEFAULTS = {
  people: 3000,
  petsPerPerson: 3,
  warmup: 50,
  iterations: 250,
  pageSize: 25,
  dialects: [...SUPPORTED_DIALECTS],
  orms: [...SUPPORTED_ORMS],
  postgresUrl: process.env.POSTGRES_DATABASE_URL ?? 'postgresql://objx:objx@127.0.0.1:5432/objx_bench',
  mysqlUrl: process.env.MYSQL_DATABASE_URL ?? 'mysql://objx:objx@127.0.0.1:3306/objx_bench',
  outputPath: 'out/latest.json',
};

export function applyDefaultDatabaseEnvironment(config) {
  process.env.POSTGRES_DATABASE_URL ??= config.postgresUrl;
  process.env.MYSQL_DATABASE_URL ??= config.mysqlUrl;
}

function parsePositiveInteger(value, flagName) {
  const numeric = Number.parseInt(value, 10);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid numeric value for "${flagName}": ${value}`);
  }

  return numeric;
}

function parseList(value, supported, flagName) {
  const parsed = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error(`At least one value must be provided to "${flagName}".`);
  }

  const unique = [...new Set(parsed)];

  for (const entry of unique) {
    if (!supported.includes(entry)) {
      throw new Error(
        `Unsupported value "${entry}" for "${flagName}". Supported: ${supported.join(', ')}`,
      );
    }
  }

  return unique;
}

export function parseBenchmarkArgs(argv) {
  const options = {
    ...DEFAULTS,
    dialects: [...DEFAULTS.dialects],
    orms: [...DEFAULTS.orms],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--people') {
      options.people = parsePositiveInteger(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--pets-per-person') {
      options.petsPerPerson = parsePositiveInteger(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--warmup') {
      options.warmup = parsePositiveInteger(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--iterations') {
      options.iterations = parsePositiveInteger(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--page-size') {
      options.pageSize = parsePositiveInteger(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === '--dialects') {
      options.dialects = parseList(argv[index + 1], SUPPORTED_DIALECTS, token);
      index += 1;
      continue;
    }

    if (token === '--orms') {
      options.orms = parseList(argv[index + 1], SUPPORTED_ORMS, token);
      index += 1;
      continue;
    }

    if (token === '--output') {
      options.outputPath = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

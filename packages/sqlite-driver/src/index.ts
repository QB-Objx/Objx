import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  createObjxSqlCompiler,
  createSession,
  type CompiledQuery,
  type ObjxSession,
  type ObjxSessionOptions,
  type SqlExecutionRequest,
  type SqlDriver,
} from '@objx/sql-engine';

export interface ObjxSqliteTransaction {
  readonly kind: 'objx:sqlite-transaction';
  readonly database: DatabaseSync;
  readonly depth: number;
  readonly savepointName?: string;
}

export interface CreateSqliteDriverOptions {
  readonly database?: DatabaseSync;
  readonly databasePath?: string;
  readonly pragmas?: readonly string[];
}

export interface ObjxSqliteDriver extends SqlDriver<ObjxSqliteTransaction> {
  readonly database: DatabaseSync;
  close(): void;
}

export interface CreateSqliteSessionOptions
  extends Omit<ObjxSessionOptions<ObjxSqliteTransaction>, 'driver' | 'compiler'>,
    CreateSqliteDriverOptions {
  readonly driver?: ObjxSqliteDriver;
  readonly compiler?: ObjxSessionOptions<ObjxSqliteTransaction>['compiler'];
}

interface SqliteStatementResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly lastInsertRowid?: number | bigint;
}

function isSqliteTransaction(value: unknown): value is ObjxSqliteTransaction {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'objx:sqlite-transaction' &&
    'database' in value &&
    value.database instanceof DatabaseSync
  );
}

function quoteSavepoint(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function serializeSqliteParameter(value: unknown): SQLInputValue {
  if (value === null) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(value);
  }

  if (value === undefined) {
    throw new TypeError('Undefined cannot be bound to a SQLite parameter.');
  }

  throw new TypeError(`Unsupported SQLite parameter type: ${typeof value}.`);
}

function extractSqlParameters(compiledQuery: CompiledQuery): readonly SQLInputValue[] {
  return compiledQuery.parameters.map((parameter) => serializeSqliteParameter(parameter.value));
}

function shouldReturnRows(compiledQuery: CompiledQuery): boolean {
  const queryKind = compiledQuery.metadata.queryKind;
  const normalizedSql = compiledQuery.sql.trim().toLowerCase();

  if (queryKind === 'select') {
    return true;
  }

  if (/\breturning\b/i.test(normalizedSql)) {
    return true;
  }

  if (/^(select|pragma|explain|values)\b/.test(normalizedSql)) {
    return true;
  }

  if (/^with\b/.test(normalizedSql)) {
    return !/\b(insert|update|delete|replace)\b/.test(normalizedSql);
  }

  return false;
}

function executeStatement(
  database: DatabaseSync,
  compiledQuery: CompiledQuery,
): SqliteStatementResult {
  const statement = database.prepare(compiledQuery.sql);
  const parameters = extractSqlParameters(compiledQuery);

  if (shouldReturnRows(compiledQuery)) {
    const rows = statement.all(...parameters) as readonly Record<string, unknown>[];

    return {
      rows,
      rowCount: rows.length,
    };
  }

  const result = statement.run(...parameters);
  const response: {
    rows: readonly Record<string, unknown>[];
    rowCount: number;
    lastInsertRowid?: number | bigint;
  } = {
    rows: [],
    rowCount: Number(result.changes ?? 0),
  };

  if (result.lastInsertRowid !== undefined) {
    response.lastInsertRowid = result.lastInsertRowid;
  }

  return response;
}

export function createSqliteDriver(
  options: CreateSqliteDriverOptions = {},
): ObjxSqliteDriver {
  const database = options.database ?? new DatabaseSync(options.databasePath ?? ':memory:');
  const ownsDatabase = options.database === undefined;
  let transactionCounter = 0;

  for (const pragma of options.pragmas ?? []) {
    database.exec(`pragma ${pragma}`);
  }

  return {
    database,
    async execute<TResult = unknown>(
      compiledQuery: CompiledQuery,
      request?: SqlExecutionRequest<ObjxSqliteTransaction>,
    ) {
      const transaction = request?.transaction;

      if (transaction && transaction.database !== database) {
        throw new Error('SQLite transaction belongs to a different database instance.');
      }

      return executeStatement(database, compiledQuery) as TResult;
    },
    async transaction(callback, request) {
      const parentRaw = request?.executionContext?.transaction?.raw;
      const parentTransaction =
        isSqliteTransaction(parentRaw) && parentRaw.database === database
          ? parentRaw
          : undefined;

      if (parentTransaction) {
        const savepointName = `objx_sp_${++transactionCounter}`;
        database.exec(`savepoint ${quoteSavepoint(savepointName)}`);

        try {
          const result = await callback({
            kind: 'objx:sqlite-transaction',
            database,
            depth: parentTransaction.depth + 1,
            savepointName,
          });
          database.exec(`release savepoint ${quoteSavepoint(savepointName)}`);
          return result;
        } catch (error) {
          database.exec(`rollback to savepoint ${quoteSavepoint(savepointName)}`);
          database.exec(`release savepoint ${quoteSavepoint(savepointName)}`);
          throw error;
        }
      }

      database.exec('begin');

      try {
        const result = await callback({
          kind: 'objx:sqlite-transaction',
          database,
          depth: 0,
        });
        database.exec('commit');
        return result;
      } catch (error) {
        database.exec('rollback');
        throw error;
      }
    },
    close() {
      if (ownsDatabase) {
        database.close();
      }
    },
  };
}

export function createSqliteSession(
  options: CreateSqliteSessionOptions = {},
): ObjxSession<ObjxSqliteTransaction> {
  const driver = options.driver ?? createSqliteDriver(options);
  const sessionOptions = {
    driver,
    compiler: options.compiler ?? createObjxSqlCompiler({ dialect: 'sqlite3' }),
    ...(options.executionContextManager
      ? { executionContextManager: options.executionContextManager }
      : {}),
    ...(options.observers ? { observers: options.observers } : {}),
    ...(options.plugins ? { plugins: options.plugins } : {}),
    ...(options.resultNormalizer ? { resultNormalizer: options.resultNormalizer } : {}),
    ...(options.hydrateByDefault !== undefined
      ? { hydrateByDefault: options.hydrateByDefault }
      : {}),
  };

  return createSession(sessionOptions);
}

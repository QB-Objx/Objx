import {
  createObjxSqlCompiler,
  createSession,
  type CompiledQuery,
  type ObjxSession,
  type ObjxSessionOptions,
  type SqlExecutionRequest,
  type SqlDriver,
  type SqlTransactionRequest,
} from '@objx/sql-engine';

export type MySqlQueryResultRow = Record<string, unknown>;

interface MySqlOkPacketLike {
  readonly affectedRows?: number;
  readonly changedRows?: number;
  readonly insertId?: number | bigint;
  readonly warningStatus?: number;
}

export interface MySqlQueryResult<
  TRow extends MySqlQueryResultRow = MySqlQueryResultRow,
> {
  readonly rows: readonly TRow[];
  readonly rowCount: number;
  readonly insertId?: number | bigint;
  readonly warningStatus?: number;
  readonly command?: string;
  readonly raw: unknown;
}

export interface MySqlQueryExecutor {
  query(sqlText: string, parameters?: readonly unknown[]): Promise<unknown>;
}

export interface MySqlPoolConnection extends MySqlQueryExecutor {
  release(): void;
}

export interface MySqlPool extends MySqlQueryExecutor {
  getConnection(): Promise<MySqlPoolConnection>;
  end?(): Promise<void>;
}

export interface ObjxMySqlTransaction {
  readonly kind: 'objx:mysql-transaction';
  readonly client: MySqlQueryExecutor;
  readonly depth: number;
  readonly savepointName?: string;
}

interface InternalMySqlTransaction extends ObjxMySqlTransaction {
  readonly driverToken: object;
}

export interface CreateMySqlDriverOptions {
  readonly pool?: MySqlPool;
  readonly client?: MySqlQueryExecutor;
  readonly closePoolOnDispose?: boolean;
}

export interface ObjxMySqlDriver extends SqlDriver<ObjxMySqlTransaction> {
  readonly pool?: MySqlPool;
  readonly client: MySqlQueryExecutor;
  close(): Promise<void>;
}

export interface CreateMySqlSessionOptions
  extends Omit<ObjxSessionOptions<ObjxMySqlTransaction>, 'driver' | 'compiler'>,
    CreateMySqlDriverOptions {
  readonly driver?: ObjxMySqlDriver;
  readonly compiler?: ObjxSessionOptions<ObjxMySqlTransaction>['compiler'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMySqlQueryExecutor(value: unknown): value is MySqlQueryExecutor {
  return isRecord(value) && 'query' in value && typeof value.query === 'function';
}

function isInternalMySqlTransaction(
  value: unknown,
  driverToken: object,
): value is InternalMySqlTransaction {
  return (
    isRecord(value) &&
    value.kind === 'objx:mysql-transaction' &&
    value.driverToken === driverToken &&
    'client' in value &&
    isMySqlQueryExecutor(value.client) &&
    'depth' in value &&
    typeof value.depth === 'number'
  );
}

function isMySqlOkPacketLike(value: unknown): value is MySqlOkPacketLike {
  return (
    isRecord(value) &&
    ('affectedRows' in value ||
      'changedRows' in value ||
      'insertId' in value ||
      'warningStatus' in value)
  );
}

function isRowArray(value: unknown): value is readonly MySqlQueryResultRow[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function quoteIdentifier(name: string): string {
  return `\`${name.replaceAll('`', '``')}\``;
}

function serializeMySqlParameter(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError('Undefined cannot be bound to a MySQL parameter.');
  }

  if (value instanceof Uint8Array && !(value instanceof Buffer)) {
    return Buffer.from(value);
  }

  return value;
}

function extractSqlParameters(compiledQuery: CompiledQuery): readonly unknown[] {
  return compiledQuery.parameters.map((parameter) => serializeMySqlParameter(parameter.value));
}

function normalizeMySqlQueryResult(raw: unknown): MySqlQueryResult {
  if (isRecord(raw) && 'rows' in raw && Array.isArray(raw.rows)) {
    const rows = isRowArray(raw.rows) ? raw.rows : [];
    const response: {
      rows: readonly MySqlQueryResultRow[];
      rowCount: number;
      insertId?: number | bigint;
      warningStatus?: number;
      command?: string;
      raw: unknown;
    } = {
      rows,
      rowCount: typeof raw.rowCount === 'number' ? raw.rowCount : rows.length,
      raw,
    };

    if (typeof raw.insertId === 'number' || typeof raw.insertId === 'bigint') {
      response.insertId = raw.insertId;
    }

    if (typeof raw.warningStatus === 'number') {
      response.warningStatus = raw.warningStatus;
    }

    if (typeof raw.command === 'string') {
      response.command = raw.command;
    }

    return response;
  }

  if (isRowArray(raw)) {
    return {
      rows: raw,
      rowCount: raw.length,
      raw,
    };
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return {
        rows: [],
        rowCount: 0,
        raw,
      };
    }

    const [first] = raw;

    if (isRowArray(first)) {
      return {
        rows: first,
        rowCount: first.length,
        raw,
      };
    }

    if (isMySqlOkPacketLike(first)) {
      const response: {
        rows: readonly MySqlQueryResultRow[];
        rowCount: number;
        insertId?: number | bigint;
        warningStatus?: number;
        raw: unknown;
      } = {
        rows: [],
        rowCount: Number(first.affectedRows ?? first.changedRows ?? 0),
        raw,
      };

      if (typeof first.insertId === 'number' || typeof first.insertId === 'bigint') {
        response.insertId = first.insertId;
      }

      if (typeof first.warningStatus === 'number') {
        response.warningStatus = first.warningStatus;
      }

      return response;
    }
  }

  if (isMySqlOkPacketLike(raw)) {
    const response: {
      rows: readonly MySqlQueryResultRow[];
      rowCount: number;
      insertId?: number | bigint;
      warningStatus?: number;
      raw: unknown;
    } = {
      rows: [],
      rowCount: Number(raw.affectedRows ?? raw.changedRows ?? 0),
      raw,
    };

    if (typeof raw.insertId === 'number' || typeof raw.insertId === 'bigint') {
      response.insertId = raw.insertId;
    }

    if (typeof raw.warningStatus === 'number') {
      response.warningStatus = raw.warningStatus;
    }

    return response;
  }

  throw new TypeError('Unsupported MySQL query result shape returned by query executor.');
}

function createTransaction(
  client: MySqlQueryExecutor,
  depth: number,
  driverToken: object,
  savepointName?: string,
): InternalMySqlTransaction {
  const transaction: {
    kind: 'objx:mysql-transaction';
    client: MySqlQueryExecutor;
    depth: number;
    driverToken: object;
    savepointName?: string;
  } = {
    kind: 'objx:mysql-transaction',
    client,
    depth,
    driverToken,
  };

  if (savepointName) {
    transaction.savepointName = savepointName;
  }

  return transaction;
}

async function runQuery(
  client: MySqlQueryExecutor,
  compiledQuery: CompiledQuery,
): Promise<MySqlQueryResult> {
  const raw = await client.query(compiledQuery.sql, extractSqlParameters(compiledQuery));
  return normalizeMySqlQueryResult(raw);
}

export function createMySqlDriver(
  options: CreateMySqlDriverOptions = {},
): ObjxMySqlDriver {
  if (options.pool && options.client) {
    throw new Error('Provide either "pool" or "client", but not both.');
  }

  const pool = options.pool;
  const baseClient = pool ?? options.client;
  const closePoolOnDispose = options.closePoolOnDispose ?? false;

  if (!baseClient) {
    throw new Error('MySQL driver requires a "pool" or "client" query executor.');
  }

  let transactionCounter = 0;
  const driverToken = {};

  return {
    ...(pool ? { pool } : {}),
    client: baseClient,
    async execute<TResult = unknown>(
      compiledQuery: CompiledQuery,
      request?: SqlExecutionRequest<ObjxMySqlTransaction>,
    ) {
      const transaction = request?.transaction;

      if (transaction !== undefined) {
        if (!isInternalMySqlTransaction(transaction, driverToken)) {
          throw new Error(
            'MySQL transaction belongs to a different driver instance.',
          );
        }

        return runQuery(transaction.client, compiledQuery) as TResult;
      }

      return runQuery(baseClient, compiledQuery) as TResult;
    },
    async transaction<TResult>(
      callback: (transaction: ObjxMySqlTransaction) => Promise<TResult>,
      request?: SqlTransactionRequest,
    ): Promise<TResult> {
      const parentRaw = request?.executionContext?.transaction?.raw;
      const parentTransaction = isInternalMySqlTransaction(parentRaw, driverToken)
        ? parentRaw
        : undefined;

      if (parentTransaction) {
        const savepointName = `objx_sp_${++transactionCounter}`;

        await parentTransaction.client.query(
          `savepoint ${quoteIdentifier(savepointName)}`,
        );

        try {
          const result = await callback(
            createTransaction(
              parentTransaction.client,
              parentTransaction.depth + 1,
              driverToken,
              savepointName,
            ),
          );
          await parentTransaction.client.query(
            `release savepoint ${quoteIdentifier(savepointName)}`,
          );
          return result;
        } catch (error) {
          try {
            await parentTransaction.client.query(
              `rollback to savepoint ${quoteIdentifier(savepointName)}`,
            );
            await parentTransaction.client.query(
              `release savepoint ${quoteIdentifier(savepointName)}`,
            );
          } catch {
            // Keep the original failure as the primary error.
          }

          throw error;
        }
      }

      const runRootTransaction = async (
        client: MySqlQueryExecutor,
      ): Promise<TResult> => {
        await client.query('start transaction');

        try {
          const result = await callback(createTransaction(client, 0, driverToken));
          await client.query('commit');
          return result;
        } catch (error) {
          try {
            await client.query('rollback');
          } catch {
            // Keep the original failure as the primary error.
          }

          throw error;
        }
      };

      if (pool) {
        const transactionClient = await pool.getConnection();

        try {
          return runRootTransaction(transactionClient);
        } finally {
          transactionClient.release();
        }
      }

      return runRootTransaction(baseClient);
    },
    async close() {
      if (closePoolOnDispose && pool && typeof pool.end === 'function') {
        await pool.end();
      }
    },
  };
}

export function createMySqlSession(
  options: CreateMySqlSessionOptions = {},
): ObjxSession<ObjxMySqlTransaction> {
  const driver = options.driver ?? createMySqlDriver(options);
  const sessionOptions = {
    driver,
    compiler: options.compiler ?? createObjxSqlCompiler({ dialect: 'mysql' }),
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

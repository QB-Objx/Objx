import {
  createObjxSqlCompiler,
  createSession,
  type CompiledQuery,
  type ObjxSession,
  type ObjxSessionOptions,
  type SqlExecutionRequest,
  type SqlDriver,
  type SqlTransactionRequest,
} from '@qbobjx/sql-engine';

export type PostgresQueryResultRow = Record<string, unknown>;

export interface PostgresQueryResult<
  TRow extends PostgresQueryResultRow = PostgresQueryResultRow,
> {
  readonly rows: readonly TRow[];
  readonly rowCount: number | null;
  readonly command?: string;
}

export interface PostgresQueryExecutor {
  query(
    sqlText: string,
    parameters?: readonly unknown[],
  ): Promise<PostgresQueryResult>;
}

export interface PostgresPoolClient extends PostgresQueryExecutor {
  release(error?: Error | boolean): void;
}

export interface PostgresPool extends PostgresQueryExecutor {
  connect(): Promise<PostgresPoolClient>;
  end?(): Promise<void>;
}

export interface ObjxPostgresTransaction {
  readonly kind: 'objx:postgres-transaction';
  readonly client: PostgresQueryExecutor;
  readonly depth: number;
  readonly savepointName?: string;
}

interface InternalPostgresTransaction extends ObjxPostgresTransaction {
  readonly driverToken: object;
}

export interface CreatePostgresDriverOptions {
  readonly pool?: PostgresPool;
  readonly client?: PostgresQueryExecutor;
  readonly closePoolOnDispose?: boolean;
}

export interface ObjxPostgresDriver extends SqlDriver<ObjxPostgresTransaction> {
  readonly pool?: PostgresPool;
  readonly client: PostgresQueryExecutor;
  close(): Promise<void>;
}

export interface CreatePostgresSessionOptions
  extends Omit<ObjxSessionOptions<ObjxPostgresTransaction>, 'driver' | 'compiler'>,
    CreatePostgresDriverOptions {
  readonly driver?: ObjxPostgresDriver;
  readonly compiler?: ObjxSessionOptions<ObjxPostgresTransaction>['compiler'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPostgresQueryExecutor(value: unknown): value is PostgresQueryExecutor {
  return isRecord(value) && 'query' in value && typeof value.query === 'function';
}

function isInternalPostgresTransaction(
  value: unknown,
  driverToken: object,
): value is InternalPostgresTransaction {
  return (
    isRecord(value) &&
    value.kind === 'objx:postgres-transaction' &&
    value.driverToken === driverToken &&
    'client' in value &&
    isPostgresQueryExecutor(value.client) &&
    'depth' in value &&
    typeof value.depth === 'number'
  );
}

function quoteSavepoint(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function serializePostgresParameter(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError('Undefined cannot be bound to a PostgreSQL parameter.');
  }

  if (value instanceof Uint8Array && !(value instanceof Buffer)) {
    return Buffer.from(value);
  }

  return value;
}

function extractSqlParameters(compiledQuery: CompiledQuery): readonly unknown[] {
  return compiledQuery.parameters.map((parameter) => serializePostgresParameter(parameter.value));
}

function createTransaction(
  client: PostgresQueryExecutor,
  depth: number,
  driverToken: object,
  savepointName?: string,
): InternalPostgresTransaction {
  const transaction: {
    kind: 'objx:postgres-transaction';
    client: PostgresQueryExecutor;
    depth: number;
    driverToken: object;
    savepointName?: string;
  } = {
    kind: 'objx:postgres-transaction',
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
  client: PostgresQueryExecutor,
  compiledQuery: CompiledQuery,
): Promise<PostgresQueryResult> {
  return client.query(compiledQuery.sql, extractSqlParameters(compiledQuery));
}

export function createPostgresDriver(
  options: CreatePostgresDriverOptions = {},
): ObjxPostgresDriver {
  if (options.pool && options.client) {
    throw new Error('Provide either "pool" or "client", but not both.');
  }

  const pool = options.pool;
  const baseClient = pool ?? options.client;
  const closePoolOnDispose = options.closePoolOnDispose ?? false;

  if (!baseClient) {
    throw new Error(
      'Postgres driver requires a "pool" or "client" query executor.',
    );
  }

  let transactionCounter = 0;
  const driverToken = {};

  return {
    ...(pool ? { pool } : {}),
    client: baseClient,
    async execute<TResult = unknown>(
      compiledQuery: CompiledQuery,
      request?: SqlExecutionRequest<ObjxPostgresTransaction>,
    ) {
      const transaction = request?.transaction;

      if (transaction !== undefined) {
        if (!isInternalPostgresTransaction(transaction, driverToken)) {
          throw new Error(
            'Postgres transaction belongs to a different driver instance.',
          );
        }

        return runQuery(transaction.client, compiledQuery) as TResult;
      }

      return runQuery(baseClient, compiledQuery) as TResult;
    },
    async transaction<TResult>(
      callback: (transaction: ObjxPostgresTransaction) => Promise<TResult>,
      request?: SqlTransactionRequest,
    ): Promise<TResult> {
      const parentRaw = request?.executionContext?.transaction?.raw;
      const parentTransaction = isInternalPostgresTransaction(parentRaw, driverToken)
        ? parentRaw
        : undefined;

      if (parentTransaction) {
        const savepointName = `objx_sp_${++transactionCounter}`;

        await parentTransaction.client.query(
          `savepoint ${quoteSavepoint(savepointName)}`,
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
            `release savepoint ${quoteSavepoint(savepointName)}`,
          );
          return result;
        } catch (error) {
          try {
            await parentTransaction.client.query(
              `rollback to savepoint ${quoteSavepoint(savepointName)}`,
            );
            await parentTransaction.client.query(
              `release savepoint ${quoteSavepoint(savepointName)}`,
            );
          } catch {
            // Keep the original failure as the primary error.
          }

          throw error;
        }
      }

      const runRootTransaction = async (
        client: PostgresQueryExecutor,
      ): Promise<TResult> => {
        await client.query('begin');

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
        const transactionClient = await pool.connect();

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

export function createPostgresSession(
  options: CreatePostgresSessionOptions = {},
): ObjxSession<ObjxPostgresTransaction> {
  const driver = options.driver ?? createPostgresDriver(options);
  const sessionOptions = {
    driver,
    compiler: options.compiler ?? createObjxSqlCompiler({ dialect: 'postgres' }),
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

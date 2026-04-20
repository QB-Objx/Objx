import type { ExecutionContextManager } from '@qbobjx/core';
import { ObjxValidationError } from '@qbobjx/validation';

type MaybePromise<TValue> = TValue | Promise<TValue>;

export type InferObjxSession<TValue> =
  TValue extends ObjxSessionHost<infer TSession>
    ? TSession
    : TValue extends PromiseLike<infer TResolved>
      ? InferObjxSession<TResolved>
      : TValue extends (...args: readonly unknown[]) => infer TReturn
        ? InferObjxSession<TReturn>
        : never;

export interface ObjxSessionLike {
  readonly executionContextManager: ExecutionContextManager;
}

export interface ObjxTransactionalSession extends ObjxSessionLike {
  transaction<TResult>(callback: () => MaybePromise<TResult>): MaybePromise<TResult>;
}

export type ObjxHeaderBag =
  | Headers
  | Record<string, string | readonly string[] | undefined>
  | {
      get(name: string): string | null;
    };

export interface ObjxRequestLike {
  readonly headers?: ObjxHeaderBag;
  readonly method?: string;
  readonly url?: string;
}

export interface ObjxRequestContextOptions {
  readonly enabled?: boolean;
  readonly tenantHeader?: string;
  readonly actorHeader?: string;
  readonly requestIdHeader?: string;
  readonly includeRequestMetadata?: boolean;
  readonly staticValues?: Readonly<Record<string, unknown>>;
  readonly resolveValues?: (
    request: ObjxRequestLike,
  ) => MaybePromise<Readonly<Record<string, unknown>>>;
}

export interface ObjxValidationResponseBody {
  readonly error: 'objx_validation_failed';
  readonly message: string;
  readonly adapter?: string | undefined;
  readonly modelName?: string | undefined;
  readonly tableName?: string | undefined;
  readonly operation?: string | undefined;
  readonly issues: readonly unknown[];
}

export interface ObjxErrorResponseOptions {
  readonly validationStatus?: number;
  readonly contentType?: string;
  readonly headers?: HeadersInit;
}

export interface ObjxActionExecutionOptions {
  readonly useTransaction?: boolean;
}

export interface ObjxHandlerArgs {
  readonly request: ObjxRequestLike;
}

export type ObjxHandler<TArgs extends ObjxHandlerArgs, TResult, TSession extends ObjxSessionLike> = (
  args: TArgs,
  session: TSession,
) => MaybePromise<TResult>;

export class ObjxSessionHost<TSession extends ObjxSessionLike = ObjxSessionLike> {
  constructor(readonly session: TSession) {}

  currentExecutionContext() {
    return this.session.executionContextManager.current();
  }
}

function isHeaderReader(value: ObjxHeaderBag): value is { get(name: string): string | null } {
  return typeof value === 'object' && value !== null && 'get' in value;
}

function readHeaderValue(headers: ObjxHeaderBag | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (isHeaderReader(headers)) {
    const value = headers.get(name);
    return value ?? undefined;
  }

  const lowered = name.toLowerCase();

  for (const [headerName, rawValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== lowered) {
      continue;
    }

    if (typeof rawValue === 'string') {
      return rawValue;
    }

    if (Array.isArray(rawValue)) {
      return rawValue[0];
    }

    return undefined;
  }

  return undefined;
}

export async function createObjxRequestContext(
  request: ObjxRequestLike,
  options: ObjxRequestContextOptions = {},
): Promise<Readonly<Record<string, unknown>>> {
  const values: Record<string, unknown> = {
    ...(options.staticValues ?? {}),
  };

  const tenantId = readHeaderValue(request.headers, options.tenantHeader ?? 'x-tenant-id');
  const actorId = readHeaderValue(request.headers, options.actorHeader ?? 'x-actor-id');
  const requestId = readHeaderValue(request.headers, options.requestIdHeader ?? 'x-request-id');

  if (tenantId) {
    values.tenantId = tenantId;
  }

  if (actorId) {
    values.actorId = actorId;
  }

  if (requestId) {
    values.requestId = requestId;
  }

  if (options.includeRequestMetadata !== false) {
    if (request.method) {
      values.requestMethod = request.method;
    }

    if (request.url) {
      values.requestPath = request.url;
    }
  }

  if (!options.resolveValues) {
    return values;
  }

  return {
    ...values,
    ...(await options.resolveValues(request)),
  };
}

export async function withObjxContext<TResult>(
  session: ObjxSessionLike,
  request: ObjxRequestLike,
  callback: () => MaybePromise<TResult>,
  options: ObjxRequestContextOptions = {},
): Promise<TResult> {
  if (options.enabled === false) {
    return callback();
  }

  const values = await createObjxRequestContext(request, options);

  return session.executionContextManager.run(
    {
      values,
    },
    callback,
  );
}

function createJsonResponse(body: unknown, status: number, options: ObjxErrorResponseOptions): Response {
  const headers = new Headers(options.headers);

  if (!headers.has('content-type')) {
    headers.set('content-type', options.contentType ?? 'application/json; charset=utf-8');
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export function mapObjxErrorToResponse(
  error: unknown,
  options: ObjxErrorResponseOptions = {},
): Response | undefined {
  if (!(error instanceof ObjxValidationError)) {
    return undefined;
  }

  const body: ObjxValidationResponseBody = {
    error: 'objx_validation_failed',
    message: error.message,
    issues: error.issues,
    ...(error.adapterName ? { adapter: error.adapterName } : {}),
    ...(error.modelName ? { modelName: error.modelName } : {}),
    ...(error.tableName ? { tableName: error.tableName } : {}),
    ...(error.operation ? { operation: error.operation } : {}),
  };

  return createJsonResponse(body, options.validationStatus ?? 422, options);
}

function isTransactionalSession(session: ObjxSessionLike): session is ObjxTransactionalSession {
  return 'transaction' in session && typeof session.transaction === 'function';
}

export async function runObjxAction<TResult>(
  session: ObjxSessionLike,
  request: ObjxRequestLike,
  callback: () => MaybePromise<TResult>,
  options: {
    readonly requestContext?: ObjxRequestContextOptions;
    readonly execution?: ObjxActionExecutionOptions;
  } = {},
): Promise<TResult> {
  const { requestContext, execution } = options;

  return withObjxContext(
    session,
    request,
    () => {
      if (execution?.useTransaction === false || !isTransactionalSession(session)) {
        return callback();
      }

      return session.transaction(callback);
    },
    requestContext,
  );
}

export function defineObjxLoader<TArgs extends ObjxHandlerArgs, TResult, TSession extends ObjxSessionLike>(
  session: TSession,
  handler: ObjxHandler<TArgs, TResult, TSession>,
  requestContext?: ObjxRequestContextOptions,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) => withObjxContext(session, args.request, () => handler(args, session), requestContext);
}

export function defineObjxAction<TArgs extends ObjxHandlerArgs, TResult, TSession extends ObjxSessionLike>(
  session: TSession,
  handler: ObjxHandler<TArgs, TResult, TSession>,
  options: {
    readonly requestContext?: ObjxRequestContextOptions;
    readonly execution?: ObjxActionExecutionOptions;
  } = {},
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) =>
    runObjxAction(
      session,
      args.request,
      () => handler(args, session),
      {
        ...(options.requestContext ? { requestContext: options.requestContext } : {}),
        ...(options.execution ? { execution: options.execution } : {}),
      },
    );
}

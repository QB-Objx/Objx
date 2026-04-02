import {
  Catch,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  type ArgumentsHost,
  type CallHandler,
  type DynamicModule,
  type ExecutionContext,
  type ExceptionFilter,
  type InjectionToken,
  type ModuleMetadata,
  type NestInterceptor,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { ExecutionContextManager } from '@qbobjx/core';
import { ObjxValidationError } from '@qbobjx/validation';
import { defer, from, mergeMap, type Observable } from 'rxjs';

type MaybePromise<TValue> = TValue | Promise<TValue>;

export type InferObjxSession<TValue> =
  TValue extends ObjxModuleResolvedOptions<infer TSession>
    ? TSession
    : TValue extends PromiseLike<infer TResolved>
      ? InferObjxSession<TResolved>
      : TValue extends (...args: readonly unknown[]) => infer TReturn
        ? InferObjxSession<TReturn>
        : never;

export interface ObjxSessionLike {
  readonly executionContextManager: ExecutionContextManager;
}

export interface ObjxHttpRequestLike {
  readonly headers?: Record<string, string | readonly string[] | undefined>;
  readonly method?: string;
  readonly url?: string;
  readonly originalUrl?: string;
}

export interface ObjxRequestContextOptions {
  readonly enabled?: boolean;
  readonly tenantHeader?: string;
  readonly actorHeader?: string;
  readonly requestIdHeader?: string;
  readonly includeRequestMetadata?: boolean;
  readonly staticValues?: Readonly<Record<string, unknown>>;
  readonly resolveValues?: (
    request: ObjxHttpRequestLike,
  ) => MaybePromise<Readonly<Record<string, unknown>>>;
}

export interface ObjxModuleResolvedOptions<TSession extends ObjxSessionLike = ObjxSessionLike> {
  readonly session: TSession;
  readonly dispose?: (session: TSession) => MaybePromise<void>;
  readonly requestContext?: false | ObjxRequestContextOptions;
  readonly validationFilter?: boolean;
}

export interface ObjxModuleOptions<TSession extends ObjxSessionLike = ObjxSessionLike>
  extends ObjxModuleResolvedOptions<TSession> {
  readonly global?: boolean;
}

export interface ObjxModuleAsyncOptions<TSession extends ObjxSessionLike = ObjxSessionLike> {
  readonly global?: boolean;
  readonly imports?: ModuleMetadata['imports'];
  readonly inject?: readonly InjectionToken[];
  useFactory(...args: readonly unknown[]): MaybePromise<ObjxModuleResolvedOptions<TSession>>;
}

export const OBJX_MODULE_OPTIONS = Symbol.for('@qbobjx/nestjs/module-options');
export const OBJX_SESSION = Symbol.for('@qbobjx/nestjs/session');
export const OBJX_EXECUTION_CONTEXT_MANAGER = Symbol.for(
  '@qbobjx/nestjs/execution-context-manager',
);

interface ObjxHttpResponseLike {
  status(code: number): ObjxHttpResponseLike;
  json(body: unknown): void;
}

function readHeaderValue(
  headers: ObjxHttpRequestLike['headers'],
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
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

async function resolveRequestContextValues(
  request: ObjxHttpRequestLike,
  options: ObjxRequestContextOptions,
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

    const requestPath = request.originalUrl ?? request.url;

    if (requestPath) {
      values.requestPath = requestPath;
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

function normalizeResolvedOptions<TSession extends ObjxSessionLike>(
  options: ObjxModuleResolvedOptions<TSession>,
): ObjxModuleResolvedOptions<TSession> {
  return {
    ...options,
    validationFilter: options.validationFilter ?? true,
  };
}

@Injectable()
export class ObjxSessionHost<TSession extends ObjxSessionLike = ObjxSessionLike>
  implements OnApplicationShutdown
{
  constructor(
    @Inject(OBJX_SESSION) readonly session: TSession,
    @Inject(OBJX_EXECUTION_CONTEXT_MANAGER)
    readonly executionContextManager: ExecutionContextManager,
    @Inject(OBJX_MODULE_OPTIONS)
    private readonly options: ObjxModuleResolvedOptions<TSession>,
  ) {}

  currentExecutionContext() {
    return this.executionContextManager.current();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.options.dispose?.(this.session);
  }
}

@Injectable()
export class ObjxRequestContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(OBJX_MODULE_OPTIONS)
    private readonly options: ObjxModuleResolvedOptions,
    @Inject(OBJX_EXECUTION_CONTEXT_MANAGER)
    private readonly executionContextManager: ExecutionContextManager,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requestContext = this.options.requestContext;

    if (!requestContext || requestContext.enabled === false) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<ObjxHttpRequestLike>();

    return defer(() =>
      from(resolveRequestContextValues(request, requestContext)).pipe(
        mergeMap((values: Readonly<Record<string, unknown>>) =>
          this.executionContextManager.run(
            {
              values,
            },
            () => next.handle(),
          ),
        ),
      ),
    );
  }
}

@Catch(ObjxValidationError)
export class ObjxValidationExceptionFilter implements ExceptionFilter<ObjxValidationError> {
  constructor(
    @Inject(OBJX_MODULE_OPTIONS)
    private readonly options: ObjxModuleResolvedOptions,
  ) {}

  catch(exception: ObjxValidationError, host: ArgumentsHost): void {
    if (this.options.validationFilter === false) {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<ObjxHttpResponseLike | undefined>();

    if (!response || typeof response.status !== 'function' || typeof response.json !== 'function') {
      throw exception;
    }

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      error: 'objx_validation_failed',
      message: exception.message,
      adapter: exception.adapterName,
      modelName: exception.modelName,
      tableName: exception.tableName,
      operation: exception.operation,
      issues: exception.issues,
    });
  }
}

export function InjectObjxSession(): ParameterDecorator {
  return Inject(OBJX_SESSION);
}

export function InjectObjxExecutionContextManager(): ParameterDecorator {
  return Inject(OBJX_EXECUTION_CONTEXT_MANAGER);
}

@Module({})
export class ObjxModule {
  static forRoot<TSession extends ObjxSessionLike = ObjxSessionLike>(
    options: ObjxModuleOptions<TSession>,
  ): DynamicModule {
    return ObjxModule.createDynamicModule(
      {
        provide: OBJX_MODULE_OPTIONS,
        useValue: normalizeResolvedOptions(options),
      },
      undefined,
      options.global,
    );
  }

  static forRootAsync<TSession extends ObjxSessionLike = ObjxSessionLike>(
    options: ObjxModuleAsyncOptions<TSession>,
  ): DynamicModule {
    return ObjxModule.createDynamicModule(
      {
        provide: OBJX_MODULE_OPTIONS,
        useFactory: async (...args: readonly unknown[]) =>
          normalizeResolvedOptions(await options.useFactory(...args)),
        inject: options.inject ? [...options.inject] : [],
      },
      options.imports,
      options.global,
    );
  }

  private static createDynamicModule(
    optionsProvider: Provider,
    imports: ModuleMetadata['imports'] | undefined,
    global: boolean | undefined,
  ): DynamicModule {
    return {
      module: ObjxModule,
      ...(global !== undefined ? { global } : {}),
      ...(imports ? { imports } : {}),
      providers: [
        optionsProvider,
        {
          provide: OBJX_SESSION,
          inject: [OBJX_MODULE_OPTIONS],
          useFactory: (options: ObjxModuleResolvedOptions) => options.session,
        },
        {
          provide: OBJX_EXECUTION_CONTEXT_MANAGER,
          inject: [OBJX_SESSION],
          useFactory: (session: ObjxSessionLike) => session.executionContextManager,
        },
        ObjxSessionHost,
        ObjxRequestContextInterceptor,
        ObjxValidationExceptionFilter,
        {
          provide: APP_INTERCEPTOR,
          useExisting: ObjxRequestContextInterceptor,
        },
        {
          provide: APP_FILTER,
          useExisting: ObjxValidationExceptionFilter,
        },
      ],
      exports: [
        OBJX_MODULE_OPTIONS,
        OBJX_SESSION,
        OBJX_EXECUTION_CONTEXT_MANAGER,
        ObjxSessionHost,
      ],
    };
  }
}

import { definePlugin, type ObjxPlugin } from '@objx/core';

export type ValidationOperation = 'insert' | 'update' | 'insertGraph' | 'upsertGraph';

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ValidationSuccess<TValue> {
  readonly success: true;
  readonly value: TValue;
  readonly issues: readonly [];
}

export interface ValidationFailure {
  readonly success: false;
  readonly issues: readonly ValidationIssue[];
}

export type ValidationResult<TValue> = ValidationSuccess<TValue> | ValidationFailure;

export interface ValidationContext {
  readonly operation: ValidationOperation;
  readonly modelName?: string;
  readonly tableName?: string;
}

export interface ValidationAdapter<TSchema = unknown> {
  readonly name: string;
  validate<TValue>(
    schema: TSchema,
    input: unknown,
    context?: ValidationContext,
  ): ValidationResult<TValue> | Promise<ValidationResult<TValue>>;
}

export interface ValidationSchemas<TSchema = unknown> {
  readonly default?: TSchema;
  readonly insert?: TSchema;
  readonly update?: TSchema;
  readonly insertGraph?: TSchema;
  readonly upsertGraph?: TSchema;
}

export interface ValidationPluginMetadata<TSchema = unknown> {
  readonly adapter: ValidationAdapter<TSchema>;
  readonly schemas: ValidationSchemas<TSchema>;
}

export interface ValidationPluginOptions<TSchema = unknown> {
  readonly adapter: ValidationAdapter<TSchema>;
  readonly schemas: ValidationSchemas<TSchema>;
  readonly name?: string;
}

export const VALIDATION_METADATA_KEY = 'validation';

export interface ObjxValidationErrorOptions {
  readonly modelName?: string;
  readonly tableName?: string;
  readonly operation: ValidationOperation;
  readonly adapterName: string;
  readonly issues: readonly ValidationIssue[];
}

export class ObjxValidationError extends Error {
  readonly modelName?: string;
  readonly tableName?: string;
  readonly operation: ValidationOperation;
  readonly adapterName: string;
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, options: ObjxValidationErrorOptions) {
    super(message);
    this.name = 'ObjxValidationError';
    this.operation = options.operation;
    this.adapterName = options.adapterName;
    this.issues = options.issues;

    if (options.modelName) {
      this.modelName = options.modelName;
    }

    if (options.tableName) {
      this.tableName = options.tableName;
    }
  }
}

type MaybePromise<TValue> = TValue | Promise<TValue>;

export function validationOk<TValue>(value: TValue): ValidationSuccess<TValue> {
  return {
    success: true,
    value,
    issues: [],
  };
}

export function validationFail(issues: readonly ValidationIssue[]): ValidationFailure {
  return {
    success: false,
    issues,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFunction<TFunction extends (...args: never[]) => unknown>(
  value: unknown,
): value is TFunction {
  return typeof value === 'function';
}

function formatPathSegment(segment: string | number, isFirst: boolean): string {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  return isFirst ? segment : `.${segment}`;
}

function normalizePath(path: readonly (string | number)[] | undefined): string | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  return path.map((segment, index) => formatPathSegment(segment, index === 0)).join('');
}

function normalizePathFromPointer(pointer: string | undefined): string | undefined {
  if (!pointer || pointer.length === 0 || pointer === '/') {
    return undefined;
  }

  const segments = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

  return normalizePath(segments);
}

function toReadonlyRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return isRecord(value) ? value : undefined;
}

function createIssue(options: {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): ValidationIssue {
  return {
    code: options.code,
    message: options.message,
    ...(options.path ? { path: options.path } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

interface ZodIssueLike {
  readonly code?: string;
  readonly message?: string;
  readonly path?: readonly (string | number)[];
  readonly expected?: unknown;
  readonly received?: unknown;
}

interface ZodParseSuccess<TValue> {
  readonly success: true;
  readonly data: TValue;
}

interface ZodParseFailure {
  readonly success: false;
  readonly error?: {
    readonly issues?: readonly ZodIssueLike[];
  };
}

interface ZodSchemaLike<TValue = unknown> {
  safeParse(input: unknown): ZodParseSuccess<TValue> | ZodParseFailure;
}

function isZodSchemaLike(value: unknown): value is ZodSchemaLike {
  return isRecord(value) && isFunction(value.safeParse);
}

export function createZodAdapter(): ValidationAdapter<unknown> {
  return {
    name: 'zod',
    validate<TValue>(schema: unknown, input: unknown): ValidationResult<TValue> {
      if (!isZodSchemaLike(schema)) {
        throw new TypeError('Zod adapter requires a schema with a safeParse(input) method.');
      }

      const result = schema.safeParse(input);

      if (result.success) {
        return validationOk(result.data as TValue);
      }

      return validationFail(
        (result.error?.issues ?? []).map((issue) => {
          const path = normalizePath(issue.path);
          const metadata =
            issue.expected !== undefined || issue.received !== undefined
              ? {
                  ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
                  ...(issue.received !== undefined ? { received: issue.received } : {}),
                }
              : undefined;

          return createIssue({
            code: issue.code ?? 'invalid_type',
            message: issue.message ?? 'Validation failed.',
            ...(path ? { path } : {}),
            ...(metadata ? { metadata } : {}),
          });
        }),
      );
    },
  };
}

export interface AjvErrorLike {
  readonly instancePath?: string;
  readonly keyword?: string;
  readonly message?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly schemaPath?: string;
}

export interface AjvValidatorLike {
  (input: unknown): boolean | Promise<boolean>;
  readonly errors?: readonly AjvErrorLike[] | null;
}

export interface AjvLike {
  compile(schema: unknown): AjvValidatorLike;
}

export interface AjvAdapterOptions {
  readonly ajv?: AjvLike;
}

function isAjvValidatorLike(value: unknown): value is AjvValidatorLike {
  return isFunction(value);
}

export function createAjvAdapter(
  options: AjvAdapterOptions = {},
): ValidationAdapter<unknown> {
  const objectCache = new WeakMap<object, AjvValidatorLike>();
  const primitiveCache = new Map<unknown, AjvValidatorLike>();

  const resolveValidator = (schema: unknown): AjvValidatorLike => {
    if (isAjvValidatorLike(schema)) {
      return schema;
    }

    if (!options.ajv) {
      throw new TypeError(
        'Ajv adapter requires an Ajv-compatible instance when the schema is not a compiled validator.',
      );
    }

    if (typeof schema === 'object' && schema !== null) {
      const cached = objectCache.get(schema);

      if (cached) {
        return cached;
      }

      const compiled = options.ajv.compile(schema);
      objectCache.set(schema, compiled);
      return compiled;
    }

    if (primitiveCache.has(schema)) {
      return primitiveCache.get(schema) as AjvValidatorLike;
    }

    const compiled = options.ajv.compile(schema);
    primitiveCache.set(schema, compiled);
    return compiled;
  };

  return {
    name: 'ajv',
    async validate<TValue>(schema: unknown, input: unknown): Promise<ValidationResult<TValue>> {
      const validator = resolveValidator(schema);
      const valid = await validator(input);

      if (valid) {
        return validationOk(input as TValue);
      }

      return validationFail(
        (validator.errors ?? []).map((issue) => {
          const path = normalizePathFromPointer(issue.instancePath);
          const metadata =
            issue.params || issue.schemaPath
              ? {
                  ...(issue.params ?? {}),
                  ...(issue.schemaPath ? { schemaPath: issue.schemaPath } : {}),
                }
              : undefined;

          return createIssue({
            code: issue.keyword ?? 'validation_error',
            message: issue.message ?? 'Validation failed.',
            ...(path ? { path } : {}),
            ...(metadata ? { metadata } : {}),
          });
        }),
      );
    },
  };
}

export interface ValibotIssuePathEntryLike {
  readonly key?: string | number;
}

export interface ValibotIssueLike {
  readonly type?: string;
  readonly message?: string;
  readonly path?: readonly (ValibotIssuePathEntryLike | string | number)[];
  readonly input?: unknown;
  readonly expected?: unknown;
  readonly received?: unknown;
}

export interface ValibotParseSuccess<TValue> {
  readonly success: true;
  readonly output: TValue;
}

export interface ValibotParseFailure {
  readonly success: false;
  readonly issues?: readonly ValibotIssueLike[];
}

export interface ValibotModuleLike {
  safeParse<TSchema, TValue = unknown>(
    schema: TSchema,
    input: unknown,
  ): MaybePromise<ValibotParseSuccess<TValue> | ValibotParseFailure>;
}

function normalizeValibotPath(
  path: readonly (ValibotIssuePathEntryLike | string | number)[] | undefined,
): string | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }

  const segments = path.map((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      return entry;
    }

    return entry.key ?? '';
  });

  return normalizePath(
    segments.filter((segment): segment is string | number => segment !== ''),
  );
}

export function createValibotAdapter(
  moduleLike: ValibotModuleLike,
): ValidationAdapter<unknown> {
  if (!moduleLike || !isFunction(moduleLike.safeParse)) {
    throw new TypeError('Valibot adapter requires a module with a safeParse(schema, input) function.');
  }

  return {
    name: 'valibot',
    async validate<TValue>(schema: unknown, input: unknown): Promise<ValidationResult<TValue>> {
      const result = await moduleLike.safeParse<typeof schema, TValue>(schema, input);

      if (result.success) {
        return validationOk(result.output);
      }

      return validationFail(
        (result.issues ?? []).map((issue) => {
          const path = normalizeValibotPath(issue.path);
          const metadata =
            issue.expected !== undefined || issue.received !== undefined || issue.input !== undefined
              ? {
                  ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
                  ...(issue.received !== undefined ? { received: issue.received } : {}),
                  ...(issue.input !== undefined ? { input: issue.input } : {}),
                }
              : undefined;

          return createIssue({
            code: issue.type ?? 'validation_error',
            message: issue.message ?? 'Validation failed.',
            ...(path ? { path } : {}),
            ...(metadata ? { metadata } : {}),
          });
        }),
      );
    },
  };
}

export function createValidationPlugin<TSchema>(
  options: ValidationPluginOptions<TSchema>,
): Readonly<ObjxPlugin> {
  return definePlugin({
    name: options.name ?? `validation:${options.adapter.name}`,
    hooks: {
      onModelRegister(context) {
        context.setMetadata(VALIDATION_METADATA_KEY, {
          adapter: options.adapter,
          schemas: {
            ...options.schemas,
          },
        } satisfies ValidationPluginMetadata<TSchema>);
      },
    },
  });
}

export function createValidationErrorMessage(
  options: ObjxValidationErrorOptions,
): string {
  const modelLabel = options.modelName
    ? `model "${options.modelName}"`
    : options.tableName
      ? `table "${options.tableName}"`
      : 'query payload';

  return `Validation failed for ${modelLabel} during "${options.operation}" using ${options.adapterName}.`;
}

export function createValidationError(
  options: ObjxValidationErrorOptions,
): ObjxValidationError {
  return new ObjxValidationError(createValidationErrorMessage(options), options);
}

export function defineValidationSchemas<TSchema>(
  schemas: ValidationSchemas<TSchema>,
): ValidationSchemas<TSchema> {
  return Object.freeze({
    ...schemas,
  });
}

export function normalizeValidationIssues(
  issues: readonly ValidationIssue[],
): readonly ValidationIssue[] {
  return issues.map((issue) =>
    Object.freeze(
      createIssue({
        code: issue.code,
        message: issue.message,
        ...(issue.path ? { path: issue.path } : {}),
        ...(issue.metadata
          ? { metadata: toReadonlyRecord(issue.metadata) as Readonly<Record<string, unknown>> }
          : {}),
      }),
    ),
  );
}

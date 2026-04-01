import { type ObjxPlugin } from '@qbobjx/core';
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
    validate<TValue>(schema: TSchema, input: unknown, context?: ValidationContext): ValidationResult<TValue> | Promise<ValidationResult<TValue>>;
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
export declare const VALIDATION_METADATA_KEY = "validation";
export interface ObjxValidationErrorOptions {
    readonly modelName?: string;
    readonly tableName?: string;
    readonly operation: ValidationOperation;
    readonly adapterName: string;
    readonly issues: readonly ValidationIssue[];
}
export declare class ObjxValidationError extends Error {
    readonly modelName?: string;
    readonly tableName?: string;
    readonly operation: ValidationOperation;
    readonly adapterName: string;
    readonly issues: readonly ValidationIssue[];
    constructor(message: string, options: ObjxValidationErrorOptions);
}
type MaybePromise<TValue> = TValue | Promise<TValue>;
export declare function validationOk<TValue>(value: TValue): ValidationSuccess<TValue>;
export declare function validationFail(issues: readonly ValidationIssue[]): ValidationFailure;
export declare function createZodAdapter(): ValidationAdapter<unknown>;
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
export declare function createAjvAdapter(options?: AjvAdapterOptions): ValidationAdapter<unknown>;
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
    safeParse<TSchema, TValue = unknown>(schema: TSchema, input: unknown): MaybePromise<ValibotParseSuccess<TValue> | ValibotParseFailure>;
}
export declare function createValibotAdapter(moduleLike: ValibotModuleLike): ValidationAdapter<unknown>;
export declare function createValidationPlugin<TSchema>(options: ValidationPluginOptions<TSchema>): Readonly<ObjxPlugin>;
export declare function createValidationErrorMessage(options: ObjxValidationErrorOptions): string;
export declare function createValidationError(options: ObjxValidationErrorOptions): ObjxValidationError;
export declare function defineValidationSchemas<TSchema>(schemas: ValidationSchemas<TSchema>): ValidationSchemas<TSchema>;
export declare function normalizeValidationIssues(issues: readonly ValidationIssue[]): readonly ValidationIssue[];
export {};
//# sourceMappingURL=index.d.ts.map
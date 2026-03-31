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

export interface ValidationAdapter<TSchema = unknown> {
  readonly name: string;
  validate<TValue>(schema: TSchema, input: unknown): ValidationResult<TValue> | Promise<ValidationResult<TValue>>;
}

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


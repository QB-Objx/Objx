import { deepFreeze } from './utils.js';

export type ColumnKind =
  | 'int'
  | 'bigint'
  | 'text'
  | 'boolean'
  | 'json'
  | 'uuid'
  | 'timestamp'
  | 'custom';

type DefaultValueFactory<TValue> = TValue | (() => TValue);

export interface ColumnDefinition<
  TValue = unknown,
  TKind extends string = string,
  TNullable extends boolean = boolean,
  TPrimary extends boolean = boolean,
  THasDefault extends boolean = boolean,
  TGenerated extends boolean = boolean,
> {
  readonly kind: TKind;
  readonly nullable: TNullable;
  readonly primary: TPrimary;
  readonly hasDefault: THasDefault;
  readonly generated: TGenerated;
  readonly defaultValue?: DefaultValueFactory<TValue>;
  readonly config: Readonly<Record<string, unknown>>;
  readonly __value?: TValue;
}

interface ColumnBuilderState<
  TValue,
  TKind extends string,
  TNullable extends boolean,
  TPrimary extends boolean,
  THasDefault extends boolean,
  TGenerated extends boolean,
> {
  readonly kind: TKind;
  readonly nullable: TNullable;
  readonly primary: TPrimary;
  readonly hasDefault: THasDefault;
  readonly generated: TGenerated;
  readonly defaultValue?: DefaultValueFactory<TValue>;
  readonly config: Readonly<Record<string, unknown>>;
}

export type AnyColumnDefinition = ColumnDefinition<any, any, any, any, any, any>;

export type InferColumnValue<TColumn extends AnyColumnDefinition> = TColumn extends ColumnDefinition<
  infer TValue,
  any,
  any,
  any,
  any,
  any
>
  ? TValue
  : never;

export type InferColumnsShape<TColumns extends Record<string, AnyColumnDefinition>> = {
  [TKey in keyof TColumns]: InferColumnValue<TColumns[TKey]>;
};

export class ColumnBuilder<
  TValue,
  TKind extends string,
  TNullable extends boolean = false,
  TPrimary extends boolean = false,
  THasDefault extends boolean = false,
  TGenerated extends boolean = false,
> {
  readonly #state: ColumnBuilderState<
    TValue,
    TKind,
    TNullable,
    TPrimary,
    THasDefault,
    TGenerated
  >;

  constructor(
    state: ColumnBuilderState<
      TValue,
      TKind,
      TNullable,
      TPrimary,
      THasDefault,
      TGenerated
    >,
  ) {
    this.#state = state;
  }

  nullable(): ColumnBuilder<TValue | null, TKind, true, TPrimary, THasDefault, TGenerated> {
    if (this.#state.defaultValue === undefined) {
      return new ColumnBuilder<TValue | null, TKind, true, TPrimary, THasDefault, TGenerated>({
        kind: this.#state.kind,
        nullable: true,
        primary: this.#state.primary,
        hasDefault: this.#state.hasDefault,
        generated: this.#state.generated,
        config: this.#state.config,
      });
    }

    return new ColumnBuilder<TValue | null, TKind, true, TPrimary, THasDefault, TGenerated>({
      kind: this.#state.kind,
      nullable: true,
      primary: this.#state.primary,
      hasDefault: this.#state.hasDefault,
      generated: this.#state.generated,
      config: this.#state.config,
      defaultValue: this.#state.defaultValue as DefaultValueFactory<TValue | null>,
    });
  }

  primary(): ColumnBuilder<TValue, TKind, TNullable, true, THasDefault, TGenerated> {
    return new ColumnBuilder<TValue, TKind, TNullable, true, THasDefault, TGenerated>({
      ...this.#state,
      primary: true,
    });
  }

  default(
    value: DefaultValueFactory<TValue>,
  ): ColumnBuilder<TValue, TKind, TNullable, TPrimary, true, TGenerated> {
    return new ColumnBuilder<TValue, TKind, TNullable, TPrimary, true, TGenerated>({
      ...this.#state,
      hasDefault: true,
      defaultValue: value,
    });
  }

  generated(): ColumnBuilder<TValue, TKind, TNullable, TPrimary, THasDefault, true> {
    return new ColumnBuilder<TValue, TKind, TNullable, TPrimary, THasDefault, true>({
      ...this.#state,
      generated: true,
      config: {
        ...this.#state.config,
        generated: true,
      },
    });
  }

  configure(
    config: Record<string, unknown>,
  ): ColumnBuilder<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated> {
    return new ColumnBuilder<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated>({
      ...this.#state,
      config: {
        ...this.#state.config,
        ...config,
      },
    });
  }

  dbName(
    name: string,
  ): ColumnBuilder<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated> {
    const normalized = name.trim();

    if (!normalized) {
      throw new Error('Column database name cannot be empty.');
    }

    return this.configure({
      dbName: normalized,
    });
  }

  build(): ColumnDefinition<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated> {
    return deepFreeze({
      kind: this.#state.kind,
      nullable: this.#state.nullable,
      primary: this.#state.primary,
      hasDefault: this.#state.hasDefault,
      generated: this.#state.generated,
      defaultValue: this.#state.defaultValue,
      config: this.#state.config,
    }) as ColumnDefinition<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated>;
  }
}

export type AnyColumnBuilder = ColumnBuilder<any, any, any, any, any, any>;
export type ColumnInput = AnyColumnBuilder | AnyColumnDefinition;

export type ResolveColumnInput<TColumnInput> = TColumnInput extends ColumnBuilder<
  infer TValue,
  infer TKind,
  infer TNullable,
  infer TPrimary,
  infer THasDefault,
  infer TGenerated
>
  ? ColumnDefinition<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated>
  : TColumnInput extends ColumnDefinition<
        infer TValue,
        infer TKind,
        infer TNullable,
        infer TPrimary,
        infer THasDefault,
        infer TGenerated
      >
    ? ColumnDefinition<TValue, TKind, TNullable, TPrimary, THasDefault, TGenerated>
    : never;

export type ResolveColumns<TColumns extends Record<string, ColumnInput>> = {
  [TKey in keyof TColumns]: ResolveColumnInput<TColumns[TKey]>;
};

function createBuilder<TValue, TKind extends string>(
  kind: TKind,
  config: Record<string, unknown> = {},
): ColumnBuilder<TValue, TKind, false, false, false, false> {
  return new ColumnBuilder<TValue, TKind, false, false, false, false>({
    kind,
    nullable: false,
    primary: false,
    hasDefault: false,
    generated: false,
    config,
  });
}

export const col = {
  int: () => createBuilder<number, 'int'>('int'),
  bigint: () => createBuilder<bigint, 'bigint'>('bigint'),
  bigInt: () => createBuilder<bigint, 'bigint'>('bigint'),
  text: () => createBuilder<string, 'text'>('text'),
  boolean: () => createBuilder<boolean, 'boolean'>('boolean'),
  json: <TValue = unknown>() => createBuilder<TValue, 'json'>('json'),
  uuid: () => createBuilder<string, 'uuid'>('uuid'),
  timestamp: () => createBuilder<Date, 'timestamp'>('timestamp'),
  custom: <TValue, TKind extends string>(kind: TKind, config: Record<string, unknown> = {}) =>
    createBuilder<TValue, TKind>(kind, config),
} as const;

export function resolveColumnInput<TColumnInput extends ColumnInput>(
  columnInput: TColumnInput,
): ResolveColumnInput<TColumnInput> {
  if (columnInput instanceof ColumnBuilder) {
    return columnInput.build() as ResolveColumnInput<TColumnInput>;
  }

  return columnInput as unknown as ResolveColumnInput<TColumnInput>;
}

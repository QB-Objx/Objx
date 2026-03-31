import { deepFreeze } from './utils.js';

export type ColumnKind =
  | 'int'
  | 'text'
  | 'boolean'
  | 'json'
  | 'uuid'
  | 'timestamp'
  | 'custom';

export interface ColumnDefinition<TValue = unknown, TKind extends string = string> {
  readonly kind: TKind;
  readonly nullable: boolean;
  readonly primary: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: TValue | (() => TValue);
  readonly config: Readonly<Record<string, unknown>>;
  readonly __value?: TValue;
}

interface ColumnBuilderState<TValue, TKind extends string> {
  readonly kind: TKind;
  readonly nullable: boolean;
  readonly primary: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: TValue | (() => TValue);
  readonly config: Readonly<Record<string, unknown>>;
}

export type AnyColumnDefinition = ColumnDefinition<any, any>;

export type InferColumnValue<TColumn extends AnyColumnDefinition> = TColumn extends ColumnDefinition<
  infer TValue,
  any
>
  ? TValue
  : never;

export type InferColumnsShape<TColumns extends Record<string, AnyColumnDefinition>> = {
  [TKey in keyof TColumns]: InferColumnValue<TColumns[TKey]>;
};

export class ColumnBuilder<TValue, TKind extends string> {
  readonly #state: ColumnBuilderState<TValue, TKind>;

  constructor(state: ColumnBuilderState<TValue, TKind>) {
    this.#state = state;
  }

  nullable(): ColumnBuilder<TValue | null, TKind> {
    const nextState: ColumnBuilderState<TValue | null, TKind> =
      this.#state.defaultValue === undefined
        ? {
            kind: this.#state.kind,
            nullable: true,
            primary: this.#state.primary,
            hasDefault: this.#state.hasDefault,
            config: this.#state.config,
          }
        : {
            kind: this.#state.kind,
            nullable: true,
            primary: this.#state.primary,
            hasDefault: this.#state.hasDefault,
            config: this.#state.config,
            defaultValue: this.#state.defaultValue as (TValue | null) | (() => TValue | null),
          };

    return new ColumnBuilder<TValue | null, TKind>(nextState);
  }

  primary(): ColumnBuilder<TValue, TKind> {
    return new ColumnBuilder<TValue, TKind>({
      ...this.#state,
      primary: true,
    });
  }

  default(value: TValue | (() => TValue)): ColumnBuilder<TValue, TKind> {
    return new ColumnBuilder<TValue, TKind>({
      ...this.#state,
      hasDefault: true,
      defaultValue: value,
    });
  }

  configure(config: Record<string, unknown>): ColumnBuilder<TValue, TKind> {
    return new ColumnBuilder<TValue, TKind>({
      ...this.#state,
      config: {
        ...this.#state.config,
        ...config,
      },
    });
  }

  build(): ColumnDefinition<TValue, TKind> {
    return deepFreeze({
      kind: this.#state.kind,
      nullable: this.#state.nullable,
      primary: this.#state.primary,
      hasDefault: this.#state.hasDefault,
      defaultValue: this.#state.defaultValue,
      config: this.#state.config,
    }) as ColumnDefinition<TValue, TKind>;
  }
}

export type AnyColumnBuilder = ColumnBuilder<any, any>;
export type ColumnInput = AnyColumnBuilder | AnyColumnDefinition;

export type ResolveColumnInput<TColumnInput> = TColumnInput extends ColumnBuilder<infer TValue, infer TKind>
  ? ColumnDefinition<TValue, TKind>
  : TColumnInput extends ColumnDefinition<infer TValue, infer TKind>
    ? ColumnDefinition<TValue, TKind>
    : never;

export type ResolveColumns<TColumns extends Record<string, ColumnInput>> = {
  [TKey in keyof TColumns]: ResolveColumnInput<TColumns[TKey]>;
};

function createBuilder<TValue, TKind extends string>(
  kind: TKind,
  config: Record<string, unknown> = {},
): ColumnBuilder<TValue, TKind> {
  return new ColumnBuilder<TValue, TKind>({
    kind,
    nullable: false,
    primary: false,
    hasDefault: false,
    config,
  });
}

export const col = {
  int: () => createBuilder<number, 'int'>('int'),
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

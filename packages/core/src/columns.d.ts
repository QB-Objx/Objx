export type ColumnKind = 'int' | 'text' | 'boolean' | 'json' | 'uuid' | 'timestamp' | 'custom';
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
export type InferColumnValue<TColumn extends AnyColumnDefinition> = TColumn extends ColumnDefinition<infer TValue, any> ? TValue : never;
export type InferColumnsShape<TColumns extends Record<string, AnyColumnDefinition>> = {
    [TKey in keyof TColumns]: InferColumnValue<TColumns[TKey]>;
};
export declare class ColumnBuilder<TValue, TKind extends string> {
    #private;
    constructor(state: ColumnBuilderState<TValue, TKind>);
    nullable(): ColumnBuilder<TValue | null, TKind>;
    primary(): ColumnBuilder<TValue, TKind>;
    default(value: TValue | (() => TValue)): ColumnBuilder<TValue, TKind>;
    configure(config: Record<string, unknown>): ColumnBuilder<TValue, TKind>;
    build(): ColumnDefinition<TValue, TKind>;
}
export type AnyColumnBuilder = ColumnBuilder<any, any>;
export type ColumnInput = AnyColumnBuilder | AnyColumnDefinition;
export type ResolveColumnInput<TColumnInput> = TColumnInput extends ColumnBuilder<infer TValue, infer TKind> ? ColumnDefinition<TValue, TKind> : TColumnInput extends ColumnDefinition<infer TValue, infer TKind> ? ColumnDefinition<TValue, TKind> : never;
export type ResolveColumns<TColumns extends Record<string, ColumnInput>> = {
    [TKey in keyof TColumns]: ResolveColumnInput<TColumns[TKey]>;
};
export declare const col: {
    readonly int: () => ColumnBuilder<number, "int">;
    readonly text: () => ColumnBuilder<string, "text">;
    readonly boolean: () => ColumnBuilder<boolean, "boolean">;
    readonly json: <TValue = unknown>() => ColumnBuilder<TValue, "json">;
    readonly uuid: () => ColumnBuilder<string, "uuid">;
    readonly timestamp: () => ColumnBuilder<Date, "timestamp">;
    readonly custom: <TValue, TKind extends string>(kind: TKind, config?: Record<string, unknown>) => ColumnBuilder<TValue, TKind>;
};
export declare function resolveColumnInput<TColumnInput extends ColumnInput>(columnInput: TColumnInput): ResolveColumnInput<TColumnInput>;
export {};
//# sourceMappingURL=columns.d.ts.map
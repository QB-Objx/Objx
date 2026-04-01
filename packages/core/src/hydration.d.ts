import type { AnyColumnDefinition } from './columns.js';
import type { AnyModelDefinition, InferModelShape } from './model.js';
export interface HydrationOptions {
    readonly preserveUnknownKeys?: boolean;
}
export type ColumnHydrator<TValue = unknown> = (value: unknown, column: AnyColumnDefinition) => TValue;
export declare function hydrateColumnValue(definition: AnyColumnDefinition, value: unknown): unknown;
export declare function hydrateModelRow<TModel extends AnyModelDefinition>(model: TModel, row: Readonly<Record<string, unknown>>, options?: HydrationOptions): InferModelShape<TModel> & Record<string, unknown>;
export declare function hydrateModelRows<TModel extends AnyModelDefinition>(model: TModel, rows: readonly Readonly<Record<string, unknown>>[], options?: HydrationOptions): readonly (InferModelShape<TModel> & Record<string, unknown>)[];
//# sourceMappingURL=hydration.d.ts.map
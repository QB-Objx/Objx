import { deepFreeze } from './utils.js';
export class ColumnBuilder {
    #state;
    constructor(state) {
        this.#state = state;
    }
    nullable() {
        const nextState = this.#state.defaultValue === undefined
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
                defaultValue: this.#state.defaultValue,
            };
        return new ColumnBuilder(nextState);
    }
    primary() {
        return new ColumnBuilder({
            ...this.#state,
            primary: true,
        });
    }
    default(value) {
        return new ColumnBuilder({
            ...this.#state,
            hasDefault: true,
            defaultValue: value,
        });
    }
    configure(config) {
        return new ColumnBuilder({
            ...this.#state,
            config: {
                ...this.#state.config,
                ...config,
            },
        });
    }
    build() {
        return deepFreeze({
            kind: this.#state.kind,
            nullable: this.#state.nullable,
            primary: this.#state.primary,
            hasDefault: this.#state.hasDefault,
            defaultValue: this.#state.defaultValue,
            config: this.#state.config,
        });
    }
}
function createBuilder(kind, config = {}) {
    return new ColumnBuilder({
        kind,
        nullable: false,
        primary: false,
        hasDefault: false,
        config,
    });
}
export const col = {
    int: () => createBuilder('int'),
    text: () => createBuilder('text'),
    boolean: () => createBuilder('boolean'),
    json: () => createBuilder('json'),
    uuid: () => createBuilder('uuid'),
    timestamp: () => createBuilder('timestamp'),
    custom: (kind, config = {}) => createBuilder(kind, config),
};
export function resolveColumnInput(columnInput) {
    if (columnInput instanceof ColumnBuilder) {
        return columnInput.build();
    }
    return columnInput;
}

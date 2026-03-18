export type Mutable<T extends object> = {
    -readonly [key in keyof T]: T[key];
};

/**
 * Like Required<>, but allow undefined if it's allowed in the source type
 */
export type RequireAllProperties<T> = {
    readonly [K in keyof Required<T>]: T[K];
};

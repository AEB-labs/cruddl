export type Mutable<T extends object> = {
    -readonly [key in keyof T]: T[key];
};

export type StringKeys<T> = Extract<keyof T, string>;

export type OnlyString<T> = Extract<T, string>;

export type MakeOptional<B extends boolean, T> = B extends true ? T | undefined : T;

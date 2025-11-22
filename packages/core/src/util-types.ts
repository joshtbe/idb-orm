/**
 * Extracts the string keys of an object
 */
export type Keyof<T extends Record<any, any>> = Extract<keyof T, string>;

export type Arrayable<T> = T | T[];
export type IsNever<T> = [T] extends [never] ? true : false;
export type Promisable<T> = T | Promise<T>;
export type NoUndefined<T> = Exclude<T, undefined>;
export type Extends<T, K> = T extends K ? true : false;
export type And<T, K> = T extends true
    ? K extends true
        ? true
        : false
    : false;
export type Or<T, K> = T extends true ? true : K extends true ? true : false;

export type MakeOptional<B extends boolean, T> = B extends true
    ? T | undefined
    : T;

export type MakeRequired<B extends boolean, T> = B extends true
    ? NonNullable<T>
    : T;

export type Simplify<T> = {
    [K in keyof T]: T[K];
} & {};

export type MakeArray<B extends boolean, T> = B extends true ? T[] : T;
export type MakeArrayable<B extends boolean, T> = B extends true
    ? Arrayable<T>
    : T;


export type If<
    Type extends boolean,
    IfBranch,
    ElseBranch
> = IsNever<Type> extends true
    ? ElseBranch
    : Type extends true
    ? IfBranch
    : ElseBranch;

export type RemoveNeverValues<T extends object> = {
    [K in keyof T as T[K] extends never ? never : K]: T[K];
};

/**
 * A type representing a dictionary from string to some type
 */
export type Dict<T = unknown> = Record<string, T>;

type UndefinedKeys<T extends Dict> = {
    [K in Keyof<T>]: undefined extends T[K] ? K : never;
}[Keyof<T>];

type Optional<T extends Dict> = Partial<Pick<T, UndefinedKeys<T>>>;
type Required<T extends Dict> = Omit<T, UndefinedKeys<T>>;

export type PartialOnUndefined<T extends Dict> = Required<T> & Optional<T>;

/**
 * Types that can be resolved to specific boolean values
 */
export type BooleanLike = boolean | undefined | null | 0;

export type Literable = string | number | bigint | boolean | null | undefined;

export type SinglularKey<T extends Record<string, any>> = {
    [K in keyof T]: { [P in K]: T[P] } & {
        [Q in Exclude<keyof T, K>]?: never;
    };
}[keyof T];

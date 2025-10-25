import type { Arrayable, IsNever } from "type-fest";
import type z from "zod";

/**
 * Extracts the string keys of an object
 */
export type Keyof<T extends Record<any, any>> = Extract<keyof T, string>;

export type MakeOptional<B extends boolean, T> = B extends true
    ? T | undefined
    : T;

export type MakeArray<B extends boolean, T> = B extends true ? T[] : T;
export type MakeArrayable<B extends boolean, T> = B extends true
    ? Arrayable<T>
    : T;

export type ValidKey = string | number | Date;
export type ValidKeyType = "string" | "number" | "date";

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

export type Dict<T = unknown> = Record<string, T>;


// TODO: Expand on this?
export type ConnectionObject<
    M extends boolean = false,
    T = object,
    K = ValidKey
> = {
    $create: T;
    $connect: K;
} & If<M, { $createMany: T[]; $connectMany: K[] }, Dict>;

export type ZodWrap<T extends Dict> = {
    [K in keyof T]: z.ZodType<T[K]>;
};

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

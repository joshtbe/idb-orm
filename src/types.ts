import type { Arrayable, IsNever } from "type-fest";
import type z from "zod";

export type StringKeys<T> = Extract<keyof T, string>;

export type OnlyString<T> = Extract<T, string>;

export type Key<T extends Record<any, any>> = Extract<keyof T, string>;

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
export type ConnectionObject<
    M extends boolean = false,
    T = object,
    K = ValidKey
> = {
    $create: T;
    $connect: K;
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
} & If<M, { $createMany: T[]; $connectMany: K[] }, {}>;

export type ZodWrap<T extends Dict> = {
    [K in keyof T]: z.ZodType<T[K]>;
};

export type DoesExtend<T, P> = T extends P ? true : false;



type UndefinedKeys<T extends Dict> = {
    [K in Key<T>]: undefined extends T[K] ? K : never;
}[Key<T>];

type Optional<T extends Dict> = Partial<Pick<T, UndefinedKeys<T>>>;
type Required<T extends Dict> = Omit<T, UndefinedKeys<T>>;

export type PartialOnUndefined<T extends Dict> = Required<T> & Optional<T>;

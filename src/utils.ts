import z from "zod";
import type { Keyof } from "./types/common";
import type { Arrayable, Primitive } from "type-fest";
import type { Transaction } from "./transaction.js";

/**
 * @internal
 */
export async function handleRequest<T>(
    req: IDBRequest<T>,
    tx?: Transaction<any, any>
) {
    return await new Promise<T>((res) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => {
            if (tx) {
                throw tx.abort("UNKNOWN", "An unknown error occurred");
            }
        };
    });
}

/**
 * Removes duplicates from an array by converting it into a set then back into an array
 * @internal
 * @param array Array of a hashable type (number, string, etc...)
 * @returns An array with duplicate entries removed
 */
export function removeDuplicates<Item extends NonNullable<Primitive>>(
    array: Item[]
): Item[] {
    return Array.from(new Set<Item>(array));
}

/**
 * @internal
 */
export function makeFieldOptional<
    T extends Readonly<{ [k: string]: z.ZodType }>
>(key: Extract<keyof T, string>, schema: z.ZodObject<T>) {
    const k = key as "";
    return schema
        .omit({ [k]: true })
        .extend(schema.pick({ [k]: true }).partial());
}

/**
 * @internal
 */
export function getKeys<T extends object>(obj: T): Keyof<T>[] {
    return Object.keys(obj) as Keyof<T>[];
}

/**
 * @internal
 */
export function addToSet<T>(set: Set<T>, items: T[]) {
    for (const item of items) {
        set.add(item);
    }
    return set;
}

/**
 * @internal
 */
export function toArray<T>(value: Arrayable<T>): T[] {
    if (!Array.isArray(value)) value = [value];
    return value;
}

/**
 * Identity Function, it returns the first argument it is given, all others are ignored
 * @param value Value
 * @returns Same Value
 * @internal
 */
export function identity<T>(value: T): T {
    return value;
}

/**
 * Performs a union over `set1` and `set2`, modifying `set1` to be union of the two sets
 * @internal
 */
export function unionSets<T>(set: Set<T>, other: Set<T>) {
    for (const key of other.keys()) {
        set.add(key);
    }
}

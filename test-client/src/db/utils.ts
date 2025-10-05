import z from "zod";
import type { Key } from "./types.ts";
import type { Arrayable, Primitive } from "type-fest";

export async function handleRequest<T>(req: IDBRequest<T>) {
    return await new Promise<T>((res, rej) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => rej();
    });
}

/**
 * Removes duplicates from an array by converting it into a set then back into an array
 * @param array Array of a hashable type (number, string, etc...)
 * @returns An array with duplicate entries removed
 */
export function removeDuplicates<Item extends NonNullable<Primitive>>(
    array: Item[]
): Item[] {
    return Array.from(new Set<Item>(array));
}

export function makeFieldOptional<
    T extends Readonly<{ [k: string]: z.ZodType }>
>(key: Extract<keyof T, string>, schema: z.ZodObject<T>) {
    const k = key as "";
    return schema
        .omit({ [k]: true })
        .extend(schema.pick({ [k]: true }).partial());
}

export function getKeys<T extends object>(obj: T): Key<T>[] {
    return Object.keys(obj) as Key<T>[];
}

export function addToSet<T>(set: Set<T>, items: T[]) {
    for (const item of items) {
        set.add(item);
    }
    return set;
}

export function toArray<T>(value: Arrayable<T>): T[] {
    if (!Array.isArray(value)) value = [value];
    return value;
}

/**
 * Identity Function, it returns the first argument it is given, all others are ignored
 * @param value Value
 * @returns Same Value
 */
export function identity<T>(value: T): T {
    return value;
}

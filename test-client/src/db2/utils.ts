import type z from "zod";
import type { OnlyString } from "./types.ts";

export async function handleRequest<T>(req: IDBRequest<T>) {
    return await new Promise<T>((res, rej) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => rej();
    });
}

export function removeDuplicates<Item>(array: Item[]): Item[] {
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

export function getKeys<T extends object>(obj: T): OnlyString<keyof T>[] {
    return Object.keys(obj) as OnlyString<keyof T>[];
}

export function addToSet<T>(set: Set<T>, items: T[]) {
    for (const item of items) {
        set.add(item);
    }
    return set;
}

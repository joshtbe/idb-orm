import { Arrayable, Dict, Keyof } from "./util-types";
import type { Transaction } from "./transaction.js";
import { UnknownError } from "./error.js";

export function handleRequest<T>(
    req: IDBRequest<T>,
    tx?: Transaction<any, any>,
) {
    return new Promise<T>((res) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => {
            if (tx) {
                throw tx.abort(
                    new UnknownError("An Error Occurred duing the Request"),
                );
            }
        };
    });
}

export function getKeys<T extends Dict>(obj: T): Keyof<T>[] {
    return Object.keys(obj) as Keyof<T>[];
}

export function toArray<T>(value: Arrayable<T>): T[] {
    if (!Array.isArray(value)) value = [value];
    return value;
}

export function areDatesEqual(date1: Date, date2: unknown): boolean {
    if (!(date2 instanceof Date)) return false;
    return date1.getTime() === date2.getTime();
}

export function uuid() {
    return crypto.randomUUID();
}

export function getDate() {
    return new Date();
}

/**
 * Retrieves the first key of an object.
 * 
 * This is not guranteed to be the key of the object that was added first.
 * @param obj Object
 * @returns The first key (if there is one) of this object.
 */
export function firstKey<T extends Dict>(obj: T): string | undefined {
    for (const key in obj) {
        if (!Object.hasOwn(obj, key)) continue;
        return key;
    }
}

/**
 * Identity Function, it returns the first argument it is given, all others are ignored
 * @param value Value
 * @returns Same Value
 */
export function identity<T>(value: T): T {
    return value;
}

/**
 * Performs a union over `set1` and `set2`, modifying `set1` to be union of the two sets
 */
export function unionSets<T>(set: Set<T>, other: Iterable<T>) {
    for (const key of other) {
        set.add(key);
    }
    return set;
}

/**
 * Attempts to coerce a string into a number, if the number is NaN, returns the string instead
 * @param str String to coerce
 */
export function tryNumberCoerce(str: string): string | number {
    const toNum = Number(str);
    return isNaN(toNum) ? str : toNum;
}

export function isDict<T>(value: unknown): value is Dict<T> {
    return !!value && typeof value === "object";
}

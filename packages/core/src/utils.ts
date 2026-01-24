import { Arrayable, Keyof } from "./util-types";
import type { Transaction } from "./transaction.js";
import { UnknownError } from "./error.js";

export function handleRequest<T>(
    req: IDBRequest<T>,
    tx?: Transaction<any, any>
) {
    return new Promise<T>((res) => {
        req.onsuccess = () => {
            res(req.result);
        };
        req.onerror = () => {
            if (tx) {
                throw tx.abort(new UnknownError("An Error Occurred duing the Request"));
            }
        };
    });
}

export function getKeys<T extends object>(obj: T): Keyof<T>[] {
    return Object.keys(obj) as Keyof<T>[];
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

export function uuid() {
    return crypto.randomUUID();
}

export function getDate() {
    return new Date();
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
export function unionSets<T>(set: Set<T>, other: Set<T>) {
    for (const key of other.keys()) {
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

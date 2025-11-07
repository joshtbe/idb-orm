import { Arrayable, Keyof, ValidKeyType } from "./util-types";
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
                throw tx.abort(new UnknownError());
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

export function stringTypeToEnum(type: ValidKeyType): Type {
    switch (type) {
        case "date":
            return Type.Date;
        case "number":
            return Type.Number;
        case "string":
            return Type.String;
    }
}

export function uuid() {
    return crypto.randomUUID();
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

export function makeFunction<Sig extends Function>(options: {
    args: string[];
    body: string;
}): Sig {
    return new Function(...options.args, options.body) as Sig;
}

export enum Type {
    String,
    Number,
    BigInt,
    Boolean,
    Symbol,
    Array,
    Date,
    Object,
    Unknown,
}

import { Dict, Literable } from "../util-types";
import {
    ArrayTag,
    LiteralTag,
    ObjectTag,
    Tag,
    TagToType,
    TupleTag,
    TypeTag,
    UnionTag,
} from "./tag";
import { ParseResult } from "../field";
import { DeserializationError, SerializationError } from "../error";
import { isDict } from "../utils";

export function typeToString(type: TypeTag): string {
    switch (type.tag) {
        case Tag.undefined:
            return "undefiend";
        case Tag.null:
            return "null";
        case Tag.literal:
            return String(type.value);
        case Tag.boolean:
            return "boolean";
        case Tag.number:
            return "number";
        case Tag.float:
            return "float";
        case Tag.int:
            return "integer";
        case Tag.bigint:
            return "bigint";
        case Tag.string:
            return "string";
        case Tag.unknown:
            return "unknown";
        case Tag.date:
            return "Date";
        case Tag.tuple:
            return `Tuple<${type.elements
                .map((o) => typeToString(o))
                .join(", ")}>`;
        case Tag.array:
            return `Array<${typeToString(type.of)}>`;
        case Tag.set:
            return `Set<${typeToString(type.of)}>`;
        case Tag.default:
        case Tag.optional:
            return `${typeToString(type.of)} | undefined`;
        case Tag.union:
            return `Union<${type.options
                .map((o) => typeToString(o))
                .join(", ")}>`;
        case Tag.file:
            return "File";
        case Tag.object:
            return `{${Object.keys(type.props)
                .map((k) => `${k}: ${typeToString(type.props[k])}`)
                .join(",\n")}}`;
        case Tag.discriminatedUnion: {
            const base = typeToString({ tag: Tag.object, props: type.base });
            const options = type.options
                .map((props) => typeToString({ tag: Tag.object, props: props }))
                .join(" | ");
            return `${base} & (${options})`;
        }
        case Tag.record:
            return `Record<${typeToString(type.key)}, ${typeToString(type.value)}>`;
        case Tag.custom:
            return "custom";
    }
}

/**
 * Serialize's a type into JSON
 * @param type Type
 * @param value Value to serialize
 */
export async function serializeType<T extends TypeTag>(
    type: T,
    value: TagToType<T>,
): Promise<unknown> {
    if (!isType(type, value)) {
        throw new SerializationError(
            `Value not of the proper type, expected type '${typeToString(
                type,
            )}', received '${JSON.stringify(value)}'`,
        );
    }

    switch (type.tag) {
        case Tag.literal:
        case Tag.boolean:
        case Tag.number:
        case Tag.float:
        case Tag.int:
        case Tag.string:
        case Tag.undefined:
        case Tag.null:
            return value;
        case Tag.bigint:
            return Number(value);
        case Tag.unknown:
            return JSON.stringify(value);
        case Tag.date:
            return (value as Date).getTime();
        case Tag.tuple: {
            const result: unknown[] = [];
            for (let i = 0; i < value.length; i++) {
                result.push(await serializeType(type.elements[i], value[i]));
            }
            return result;
        }
        case Tag.array: {
            const promises: Promise<unknown>[] = [];
            for (const element of value as any) {
                promises.push(serializeType(type.of, element));
            }
            return await Promise.all(promises);
        }
        case Tag.set: {
            const promises: Promise<unknown>[] = [];
            for (const element of (value as Set<unknown>).keys()) {
                promises.push(serializeType(type.of, element));
            }
            return await Promise.all(promises);
        }
        case Tag.optional:
            if (typeof value === "undefined") return undefined;
            return await serializeType(type.of, value);
        case Tag.union:
            for (const opt of type.options) {
                try {
                    return await serializeType(opt, value);
                } catch {
                    // Pass
                }
            }
            throw new SerializationError("Value union could not be serialized");
        case Tag.file: {
            if (!((value as unknown) instanceof File)) {
                throw new SerializationError("Value is not a valid file");
            }

            return {
                data: new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(value as Blob);
                }),
                name: value.name,
                type: value.type,
            };
        }
        case Tag.discriminatedUnion: {
            const result: Dict = {};

            if (!isDict(value)) {
                throw new SerializationError(`Expected an object type.`);
            }

            // Check for the base values
            for (const [key, cur] of Object.entries(type.base)) {
                if (
                    !(key in value) &&
                    cur.tag !== Tag.optional &&
                    cur.tag !== Tag.default &&
                    cur.tag !== Tag.undefined
                ) {
                    throw new SerializationError(
                        `Required property '${key}' not found`,
                    );
                }
                result[key] = await serializeType(cur, value[key]);
            }

            // Check for the options
            const discValue: Literable = value[type.key];
            let found = false;
            for (const opt of type.options) {
                if ((opt[type.key] as LiteralTag)?.value !== discValue) {
                    continue;
                }

                // Otherwise, parse this option
                for (const [key, cur] of Object.entries(opt)) {
                    if (
                        !(key in value) &&
                        cur.tag !== Tag.optional &&
                        cur.tag !== Tag.default &&
                        cur.tag !== Tag.undefined
                    ) {
                        throw new SerializationError(
                            `Required property '${key}' not found`,
                        );
                    }
                    result[key] = await serializeType(cur, value[key]);
                }
                found = true;
                break;
            }

            if (!found) {
                throw new SerializationError(
                    `Did not find option matching discriminator '${discValue}'`,
                );
            }

            return result;
        }
        case Tag.object: {
            const result: Dict = {};
            if (!isDict(value)) {
                throw new SerializationError(`Expected an object type.`);
            }

            for (const [propKey, curType] of Object.entries(type.props)) {
                if (
                    !(propKey in value) &&
                    curType.tag !== Tag.optional &&
                    curType.tag !== Tag.default &&
                    curType.tag !== Tag.undefined
                ) {
                    throw new SerializationError(
                        `Required property '${propKey}' not found`,
                    );
                }
                result[propKey] = await serializeType(curType, value[propKey]);
            }

            return result;
        }
        case Tag.record: {
            if (!isDict(value)) {
                throw new SerializationError("Value is not an object");
            }
            const result: Dict = {};
            for (const [k, v] of Object.entries(value)) {
                const [key, value] = await Promise.all([
                    serializeType(type.key, k) as Promise<string | number>,
                    serializeType(type.value, v),
                ]);
                result[key] = value;
            }

            return result;
        }
        case Tag.default:
            return await serializeType(
                type.of,
                typeof value === "undefined"
                    ? typeof type.value === "function"
                        ? (type.value as () => unknown)()
                        : type.value
                    : value,
            );

        case Tag.custom:
            if (type.serialize) {
                switch (typeof type.serialize) {
                    case "object":
                        return await serializeType(type.serialize, value);
                    case "function":
                        return await type.serialize(value);
                    default:
                        throw new SerializationError(
                            `Unknown Type Serialize argument '${JSON.stringify(type.serialize)}'`,
                        );
                }
            } else return JSON.stringify(value);
    }
}

/**
 * Convert a value from it's JSON serialized version to it's Javascript representation
 * @param type Type to parse the value as
 * @param value JSON value to deserialize
 * @returns Type denoted by the type parameter
 */
export async function deserializeType<T extends TypeTag, R = TagToType<T>>(
    type: T,
    value: unknown,
): Promise<R> {
    switch (type.tag) {
        case Tag.null:
            return null as R;
        case Tag.undefined:
            return undefined as R;
        case Tag.literal:
            if (value !== type.value) {
                throw new DeserializationError(
                    `'${value}' is not equal to literal '${value}'`,
                );
            }
            return value as R;
        case Tag.boolean:
            if (typeof value !== "boolean") {
                throw new DeserializationError(`'${value}' is not a boolean`);
            }
            return value as R;
        case Tag.int:
            if (typeof value !== "number" || !Number.isInteger(value)) {
                throw new DeserializationError(`'${value}' is not an integer`);
            }
            return value as R;
        case Tag.float:
            if (typeof value !== "number" || isNaN(value)) {
                throw new DeserializationError(`'${value}' is not a float`);
            }
            return value as R;
        case Tag.number:
            if (typeof value !== "number" || isNaN(value)) {
                throw new DeserializationError(`'${value}' is not a number`);
            }
            return value as R;
        case Tag.bigint:
            if (typeof value !== "number" || isNaN(value)) {
                throw new DeserializationError(`'${value}' is not a bigint`);
            }
            return BigInt(value) as R;
        case Tag.string:
            if (typeof value !== "string") {
                throw new DeserializationError(`'${value}' is not a string`);
            }
            return value as R;
        case Tag.date:
            if (typeof value !== "number" || isNaN(value)) {
                throw new DeserializationError(
                    `'${value}' is not a date timestamp`,
                );
            }
            return new Date(value) as R;
        case Tag.tuple: {
            if (!Array.isArray(value)) {
                throw new DeserializationError(`'${value}' is not an array`);
            }
            const result: unknown[] = [];
            for (let i = 0; i < value.length; i++) {
                result.push(await deserializeType(type.elements[i], value[i]));
            }
            return result as R;
        }
        case Tag.array: {
            if (!Array.isArray(value)) {
                throw new DeserializationError(`'${value}' is not an array`);
            }
            const promises: Promise<unknown>[] = [];
            for (const item of value) {
                promises.push(deserializeType(type.of, item));
            }
            return (await Promise.all(promises)) as R;
        }
        case Tag.set: {
            if (!Array.isArray(value)) {
                throw new DeserializationError(`'${value}' is not an array`);
            }
            const promises: Promise<unknown>[] = [];
            for (const item of value) {
                promises.push(deserializeType(type.of, item));
            }
            return new Set(await Promise.all(promises)) as R;
        }
        case Tag.optional:
            if (typeof value === "undefined") return undefined as R;
            return deserializeType(type.of, value);
        case Tag.unknown: {
            if (typeof value !== "string") return value as R;
            return JSON.parse(value) as R;
        }
        case Tag.union: {
            for (const opt of type.options) {
                try {
                    return await deserializeType(opt, value);
                } catch {
                    // Pass
                }
            }
            throw new DeserializationError("Value did not match the union");
        }
        case Tag.file: {
            if (
                !value ||
                typeof value !== "object" ||
                !("data" in value) ||
                !("name" in value) ||
                !("type" in value) ||
                typeof value.data !== "string" ||
                typeof value.name !== "string" ||
                typeof value.type !== "string"
            ) {
                throw new DeserializationError(
                    "Value is not a valid file schema",
                );
            }

            const byteCharacters = Buffer.from(
                value.data.replace(/^data:.+;base64,/, ""),
                "base64",
            );

            return new File([byteCharacters], value.name, {
                type: value.type,
            }) as R;
        }
        case Tag.default:
            if (typeof value === "undefined") {
                return type.value as R;
            }
            return deserializeType(type.of, value);
        case Tag.custom:
            if (type.isType(value)) {
                if (type.deserialize) {
                    switch (typeof type.deserialize) {
                        case "object":
                            return await deserializeType(
                                type.deserialize,
                                value,
                            );
                        case "function":
                            return (await type.deserialize(value)) as R;
                        default:
                            throw new DeserializationError(
                                `Unknown Type Deserialize argument '${JSON.stringify(type.deserialize)}'`,
                            );
                    }
                } else {
                    return JSON.parse(String(value)) as R;
                }
            } else {
                throw new DeserializationError("Value is not valid");
            }
        case Tag.object: {
            if (!isDict(value)) {
                throw new DeserializationError("Value is not an object");
            }
            const result: Dict = {};
            for (const [propKey, curType] of Object.entries(type.props)) {
                if (!(propKey in value) && curType.tag !== Tag.optional) {
                    throw new DeserializationError(
                        `Required property '${propKey}' not found`,
                    );
                }
                result[propKey] = await deserializeType(
                    curType,
                    value[propKey],
                );
            }

            return result as R;
        }
        case Tag.record: {
            if (!isDict(value)) {
                throw new DeserializationError("Value is not an object");
            }
            const result: Dict = {};
            for (const [k, v] of Object.entries(value)) {
                const [key, value] = await Promise.all([
                    deserializeType(type.key, k),
                    deserializeType(type.value, v),
                ]);
                result[key] = value;
            }

            return result as R;
        }
        case Tag.discriminatedUnion: {
            if (!isDict(value)) {
                throw new DeserializationError("Value is not an object");
            }
            const result: Dict = {};
            for (const [propKey, curType] of Object.entries(type.base)) {
                if (!(propKey in value) && curType.tag !== Tag.optional) {
                    throw new DeserializationError(
                        `Required property '${propKey}' not found`,
                    );
                }
                result[propKey] = await deserializeType(
                    curType,
                    value[propKey],
                );
            }

            const discValue = value[type.key];
            let found = false;
            for (const opt of type.options) {
                if ((opt[type.key] as LiteralTag)?.value !== discValue) {
                    continue;
                }

                for (const [propKey, curType] of Object.entries(opt)) {
                    if (!(propKey in value) && curType.tag !== Tag.optional) {
                        throw new DeserializationError(
                            `Required property '${propKey}' not found`,
                        );
                    }
                    result[propKey] = await deserializeType(
                        curType,
                        value[propKey],
                    );
                }

                found = true;
                break;
            }

            if (!found) {
                throw new SerializationError(
                    `Did not find option matching discriminator '${discValue}'`,
                );
            }

            return result as R;
        }
    }
}

/**
 * Checks if the given types are exactly equal
 * @param t1 First type to check
 * @param t2 Second type to check
 */
export function isExactType(t1: TypeTag, t2: TypeTag): boolean {
    if (t1.tag !== t2.tag) return false;

    switch (t1.tag) {
        case Tag.literal:
            return t1.value === (t2 as LiteralTag).value;
        case Tag.optional:
        case Tag.default:
        case Tag.set:
        case Tag.array:
            return isExactType(t1.of, (t2 as ArrayTag).of);
        case Tag.union:
            if (t1.options.length !== (t2 as UnionTag).options.length)
                return false;

            for (let i = 0; i < t1.options.length; i++) {
                if (!isExactType(t1.options[i], (t2 as UnionTag).options[i]))
                    return false;
            }
            return true;
        case Tag.tuple: {
            if (t1.elements.length !== (t2 as TupleTag).elements.length)
                return false;

            for (let i = 0; i < t1.elements.length; i++) {
                if (!isExactType(t1.elements[i], (t2 as TupleTag).elements[i]))
                    return false;
            }
            return true;
        }
        case Tag.object:
            if (
                Object.keys(t1.props).length !==
                Object.keys((t2 as ObjectTag).props).length
            )
                return false;

            for (const key in t1.props) {
                if (!(key in (t2 as ObjectTag).props)) return false;
                if (!isExactType(t1.props[key], (t2 as ObjectTag).props[key]))
                    return false;
            }
            return true;
        case Tag.discriminatedUnion:
            return (
                t2.tag === Tag.discriminatedUnion &&
                t1.options.length === t2.options.length &&
                t1.key === t2.key &&
                isExactType(
                    { tag: Tag.object, props: t1.base },
                    { tag: Tag.object, props: t2.base },
                ) &&
                t1.options.every((opt, idx) =>
                    isExactType(
                        { tag: Tag.object, props: opt },
                        { tag: Tag.object, props: t2.options[idx] },
                    ),
                )
            );
        case Tag.record:
            return (
                t2.tag === Tag.record &&
                isExactType(t1.key, t2.key) &&
                isExactType(t1.value, t2.value)
            );
        case Tag.custom:
            // Return true if their reference is the same (not perfect)
            return t1 === t2;
        default:
            // All the primitive types
            return true;
    }
}

/**
 * Checks to see if `test` is a valid subtype of `base`
 * @param base Base type tag
 * @param test Testing type tag
 */
export function isSubtype(base: TypeTag, test: TypeTag): boolean {
    switch (base.tag) {
        case Tag.literal:
            return test.tag === Tag.literal && test.value === base.value;
        case Tag.number:
            return (
                test.tag === base.tag ||
                (test.tag === Tag.literal &&
                    typeof test.value === typeToString(base)) ||
                test.tag === Tag.float ||
                test.tag === Tag.int
            );
        case Tag.boolean:
        case Tag.string:
        case Tag.bigint:
        case Tag.int:
        case Tag.float:
            return (
                test.tag === base.tag ||
                (test.tag === Tag.literal &&
                    typeof test.value === typeToString(base))
            );
        case Tag.unknown:
            return true;

        // Only true if exact matches
        case Tag.date:
        case Tag.file:
        case Tag.undefined:
        case Tag.null:
            return test.tag === base.tag;
        case Tag.optional:
        case Tag.default:
        case Tag.set:
        case Tag.array:
            return test.tag === base.tag && isSubtype(base.of, test.of);
        case Tag.union:
            // Two cases:
            // 1. test is a union, in which case, check that test is a subset of base
            if (test.tag === Tag.union) {
                for (const opt of test.options) {
                    if (!isSubtype(base, opt)) {
                        return false;
                    }
                }
                return true;
            }
            // 2. test is not a union, in which case, check that test is contained in base
            else {
                return base.options.some((o) => isSubtype(o, test));
            }
        case Tag.tuple: {
            // Test type must be a tuple and have the same fields (in the same order), and possibly some extras
            if (test.tag !== Tag.tuple) return false;
            for (let i = 0; i < base.elements.length; i++) {
                if (!isSubtype(base.elements[i], test.elements[i]))
                    return false;
            }
            return true;
        }
        case Tag.object:
            // Ensure that test has a subset of properties of base
            if (test.tag !== Tag.object) return false;

            for (const key in test.props) {
                if (!base.props[key]) return false;
                else if (!isSubtype(base.props[key], test.props[key]))
                    return false;
            }
            return true;
        case Tag.record:
        case Tag.discriminatedUnion:
            return isExactType(base, test);
        case Tag.custom:
            // Return true if their reference is the same (not perfect)
            return base === test;
    }
}

export function isType<T extends TypeTag>(
    type: T,
    value: unknown,
): value is TagToType<T> {
    switch (type.tag) {
        case Tag.literal:
            return value === type.value;
        case Tag.undefined:
            return typeof value === "undefined";
        case Tag.null:
            return value === null;
        case Tag.boolean:
            return typeof value === "boolean";
        case Tag.number:
            return typeof value === "number";
        case Tag.bigint:
            return typeof value === "bigint";
        case Tag.string:
            return typeof value === "string";
        case Tag.unknown:
            return true;
        case Tag.float:
            return typeof value === "number" && !isNaN(value);
        case Tag.int:
            return typeof value === "number" && Number.isInteger(value);
        case Tag.date:
            return value instanceof Date && !isNaN(value.getTime());
        case Tag.tuple:
            return (
                Array.isArray(value) &&
                value.length === type.elements.length &&
                value.every((v, idx) => isType(type.elements[idx], v))
            );
        case Tag.array:
            return (
                Array.isArray(value) && value.every((v) => isType(type.of, v))
            );
        case Tag.set:
            return (
                value instanceof Set &&
                Array.from(value).every((v) => isType(type.of, v))
            );
        case Tag.optional:
        case Tag.default:
            return typeof value === "undefined" || isType(type.of, value);
        case Tag.union:
            return type.options.some((t) => isType(t, value));
        case Tag.file:
            return value instanceof File;
        case Tag.object:
            if (!isDict(value)) {
                return false;
            }
            return Object.keys(type.props).every((key) =>
                isType(type.props[key], value[key]),
            );
        case Tag.discriminatedUnion: {
            if (!isDict(value)) {
                return false;
            }
            if (
                !Object.keys(type.base).every((key) =>
                    isType(type.base[key], value[key]),
                )
            ) {
                return false;
            }
            return true;
        }
        case Tag.record: {
            if (!isDict(value)) return false;
            for (const [k, v] of Object.entries(value)) {
                if (!isType(type.key, k) || !isType(type.value, v)) {
                    return false;
                }
            }
            return true;
        }
        case Tag.custom:
            return type.isType(value);
    }
}

export function parseType<T extends TypeTag>(
    type: T,
    value: unknown,
): ParseResult<TagToType<T>> {
    type Ret = TagToType<T>;
    if (isType(type, value)) {
        switch (type.tag) {
            case Tag.custom:
                if (type.parse) {
                    try {
                        return {
                            success: true,
                            data: type.parse(value),
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: String(error),
                        };
                    }
                }
                break;
            case Tag.default:
                if (typeof value === "undefined") {
                    return {
                        success: true,
                        data: type.value as Ret,
                    };
                }
                return {
                    success: true,
                    data: value as Ret,
                };
            default:
                break;
        }
        return {
            success: true,
            data: value as Ret,
        };
    } else {
        return {
            success: false,
            error: `Value is not a valid '${typeToString(type)}'`,
        };
    }
}

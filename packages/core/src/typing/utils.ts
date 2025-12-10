import { Dict } from "../util-types.js";
import { Tag, TagToType, TypeTag } from "./tag";
import { ParseResult } from "../field";

export function typeToString(type: TypeTag): string {
    switch (type.tag) {
        case Tag.void:
            return "void";
        case Tag.literal:
            return String(type.value);
        case Tag.boolean:
            return "boolean";
        case Tag.number:
            return "number";
        case Tag.bigint:
            return "bigint";
        case Tag.string:
            return "string";
        case Tag.symbol:
            return "symbol";
        case Tag.unknown:
            return "unknown";
        case Tag.date:
            return "Date";
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
    value: TagToType<T>
): Promise<unknown> {
    if (!isType(type, value)) {
        throw new Error(
            `Value not of the proper type, expected type '${typeToString(
                type
            )}', received '${JSON.stringify(value)}'`
        );
    }

    switch (type.tag) {
        case Tag.literal:
        case Tag.boolean:
        case Tag.number:
        case Tag.string:
            return value;
        case Tag.void:
            return undefined;
        case Tag.bigint:
            return Number(value);
        case Tag.symbol:
            return (value as symbol).description;
        case Tag.unknown:
            return JSON.stringify(value);
        case Tag.date:
            return (value as Date).getTime();
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
            throw new Error("Value union could not be serialized");
        case Tag.file: {
            if (!((value as unknown) instanceof File)) {
                throw new Error("Value is not a valid file");
            }

            return {
                data: new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(value);
                }),
                name: value.name,
                type: value.type,
            };
        }
        case Tag.object: {
            const result: Dict = {};
            for (const propKey in type.props) {
                const curType = type.props[propKey];
                if (
                    !(propKey in value) &&
                    curType.tag !== Tag.optional &&
                    curType.tag !== Tag.default &&
                    curType.tag !== Tag.void
                ) {
                    throw new Error(`Required property '${propKey}' not found`);
                }
                result[propKey] = await serializeType(
                    curType,
                    (value as Dict)[propKey]
                );
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
                    : value
            );
        case Tag.custom:
            if (type.serialize) return await type.serialize(value);
            else return JSON.stringify(value);
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
    value: unknown
): Promise<R> {
    switch (type.tag) {
        case Tag.void:
            return undefined as R;
        case Tag.literal:
            if (value !== type.value) {
                throw new Error(
                    `'${value}' is not equal to literal '${value}'`
                );
            }
            return value as R;
        case Tag.boolean:
            if (typeof value !== "boolean") {
                throw new Error(`'${value}' is not a boolean`);
            }
            return value as R;
        case Tag.number:
            if (typeof value !== "number" || isNaN(value)) {
                throw new Error(`'${value}' is not a number`);
            }
            return value as R;
        case Tag.bigint:
            if (typeof value !== "number" || isNaN(value)) {
                throw new Error(`'${value}' is not a bigint`);
            }
            return BigInt(value) as R;
        case Tag.string:
            if (typeof value !== "string") {
                throw new Error(`'${value}' is not a string`);
            }
            return value as R;
        case Tag.symbol:
            if (typeof value !== "string") {
                throw new Error(`'${value}' is not a symbol`);
            }
            return Symbol.for(value) as R;
        case Tag.date:
            if (typeof value !== "number" || isNaN(value)) {
                throw new Error(`'${value}' is not a date timestamp`);
            }
            return new Date(value) as R;
        case Tag.array: {
            if (!Array.isArray(value)) {
                throw new Error(`'${value}' is not an array`);
            }
            const promises: Promise<unknown>[] = [];
            for (const item of value) {
                promises.push(deserializeType(type.of, item));
            }
            return (await Promise.all(promises)) as R;
        }
        case Tag.set: {
            if (!Array.isArray(value)) {
                throw new Error(`'${value}' is not an array`);
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
            throw new Error("Value did not match the union");
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
                throw new Error("Value is not a valid file schema");
            }

            const byteCharacters = Buffer.from(
                value.data.replace(/^data:.+;base64,/, ""),
                "base64"
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
                    return (await type.deserialize(value)) as R;
                } else {
                    return JSON.parse(String(value)) as R;
                }
            } else {
                throw new Error("Value is not valid");
            }
        case Tag.object: {
            if (!value || typeof value !== "object") {
                throw new Error("Value is not an object");
            }
            const result: Dict = {};
            for (const propKey in type.props) {
                const curType = type.props[propKey];
                if (!(propKey in value) && curType.tag !== Tag.optional) {
                    throw new Error(`Required property '${propKey}' not found`);
                }
                result[propKey] = await deserializeType(
                    curType,
                    (value as Dict)[propKey]
                );
            }

            return result as R;
        }
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
        case Tag.boolean:
        case Tag.number:
        case Tag.symbol:
        case Tag.string:
        case Tag.bigint:
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
        case Tag.void:
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

        case Tag.object:
            // Ensure that test has a subset of properties of base
            if (test.tag !== Tag.object) return false;

            for (const key in test.props) {
                if (!base.props[key]) return false;
                else if (!isSubtype(base.props[key], test.props[key]))
                    return false;
            }
            return true;
        case Tag.custom:
            // Return true if their reference is the same (not perfect)
            return base === test;
    }
}

export function isType<T extends TypeTag>(
    type: T,
    value: unknown
): value is TagToType<T> {
    switch (type.tag) {
        case Tag.void:
            return typeof value === "undefined";
        case Tag.literal:
            return value === type.value;
        case Tag.boolean:
            return typeof value === "boolean";
        case Tag.number:
            return typeof value === "number";
        case Tag.bigint:
            return typeof value === "bigint";
        case Tag.string:
            return typeof value === "string";
        case Tag.symbol:
            return typeof value === "symbol";
        case Tag.unknown:
            return true;
        case Tag.date:
            return value instanceof Date && !isNaN(value.getTime());
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
            if (!value || typeof value !== "object") {
                return false;
            }
            return Object.keys(type.props).every((key) =>
                isType(type.props[key], (value as Dict)[key])
            );
        case Tag.custom:
            return type.isType(value);
    }
}

export function parseType<T extends TypeTag>(
    type: T,
    value: unknown
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

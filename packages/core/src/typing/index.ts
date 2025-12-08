import { Dict, Literable, Promisable } from "../util-types.js";

export const enum Tag {
    string,
    number,
    date,
    boolean,
    literal,
    symbol,
    bigint,
    array,
    set,
    union,
    optional,
    file,
    unknown,
    void,
    default,
    object,
    custom,
}

function tagToString(tag: Tag) {
    switch (tag) {
        case Tag.string:
            return "string";
        case Tag.number:
            return "number";
        case Tag.boolean:
            return "boolean";
        case Tag.bigint:
            return "bigint";
        case Tag.symbol:
            return "symbol";
        case Tag.void:
            return "undefined";
        default:
            return "object";
    }
}

function base64ToFile(
    base64String: string,
    mimeType: string,
    fileName: string
): File {
    const base64Data = base64String.replace(/^data:.+;base64,/, "");
    const byteCharacters = atob(base64Data);
    const byteNumbers = Array.from<number>({ length: byteCharacters.length });

    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: mimeType });
}

export interface VoidTag {
    tag: Tag.void;
}
export interface StringTag {
    tag: Tag.string;
}
export interface NumberTag {
    tag: Tag.number;
}
export interface DateTag {
    tag: Tag.date;
}
export interface BooleanTag {
    tag: Tag.boolean;
}
export interface SymbolTag {
    tag: Tag.symbol;
}
export interface BigIntTag {
    tag: Tag.bigint;
}

export interface UnknownTag {
    tag: Tag.unknown;
}

export interface FileTag {
    tag: Tag.file;
}

export interface LiteralTag<V = unknown> {
    tag: Tag.literal;
    value: V;
}

export interface ArrayTag<V extends TypeTag = TypeTag> {
    tag: Tag.array;
    of: V;
}

export interface SetTag<V extends TypeTag = TypeTag> {
    tag: Tag.set;
    of: V;
}

export interface OptionalTag<V extends TypeTag = TypeTag> {
    tag: Tag.optional;
    of: V;
}

export interface UnionTag<V extends TypeTag[] = TypeTag[]> {
    tag: Tag.union;
    options: V;
}

export interface ObjectTag<
    P extends Record<string, TypeTag> = Record<string, TypeTag>
> {
    tag: Tag.object;
    props: P;
}

export interface DefaultTag<T extends TypeTag = TypeTag> {
    tag: Tag.default;
    of: T;
    value: unknown;
}

export interface CustomTag<V = any, PR = any> {
    tag: Tag.custom;
    isType: (test: unknown) => boolean;
    parse?: (test: unknown) => PR;
    serialize?: (value: V) => Promisable<unknown>;
    deserialize?: (value: unknown) => Promisable<V>;
}

export type TypeTag =
    | VoidTag
    | LiteralTag
    | StringTag
    | NumberTag
    | DateTag
    | BooleanTag
    | SymbolTag
    | UnknownTag
    | FileTag
    | BigIntTag
    | SetTag
    | OptionalTag
    | UnionTag
    | ArrayTag
    | ObjectTag
    | CustomTag
    | DefaultTag;

export type TagToType<T extends TypeTag> = T extends StringTag
    ? string
    : T extends NumberTag
    ? number
    : T extends BooleanTag
    ? boolean
    : T extends LiteralTag<infer V>
    ? V
    : T extends DateTag
    ? Date
    : T extends SymbolTag
    ? symbol
    : T extends UnknownTag
    ? unknown
    : T extends FileTag
    ? File
    : T extends BigIntTag
    ? bigint
    : T extends SetTag<infer V>
    ? Set<TagToType<V>>
    : T extends OptionalTag<infer V>
    ? V | undefined
    : T extends UnionTag<infer V>
    ? TagToType<V[number]>
    : T extends ArrayTag<infer V>
    ? TagToType<V>[]
    : T extends ObjectTag<infer P>
    ? { [K in keyof P]: TagToType<P[K]> }
    : T extends DefaultTag<infer V>
    ? V | undefined
    : T extends CustomTag<infer V>
    ? V
    : never;

interface TypeCache
    extends Partial<{
        [Tag.string]: StringTag;
        [Tag.number]: NumberTag;
        [Tag.boolean]: BooleanTag;
        [Tag.bigint]: BigIntTag;
        [Tag.symbol]: SymbolTag;
        [Tag.void]: VoidTag;
        [Tag.file]: FileTag;
        [Tag.date]: DateTag;
        [Tag.unknown]: UnknownTag;
    }> {}

export class Type {
    private static cache: TypeCache = {};
    private static getFromCache<K extends keyof TypeCache>(
        tag: K
    ): NonNullable<TypeCache[K]> {
        const v = this.cache[tag];
        if (!v) {
            return (this.cache[tag] = { tag } as TypeCache[K])!;
        }
        return v;
    }

    static String() {
        return this.getFromCache(Tag.string);
    }
    static Number() {
        return this.getFromCache(Tag.number);
    }
    static Boolean() {
        return this.getFromCache(Tag.boolean);
    }
    static BigInt() {
        return this.getFromCache(Tag.bigint);
    }
    static Symbol() {
        return this.getFromCache(Tag.symbol);
    }

    static Void() {
        return this.getFromCache(Tag.void);
    }
    static File() {
        return this.getFromCache(Tag.file);
    }
    static Date() {
        return this.getFromCache(Tag.date);
    }
    static Unknown() {
        return this.getFromCache(Tag.unknown);
    }

    static Literal<const V extends Literable>(value: V): LiteralTag<V> {
        return {
            tag: Tag.literal,
            value,
        };
    }

    static Array<V extends TypeTag>(element: V): ArrayTag<V> {
        return {
            tag: Tag.array,
            of: element,
        };
    }

    static Default<V extends TypeTag>(
        of: V,
        // Too much effort has been put into this not being unknown
        value: unknown
    ): DefaultTag<V> {
        return {
            tag: Tag.default,
            of,
            value: value as TagToType<V>,
        };
    }

    static Set<V extends TypeTag>(element: V): SetTag<V> {
        return {
            tag: Tag.set,
            of: element,
        };
    }

    static Union<const V extends TypeTag[]>(types: V): UnionTag<V> {
        return {
            tag: Tag.union,
            options: types,
        };
    }

    static Optional<V extends TypeTag>(type: V): OptionalTag<V> {
        return {
            tag: Tag.optional,
            of: type,
        };
    }

    static Object<R extends Record<string, TypeTag>>(props: R): ObjectTag<R> {
        return {
            tag: Tag.object,
            props,
        };
    }

    static Custom<V>(opts: Omit<CustomTag<V>, "tag">): CustomTag<V> {
        return {
            tag: Tag.custom,
            ...opts,
        };
    }

    /**
     * Serialize's a type into JSON
     * @param type Type
     * @param value Value to serialize
     */
    static async serialize(type: TypeTag, value: unknown): Promise<unknown> {
        if (!Type.is(type, value))
            throw new Error(
                `Value not of the proper type, expected type '${Type.toString(
                    type
                )}', received '${JSON.stringify(value)}'`
            );

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
                    promises.push(Type.serialize(type.of, element));
                }
                return await Promise.all(promises);
            }
            case Tag.set: {
                const promises: Promise<unknown>[] = [];
                for (const element of (value as Set<unknown>).keys()) {
                    promises.push(Type.serialize(type.of, element));
                }
                return await Promise.all(promises);
            }
            case Tag.optional:
                if (typeof value === "undefined") return undefined;
                return await Type.serialize(type.of, value);
            case Tag.union:
                for (const opt of type.options) {
                    try {
                        return await Type.serialize(opt, value);
                    } catch {
                        // Pass
                    }
                }
                throw new Error("Value union could not be serialized");
            case Tag.file: {
                if (!(value instanceof File)) {
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
                if (!value || typeof value !== "object") {
                    throw new Error("Value is not an object");
                }
                const result: Dict = {};
                for (const propKey in type.props) {
                    const curType = type.props[propKey];
                    if (!(propKey in value) && curType.tag !== Tag.optional) {
                        throw new Error(
                            `Required property '${propKey}' not found`
                        );
                    }
                    result[propKey] = await this.serialize(
                        curType,
                        (value as Dict)[propKey]
                    );
                }

                return result;
            }
            case Tag.default:
                return this.serialize(type.of, value);
            case Tag.custom:
                if (type.serialize) return await type.serialize(value);
                else return JSON.stringify(value);
        }
    }

    static async deserialize<T extends TypeTag>(
        type: T,
        value: unknown
    ): Promise<unknown> {
        switch (type.tag) {
            case Tag.void:
                return undefined;
            case Tag.literal:
                if (value !== type.value) {
                    throw new Error(
                        `'${value}' is not equal to literal '${value}'`
                    );
                }
                return value;
            case Tag.boolean:
                if (typeof value !== "boolean") {
                    throw new Error(`'${value}' is not a boolean`);
                }
                return value;
            case Tag.number:
                if (typeof value !== "number") {
                    throw new Error(`'${value}' is not a number`);
                }
                return value;
            case Tag.bigint:
                if (typeof value !== "number") {
                    throw new Error(`'${value}' is not a bigint`);
                }
                return BigInt(value);
            case Tag.string:
                if (typeof value !== "string") {
                    throw new Error(`'${value}' is not a string`);
                }
                return value;
            case Tag.symbol:
                if (typeof value !== "string") {
                    throw new Error(`'${value}' is not a symbol`);
                }
                return Symbol.for(value);
            case Tag.date:
                if (typeof value !== "number") {
                    throw new Error(`'${value}' is not a date timestamp`);
                }
                return new Date(value);
            case Tag.array: {
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                const promises: Promise<unknown>[] = [];
                for (const item of value) {
                    promises.push(Type.deserialize(type.of, item));
                }
                return await Promise.all(promises);
            }
            case Tag.set: {
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                const promises: Promise<unknown>[] = [];
                for (const item of value) {
                    promises.push(Type.deserialize(type.of, item));
                }
                return new Set(await Promise.all(promises));
            }
            case Tag.optional:
                return Type.deserialize(type.of, value);
            case Tag.unknown: {
                if (typeof value !== "string") return value;
                return JSON.parse(value);
            }
            case Tag.union: {
                for (const opt of type.options) {
                    try {
                        return await Type.deserialize(opt, value);
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
                return base64ToFile(value.data, value.type, value.name);
            }
            case Tag.default:
                if (typeof value === "undefined") {
                    return type.value;
                }
                return this.deserialize(type.of, value);
            case Tag.custom:
                if (type.isType(value)) {
                    if (type.deserialize) {
                        return await type.deserialize(value);
                    } else {
                        return JSON.parse(String(value));
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
                        throw new Error(
                            `Required property '${propKey}' not found`
                        );
                    }
                    result[propKey] = await this.deserialize(
                        curType,
                        (value as Dict)[propKey]
                    );
                }

                return result;
            }
        }
    }

    /**
     * Checks to see if `test` is a valid subtype of `base`
     * @param base Base type tag
     * @param test Testing type tag
     */
    static isSubtype(base: TypeTag, test: TypeTag): boolean {
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
                        typeof test.value === tagToString(base.tag))
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
                return (
                    test.tag === base.tag && this.isSubtype(base.of, test.of)
                );
            case Tag.union:
                // Two cases:
                // 1. test is a union, in which case, check that test is a subset of base
                if (test.tag === Tag.union) {
                    for (const opt of test.options) {
                        if (!this.isSubtype(base, opt)) {
                            return false;
                        }
                    }
                    return true;
                }
                // 2. test is not a union, in which case, check that test is contained in base
                else {
                    return base.options.some((o) => Type.isSubtype(o, test));
                }

            case Tag.object:
                // Ensure that test has a subset of properties of base
                if (test.tag !== Tag.object) return false;

                for (const key in test.props) {
                    if (!base.props[key]) return false;
                    else if (!this.isSubtype(base.props[key], test.props[key]))
                        return false;
                }
                return true;
            case Tag.custom:
                // Return true if their reference is the same (not perfect)
                return base === test;
        }
    }

    static is<T extends TypeTag>(type: T, value: unknown): boolean {
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
                    Array.isArray(value) &&
                    value.every((v) => Type.is(type.of, v))
                );
            case Tag.set:
                return (
                    value instanceof Set &&
                    Array.from(value).every((v) => Type.is(type.of, v))
                );
            case Tag.optional:
                return typeof value === "undefined" || this.is(type.of, value);
            case Tag.union:
                return type.options.some((t) => Type.is(t, value));
            case Tag.file:
                return value instanceof File;
            case Tag.object:
                if (!value || typeof value !== "object") {
                    return false;
                }
                return Object.keys(type.props).every((key) =>
                    Type.is(type.props[key], (value as Dict)[key])
                );
            case Tag.default:
                return this.is(type.of, value);
            case Tag.custom:
                return type.isType(value);
        }
    }

    static toString(type: TypeTag): string {
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
                return `Array<${this.toString(type.of)}>`;
            case Tag.set:
                return `Set<${this.toString(type.of)}>`;
            case Tag.default:
            case Tag.optional:
                return `${this.toString(type.of)} | undefined`;
            case Tag.union:
                return `Union<${type.options
                    .map((o) => Type.toString(o))
                    .join(", ")}>`;
            case Tag.file:
                return "File";
            case Tag.object:
                return `{${Object.keys(type.props)
                    .map((k) => `${k}: ${Type.toString(type.props[k])}`)
                    .join(",\n")}}`;
            case Tag.custom:
                return "custom";
        }
    }
}

import { Dict, Literable, Promisable } from "../util-types.js";

const enum Tag {
    string,
    number,
    boolean,
    literal,
    date,
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

export interface DefaultTag<V extends TypeTag = TypeTag> {
    tag: Tag.default;
    of: V;
}

export interface CustomTag<V = any> {
    tag: Tag.custom;
    isType: (test: unknown) => boolean;
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
    | DefaultTag
    | CustomTag;

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

export class Type {
    static readonly String: StringTag = {
        tag: Tag.string,
    };
    static readonly Number: NumberTag = {
        tag: Tag.number,
    };
    static readonly Boolean: BooleanTag = {
        tag: Tag.boolean,
    };
    static readonly BigInt: BigIntTag = {
        tag: Tag.bigint,
    };
    static readonly Symbol: SymbolTag = {
        tag: Tag.symbol,
    };

    static readonly Void: VoidTag = {
        tag: Tag.void,
    };

    static readonly File: FileTag = {
        tag: Tag.file,
    };

    static readonly Date: DateTag = { tag: Tag.date };

    static readonly Unknown: UnknownTag = { tag: Tag.unknown };

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

    static Custom<V>({
        isType,
        serialize,
        deserialize,
    }: {
        isType: (test: unknown) => boolean;
        serialize?: (value: V) => Promisable<unknown>;
        deserialize?: (value: unknown) => Promisable<V>;
    }): CustomTag<V> {
        return {
            tag: Tag.custom,
            isType,
            serialize,
            deserialize,
        };
    }

    /**
     * Serialize's a type into JSON
     * @param type Type
     * @param value Value to serialize
     */
    static async serialize(type: TypeTag, value: unknown): Promise<unknown> {
        switch (type.tag) {
            case Tag.literal:
            case Tag.boolean:
            case Tag.number:
            case Tag.bigint:
            case Tag.string:
            case Tag.void:
                return value;
            case Tag.symbol:
                return (value as symbol).description;
            case Tag.unknown:
                return JSON.stringify(value);
            case Tag.date:
                return (value as Date).getTime();
            case Tag.array: {
                const result: unknown[] = [];
                for (const element of value as unknown[]) {
                    result.push(await Type.serialize(type.of, element));
                }
                return result;
            }
            case Tag.set: {
                const result = new Set<unknown>();
                for (const element of value as unknown[]) {
                    result.add(await Type.serialize(type.of, element));
                }
                return result;
            }
            case Tag.optional:
                if (typeof value === "undefined") return null;
                return await Type.serialize(type.of, value);
            case Tag.union:
                for (const opt of type.options) {
                    if (Type.is(opt, value)) {
                        return await Type.serialize(opt, value);
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
                if (typeof value !== typeof type.value) {
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
                if (!(value instanceof Date)) {
                    throw new Error(`'${value}' is not a date`);
                }
                return value;
            case Tag.array:
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                return value;
            case Tag.set:
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                return new Set(value);
            case Tag.optional:
                return Type.deserialize(type.of, value);
            case Tag.unknown: {
                return JSON.parse(value as string);
            }
            case Tag.union: {
                let result: any = undefined;
                let hadValid = false;
                for (const opt of type.options) {
                    try {
                        result = Type.deserialize(opt, value);
                        hadValid = true;
                    } catch {
                        hadValid = false;
                    }

                    if (hadValid) break;
                }
                if (!hadValid) {
                    throw new Error("Value did not match the union");
                }
                return result;
            }
            case Tag.file: {
                if (
                    !value ||
                    typeof value !== "object" ||
                    !("data" in value) ||
                    !("name" in value) ||
                    typeof value.data !== "string" ||
                    typeof value.name !== "string"
                ) {
                    throw new Error("Value is not a valid file schema");
                }
                const response = await fetch(value.data);
                return new File([await response.blob()], value.name);
            }
            case Tag.default:
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
                return value instanceof Date;
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

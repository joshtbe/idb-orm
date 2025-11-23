import { Dict, Promisable } from "../util-types.js";

const enum TypeLabel {
    string,
    number,
    boolean,
    date,
    symbol,
    bigint,
    array,
    set,
    union,
    optional,
    file,
    unknown,
    default,
    object,
    custom,
}
export interface StringTag {
    tag: TypeLabel.string;
}
export interface NumberTag {
    tag: TypeLabel.number;
}
export interface DateTag {
    tag: TypeLabel.date;
}

interface BooleanTag {
    tag: TypeLabel.boolean;
}

interface SymbolTag {
    tag: TypeLabel.symbol;
}

interface BigIntTag {
    tag: TypeLabel.bigint;
}

interface UnknownTag {
    tag: TypeLabel.unknown;
}

interface FileTag {
    tag: TypeLabel.file;
}

interface ArrayTag<V extends TypeTag = TypeTag> {
    tag: TypeLabel.array;
    of: V;
}

interface SetTag<V extends TypeTag = TypeTag> {
    tag: TypeLabel.set;
    of: V;
}

interface OptionalTag<V extends TypeTag = TypeTag> {
    tag: TypeLabel.optional;
    of: V;
}

interface UnionTag<V extends TypeTag[] = TypeTag[]> {
    tag: TypeLabel.union;
    options: V;
}

interface ObjectTag<
    P extends Record<string, TypeTag> = Record<string, TypeTag>
> {
    tag: TypeLabel.object;
    props: P;
}

interface DefaultTag<V extends TypeTag = TypeTag> {
    tag: TypeLabel.default;
    of: V;
}

interface CustomTag<V = any> {
    tag: TypeLabel.custom;
    isType: (test: unknown) => boolean;
    serialize?: (value: V) => Promisable<unknown>;
    deserialize?: (value: unknown) => Promisable<V>;
}

export type TypeTag =
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

export class Type {
    static readonly String: StringTag = {
        tag: TypeLabel.string,
    };
    static readonly Number: NumberTag = {
        tag: TypeLabel.number,
    };
    static readonly Boolean: BooleanTag = {
        tag: TypeLabel.boolean,
    };
    static readonly BigInt: BigIntTag = {
        tag: TypeLabel.bigint,
    };
    static readonly Symbol: SymbolTag = {
        tag: TypeLabel.symbol,
    };

    static readonly File: FileTag = {
        tag: TypeLabel.file,
    };

    static readonly Date: DateTag = { tag: TypeLabel.date };

    static readonly Unknown: UnknownTag = { tag: TypeLabel.unknown };

    static Array<V extends TypeTag>(element: V): ArrayTag<V> {
        return {
            tag: TypeLabel.array,
            of: element,
        };
    }

    static Set<V extends TypeTag>(element: V): SetTag<V> {
        return {
            tag: TypeLabel.set,
            of: element,
        };
    }

    static Union<const V extends TypeTag[]>(types: V): UnionTag<V> {
        return {
            tag: TypeLabel.union,
            options: types,
        };
    }

    static Optional<V extends TypeTag>(type: V): OptionalTag<V> {
        return {
            tag: TypeLabel.optional,
            of: type,
        };
    }

    static Object<R extends Record<string, TypeTag>>(props: R): ObjectTag<R> {
        return {
            tag: TypeLabel.object,
            props,
        };
    }

    static Custom<V>({
        isType,
        serialize,
        deserialize,
    }: {
        isType: (test: unknown) => boolean;
        serialize?: (value: V) => unknown;
        deserialize?: (value: unknown) => V;
    }): CustomTag<V> {
        return {
            tag: TypeLabel.custom,
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
            case TypeLabel.boolean:
            case TypeLabel.number:
            case TypeLabel.bigint:
            case TypeLabel.string:
                return value;
            case TypeLabel.symbol:
                return (value as symbol).description;
            case TypeLabel.unknown:
                return JSON.stringify(value);
            case TypeLabel.date:
                return (value as Date).getTime();
            case TypeLabel.array: {
                const result: unknown[] = [];
                for (const element of value as unknown[]) {
                    result.push(await Type.serialize(type.of, element));
                }
                return result;
            }
            case TypeLabel.set: {
                const result = new Set<unknown>();
                for (const element of value as unknown[]) {
                    result.add(await Type.serialize(type.of, element));
                }
                return result;
            }
            case TypeLabel.optional:
                return await Type.serialize(type.of, value);
            case TypeLabel.union:
                for (const opt of type.options) {
                    if (Type.is(opt, value)) {
                        return await Type.serialize(opt, value);
                    }
                }
                throw new Error("Value union could not be serialized");
            case TypeLabel.file: {
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
            case TypeLabel.object: {
                if (!value || typeof value !== "object") {
                    throw new Error("Value is not an object");
                }
                const result: Dict = {};
                for (const propKey in type.props) {
                    const curType = type.props[propKey];
                    if (
                        !(propKey in value) &&
                        curType.tag !== TypeLabel.optional
                    ) {
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
            case TypeLabel.default:
                return this.serialize(type.of, value);
            case TypeLabel.custom:
                if (type.serialize) return await type.serialize(value);
                else return JSON.stringify(value);
        }
    }

    static async deserialize<T extends TypeTag>(
        type: T,
        value: unknown
    ): Promise<unknown> {
        switch (type.tag) {
            case TypeLabel.boolean:
                if (typeof value !== "boolean") {
                    throw new Error(`'${value}' is not a boolean`);
                }
                return value;
            case TypeLabel.number:
                if (typeof value !== "number") {
                    throw new Error(`'${value}' is not a number`);
                }
                return value;
            case TypeLabel.bigint:
                if (typeof value !== "number") {
                    throw new Error(`'${value}' is not a bigint`);
                }
                return BigInt(value);
            case TypeLabel.string:
                if (typeof value !== "string") {
                    throw new Error(`'${value}' is not a string`);
                }
                return value;
            case TypeLabel.symbol:
                if (typeof value !== "string") {
                    throw new Error(`'${value}' is not a symbol`);
                }
                return Symbol.for(value);
            case TypeLabel.date:
                if (!(value instanceof Date)) {
                    throw new Error(`'${value}' is not a date`);
                }
                return value;
            case TypeLabel.array:
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                return value;
            case TypeLabel.set:
                if (!Array.isArray(value)) {
                    throw new Error(`'${value}' is not an array`);
                }
                return new Set(value);
            case TypeLabel.optional:
                return Type.deserialize(type.of, value);
            case TypeLabel.unknown: {
                return JSON.parse(value as string);
            }
            case TypeLabel.union: {
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
            case TypeLabel.file: {
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
            case TypeLabel.default:
                return this.deserialize(type.of, value);
            case TypeLabel.custom:
                if (type.isType(value)) {
                    if (type.deserialize) {
                        return await type.deserialize(value);
                    } else {
                        return JSON.parse(String(value));
                    }
                } else {
                    throw new Error("Value is not valid");
                }
            case TypeLabel.object: {
                if (!value || typeof value !== "object") {
                    throw new Error("Value is not an object");
                }
                const result: Dict = {};
                for (const propKey in type.props) {
                    const curType = type.props[propKey];
                    if (
                        !(propKey in value) &&
                        curType.tag !== TypeLabel.optional
                    ) {
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

    static is<T extends TypeTag>(type: T, value: unknown): boolean {
        switch (type.tag) {
            case TypeLabel.boolean:
                return typeof value === "boolean";
            case TypeLabel.number:
                return typeof value === "number";
            case TypeLabel.bigint:
                return typeof value === "bigint";
            case TypeLabel.string:
                return typeof value === "string";
            case TypeLabel.symbol:
                return typeof value === "symbol";
            case TypeLabel.unknown:
                return true;
            case TypeLabel.date:
                return value instanceof Date;
            case TypeLabel.array:
                return (
                    Array.isArray(value) &&
                    value.every((v) => Type.is(type.of, v))
                );
            case TypeLabel.set:
                return (
                    value instanceof Set &&
                    Array.from(value).every((v) => Type.is(type.of, v))
                );
            case TypeLabel.optional:
                return typeof value === "undefined" || this.is(type.of, value);
            case TypeLabel.union:
                return type.options.some((t) => Type.is(t, value));
            case TypeLabel.file:
                return value instanceof File;
            case TypeLabel.object:
                if (!value || typeof value !== "object") {
                    return false;
                }
                return Object.keys(type.props).every((key) =>
                    Type.is(type.props[key], (value as Dict)[key])
                );
            case TypeLabel.default:
                return this.is(type.of, value);
            case TypeLabel.custom:
                return type.isType(value);
        }
    }
}

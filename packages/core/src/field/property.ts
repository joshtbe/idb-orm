import { Literable, NoUndefined, Promisable } from "../util-types.js";
import {
    FunctionMatch,
    PropertyUnion,
    ReferenceActions,
    RelationOptions,
    ValidKeyType,
    StringValidKeyType,
} from "./field-types.js";
import PrimaryKey from "./primary-key.js";
import { Relation } from "./relation.js";
import { Type, TypeTag } from "./type-wrapper.js";
import { VALIDATORS } from "./validators.js";

export interface PropertyOptions {
    unique: boolean;
}

export type PropertyInputOptions = Partial<PropertyOptions>;

export interface CustomPropertyOptions<T> extends PropertyInputOptions {
    serialize?: (value: T) => Promisable<unknown>;
    deserialize?: (value: unknown) => Promisable<T>;
}

export type ParseResult<T> =
    | {
          success: true;
          data: T;
          error?: undefined;
      }
    | { success: false; data?: undefined; error: string };

/**
 * A function to parse and validate an unknown value. It should also handle applying defaults
 */
export type ParseFn<T> = (value: unknown) => ParseResult<T>;

const PROPERTY_SYMBOL = Symbol.for("property");

export class Property<Value, HasDefault extends boolean> {
    readonly symbol = PROPERTY_SYMBOL;
    protected hasDefault: HasDefault = false as HasDefault;
    protected options: PropertyOptions;

    constructor(
        protected parseFn: (value: unknown) => ParseResult<Value>,
        protected type: TypeTag,
        options?: PropertyInputOptions
    ) {
        this.options = {
            unique: options?.unique ?? false,
        };
    }

    get parse() {
        return this.parseFn;
    }

    getType() {
        return this.type;
    }

    /**
     * @deprecated This functionality does not work yet
     *
     * Indicates that a field must be unique across all documents
     *
     * **NOTE**: The field type must be a primitive. If this is applied to a non-primitive, it returns `null`
     */
    unique() {
        switch (this.type) {
            case Type.Boolean:
            case Type.String:
            case Type.Number:
            case Type.Symbol:
                this.options.unique = true;
                return this;
            default:
                throw new Error("A non-primitive cannot be a unique value");
        }
    }

    hasDefaultValue() {
        return this.hasDefault;
    }

    static relation<To extends string, const Name extends string = never>(
        to: To,
        options?: RelationOptions<Name, ReferenceActions>
    ) {
        return new Relation<To, Name>(to, options);
    }

    static primaryKey<V extends StringValidKeyType = "number">(
        type: V = "number" as V
    ): PrimaryKey<false, FunctionMatch<V>> {
        return new PrimaryKey<false, FunctionMatch<V>>(
            this.nameToType(type) as ValidKeyType
        );
    }

    public static nameToType(typeName: string): TypeTag {
        switch (typeName) {
            case "boolean":
                return Type.Boolean;
            case "bigint":
                return Type.BigInt;
            case "number":
                return Type.Number;
            case "string":
                return Type.Number;
            case "symbol":
                return Type.Symbol;
            default:
                return Type.Unknown;
        }
    }

    public static is(value: any): value is Property<any, any> {
        return typeof value === "object" && value?.symbol === PROPERTY_SYMBOL;
    }

    array(): Property<Value[], false> {
        return new Property<Value[], false>(
            Property.generateArrayValidator(this.parseFn),
            Type.Array(this.type),
            this.options
        );
    }

    default(
        defaultValue: NoUndefined<Value> | (() => NoUndefined<Value>)
    ): Property<NoUndefined<Value>, true> {
        const newFn: ParseFn<NoUndefined<Value>> = (value: unknown) => {
            if (value == null) {
                return {
                    success: true,
                    data:
                        typeof defaultValue === "function"
                            ? (defaultValue as () => NoUndefined<Value>)()
                            : defaultValue,
                };
            } else
                return this.parseFn(value) as ParseResult<NoUndefined<Value>>;
        };
        this.hasDefault = true as HasDefault;
        return new Property(newFn, this.type, this.options);
    }

    optional(): Property<Value | undefined, false> {
        const newFn: ParseFn<Value | undefined> = (value) => {
            if (value == null) {
                return {
                    success: true,
                    data: undefined,
                };
            }
            return this.parseFn(value);
        };
        return new Property(newFn, this.type, this.options);
    }

    static array<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions
    ): Property<T[], false> {
        return new Property(
            this.generateArrayValidator(item.parseFn),
            Type.Array(item.type),
            options
        );
    }

    static boolean(options?: PropertyInputOptions): Property<boolean, false> {
        return new Property(
            (test) => {
                if (typeof test === "boolean") {
                    return {
                        success: true,
                        data: test,
                    };
                } else
                    return {
                        success: false,
                        error: "Value is not a string",
                    };
            },
            Type.Boolean,
            options
        );
    }

    static custom<T>(
        fn: ParseFn<T>,
        options?: CustomPropertyOptions<T>
    ): Property<T, false> {
        return new Property(
            fn,
            Type.Custom({
                isType: (test) => fn(test).success,
                serialize: options?.serialize,
                deserialize: options?.deserialize,
            }),
            options
        );
    }

    static date(options?: PropertyInputOptions): Property<Date, false> {
        return new Property(VALIDATORS[Type.Date.tag], Type.Date, options);
    }

    static file(options?: PropertyInputOptions): Property<File, false> {
        return new Property(VALIDATORS[Type.File.tag], Type.File, options);
    }

    static literal<const V extends Literable>(
        value: V,
        options?: PropertyInputOptions
    ): Property<V, false> {
        return new Property(
            (test): ParseResult<V> => {
                if (test === value) {
                    return {
                        success: true,
                        data: value,
                    };
                }
                return {
                    success: false,
                    error: `${test} !== ${value}`,
                };
            },
            Type.Literal(value),
            options
        );
    }

    static number(options?: PropertyInputOptions): Property<number, false> {
        return new Property(VALIDATORS[Type.Number.tag], Type.Number, options);
    }

    static string(options?: PropertyInputOptions): Property<string, false> {
        return new Property(VALIDATORS[Type.String.tag], Type.String, options);
    }

    static set<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions
    ): Property<Set<T>, false> {
        return new Property(
            (items: unknown): ParseResult<Set<T>> => {
                if (items instanceof Set) {
                    const resultData = new Set<T>();
                    for (const element of items) {
                        const result = item.parseFn(element);
                        if (!result.success) {
                            return result;
                        } else {
                            resultData.add(result.data);
                        }
                    }
                    return {
                        success: true,
                        data: resultData,
                    };
                } else {
                    return {
                        success: false,
                        error: "Value is not an array",
                    };
                }
            },
            Type.Set(item.type),
            options
        );
    }

    static union<const T extends readonly Property<any, boolean>[]>(
        items: T,
        options?: PropertyInputOptions
    ): Property<PropertyUnion<T>, false> {
        const functions: ParseFn<T[number]>[] = items.map((i) => i.parse);
        return new Property<PropertyUnion<T>, false>(
            ((test) => {
                for (const fn of functions) {
                    const result = fn(test);
                    if (result.success) {
                        return result;
                    }
                }
                return {
                    success: false,
                    error: "Value did not match any of the items",
                };
            }) as ParseFn<PropertyUnion<T>>,
            Type.Union(items.map((i) => i.getType())),
            options
        );
    }

    private static generateArrayValidator<T>(fn: ParseFn<T>) {
        return (items: unknown): ParseResult<T[]> => {
            if (Array.isArray(items)) {
                const resultData: T[] = [];
                for (const item of items) {
                    const result = fn(item);
                    if (!result.success) {
                        return result;
                    } else {
                        resultData.push(result.data);
                    }
                }
                return {
                    success: true,
                    data: resultData,
                };
            } else {
                return {
                    success: false,
                    error: "Value is not an array",
                };
            }
        };
    }
}

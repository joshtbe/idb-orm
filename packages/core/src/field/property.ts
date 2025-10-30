import { Literable, ValidKeyType } from "../types/common.js";
import {
    FunctionMatch,
    ReferenceActions,
    RelationOptions,
} from "./field-types.js";
import PrimaryKey from "./primary-key.js";
import { Relation } from "./relation.js";

export interface PropertyOptions {
    unique: boolean;
}

type InputOptions = Partial<PropertyOptions>;

enum PropertType {
    String,
    Number,
    BigInt,
    Boolean,
    Symbol,
    Array,
    Object,
    Unknown,
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

export abstract class AbstractProperty<Value, HasDefault extends boolean> {
    protected hasDefault: HasDefault = false as HasDefault;
    protected options: PropertyOptions;

    constructor(
        public readonly validate: (value: unknown) => ParseResult<Value>,
        protected type: PropertType,
        options?: InputOptions
    ) {
        this.options = {
            unique: options?.unique ?? false,
        };
    }

    abstract array(...args: unknown[]): AbstractProperty<Value[], false>;

    abstract optional(
        ...args: unknown[]
    ): AbstractProperty<Value | undefined, false>;

    abstract default(
        defaultValue: Value
    ): AbstractProperty<Exclude<Value, undefined>, true>;

    /* "abstract" static methods */

    static array<T>(
        _prop: AbstractProperty<T, boolean> | ParseFn<T>,
        _options?: InputOptions
    ): AbstractProperty<T[], false> {
        throw new Error("Method Not Implemented");
    }

    static literal<const V extends Literable>(
        _value: V,
        _options?: InputOptions
    ): AbstractProperty<V, false> {
        throw new Error("Method Not Implemented");
    }

    static custom<T>(
        _fn: ParseFn<T>,
        _options?: InputOptions
    ): AbstractProperty<T, false> {
        throw new Error("Method Not Implemented");
    }

    static string(_options?: InputOptions): AbstractProperty<string, false> {
        throw new Error("Method Not Implemented");
    }

    static number(_options?: InputOptions): AbstractProperty<number, false> {
        throw new Error("Method Not Implemented");
    }

    static boolean(_options?: InputOptions): AbstractProperty<boolean, false> {
        throw new Error("Method Not Implemented");
    }

    /**
     * Indicates that a field must be unique across all documents
     *
     * **NOTE**: The field type must be a primitive. If this is applied to a non-primitive, it returns `null`
     */
    unique() {
        type O = Value extends boolean | string | number | symbol ? this : null;
        switch (this.type) {
            case PropertType.Boolean:
            case PropertType.String:
            case PropertType.Number:
            case PropertType.Symbol:
                this.options.unique = true;
                return this as O;
            default:
                console.error("A non-primitive cannot be a unique value");
                return null as O;
        }
    }

    hasDefaultValue() {
        return this.hasDefault;
    }

    static relation<To extends string, Name extends string = never>(
        to: To,
        options?: RelationOptions<Name, ReferenceActions>
    ) {
        return new Relation<To, Name>(to, options);
    }

    static primaryKey<V extends ValidKeyType = "number">(
        type: V = "number" as V
    ): PrimaryKey<false, FunctionMatch<V>> {
        return new PrimaryKey<false, FunctionMatch<V>>(type);
    }
}

export class Property<
    Value,
    HasDefault extends boolean
> extends AbstractProperty<Value, HasDefault> {
    array(): Property<Value[], false> {
        return new Property<Value[], false>(
            Property.generateArrayValidator(this.validate),
            PropertType.Array,
            this.options
        );
    }

    default(
        defaultValue: Exclude<Value, undefined>
    ): Property<Exclude<Value, undefined>, true> {
        const newFn: ParseFn<Exclude<Value, undefined>> = (value: unknown) => {
            if (value == null) {
                return {
                    success: true,
                    data: defaultValue,
                };
            } else
                return this.validate(value) as ParseResult<
                    Exclude<Value, undefined>
                >;
        };
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
            return this.validate(value);
        };
        return new Property(newFn, this.type, this.options);
    }

    static literal<const V extends Literable>(
        value: V,
        options?: InputOptions
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
            Property.literalToType(value),
            options
        );
    }

    static string(options?: InputOptions): Property<string, false> {
        return new Property(
            (test) => {
                if (typeof test === "string") {
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
            PropertType.String,
            options
        );
    }

    static number(options?: InputOptions): Property<number, false> {
        return new Property(
            (test) => {
                if (typeof test === "number") {
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
            PropertType.Number,
            options
        );
    }

    static boolean(options?: InputOptions): Property<boolean, false> {
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
            PropertType.Boolean,
            options
        );
    }

    static custom<T>(
        fn: ParseFn<T>,
        options?: InputOptions
    ): Property<T, false> {
        return new Property(fn, PropertType.Unknown, options);
    }

    static array<T>(
        item: ParseFn<T> | Property<T, boolean>,
        options?: InputOptions
    ): Property<T[], false> {
        return new Property(
            Property.generateArrayValidator(
                item instanceof Property ? item.validate : item
            ),
            PropertType.Array,
            options
        );
    }

    private static literalToType(value: Literable): PropertType {
        switch (typeof value) {
            case "boolean":
                return PropertType.Boolean;
            case "bigint":
                return PropertType.BigInt;
            case "number":
                return PropertType.Number;
            case "string":
                return PropertType.Number;
            case "object":
                return PropertType.Object;
            case "symbol":
                return PropertType.Symbol;
            default:
                return PropertType.Unknown;
        }
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

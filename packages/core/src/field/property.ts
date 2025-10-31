import { Literable, NoUndefined, Type, ValidKeyType } from "../types/common.js";
import {
    FunctionMatch,
    PropertyUnion,
    ReferenceActions,
    RelationOptions,
    VALIDATORS,
} from "./field-types.js";
import PrimaryKey from "./primary-key.js";
import { Relation } from "./relation.js";

export interface PropertyOptions {
    unique: boolean;
}

type InputOptions = Partial<PropertyOptions>;

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
        protected type: Type,
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
    ): AbstractProperty<NoUndefined<Value>, true>;

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

    static union<
        const T extends readonly (
            | ParseFn<any>
            | AbstractProperty<any, boolean>
        )[]
    >(
        _items: T,
        _options?: InputOptions
    ): AbstractProperty<PropertyUnion<T>, false> {
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
            case Type.Boolean:
            case Type.String:
            case Type.Number:
            case Type.Symbol:
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

    static readonly validators = VALIDATORS;

    protected static literalToType(value: Literable): Type {
        switch (typeof value) {
            case "boolean":
                return Type.Boolean;
            case "bigint":
                return Type.BigInt;
            case "number":
                return Type.Number;
            case "string":
                return Type.Number;
            case "object":
                return Type.Object;
            case "symbol":
                return Type.Symbol;
            default:
                return Type.Unknown;
        }
    }
}

export class Property<
    Value,
    HasDefault extends boolean
> extends AbstractProperty<Value, HasDefault> {
    array(): Property<Value[], false> {
        return new Property<Value[], false>(
            Property.generateArrayValidator(this.validate),
            Type.Array,
            this.options
        );
    }

    default(
        defaultValue: NoUndefined<Value>
    ): Property<NoUndefined<Value>, true> {
        const newFn: ParseFn<NoUndefined<Value>> = (value: unknown) => {
            if (value == null) {
                return {
                    success: true,
                    data: defaultValue,
                };
            } else
                return this.validate(value) as ParseResult<NoUndefined<Value>>;
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
            AbstractProperty.validators.string,
            Type.String,
            options
        );
    }

    static number(options?: InputOptions): Property<number, false> {
        return new Property(
            AbstractProperty.validators.number,
            Type.Number,
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
            Type.Boolean,
            options
        );
    }

    static union<
        const T extends readonly (
            | ParseFn<any>
            | AbstractProperty<any, boolean>
        )[]
    >(items: T, options?: InputOptions): Property<PropertyUnion<T>, false> {
        const functions: ParseFn<T[number]>[] = items.map((i) =>
            i instanceof AbstractProperty ? i.validate : i
        );
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
            Type.Unknown,
            options
        );
    }

    static custom<T>(
        fn: ParseFn<T>,
        options?: InputOptions
    ): Property<T, false> {
        return new Property(fn, Type.Unknown, options);
    }

    static array<T>(
        item: ParseFn<T> | Property<T, boolean>,
        options?: InputOptions
    ): Property<T[], false> {
        return new Property(
            Property.generateArrayValidator(
                item instanceof Property ? item.validate : item
            ),
            Type.Array,
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

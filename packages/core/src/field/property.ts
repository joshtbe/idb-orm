import { Literable, NoUndefined, Promisable } from "../util-types.js";
import {
    FunctionMatch,
    PropertyUnion,
    ReferenceActions,
    RelationOptions,
    ValidKeyType,
    StringValidKeyType,
} from "./field-types.js";
import PrimaryKey from "./primary-key";
import { Relation } from "./relation";
import { Tag, Type, TypeTag } from "../typing";

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

    constructor(public type: TypeTag, options?: PropertyInputOptions) {
        this.options = {
            unique: options?.unique ?? false,
        };
    }

    parse(value: unknown): ParseResult<Value> {
        if (Type.is(this.type, value)) {
            if (this.type.tag === Tag.custom && this.type.parse) {
                try {
                    return {
                        success: true,
                        data: this.type.parse(value),
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: String(error),
                    };
                }
            }
            return {
                success: true,
                data: value as Value,
            };
        } else {
            return {
                success: false,
                error: `Value is not a valid '${Type.toString(this.type)}'`,
            };
        }
    }

    /**
     * @deprecated This functionality does not work yet
     *
     * Indicates that a field must be unique across all documents
     *
     * **NOTE**: The field type must be a primitive. If this is applied to a non-primitive, it returns `null`
     */
    unique() {
        switch (this.type.tag) {
            case Tag.boolean:
            case Tag.string:
            case Tag.number:
            case Tag.symbol:
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
                return Type.Boolean();
            case "bigint":
                return Type.BigInt();
            case "number":
                return Type.Number();
            case "string":
                return Type.String();
            case "symbol":
                return Type.Symbol();
            default:
                return Type.Unknown();
        }
    }

    public static is(value: any): value is Property<any, any> {
        return typeof value === "object" && value?.symbol === PROPERTY_SYMBOL;
    }

    array(): Property<Value[], false> {
        return new Property<Value[], false>(
            Type.Array(this.type),
            this.options
        );
    }

    default(
        defaultValue: NoUndefined<Value> | (() => NoUndefined<Value>)
    ): Property<NoUndefined<Value>, true> {
        this.hasDefault = true as HasDefault;
        return new Property(
            Type.Default(this.type, defaultValue),
            this.options
        );
    }

    optional(): Property<Value | undefined, false> {
        return new Property(Type.Optional(this.type), this.options);
    }

    static array<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions
    ): Property<T[], false> {
        return new Property(Type.Array(item.type), options);
    }

    static boolean(options?: PropertyInputOptions): Property<boolean, false> {
        return new Property(Type.Boolean(), options);
    }

    static custom<T>(
        fn: ParseFn<T>,
        options?: CustomPropertyOptions<T>
    ): Property<T, false> {
        return new Property(
            Type.Custom<T>({
                isType: ((test) => fn(test).success) as (
                    test: unknown
                ) => test is T,
                serialize: options?.serialize,
                deserialize: options?.deserialize,
            }),
            options
        );
    }

    static date(options?: PropertyInputOptions): Property<Date, false> {
        return new Property(Type.Date(), options);
    }

    static file(options?: PropertyInputOptions): Property<File, false> {
        return new Property(Type.File(), options);
    }

    static literal<const V extends Literable>(
        value: V,
        options?: PropertyInputOptions
    ): Property<V, false> {
        return new Property(Type.Literal<V>(value), options);
    }

    static number(options?: PropertyInputOptions): Property<number, false> {
        return new Property(Type.Number(), options);
    }

    static string(options?: PropertyInputOptions): Property<string, false> {
        return new Property(Type.String(), options);
    }

    static set<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions
    ): Property<Set<T>, false> {
        return new Property(Type.Set(item.type), options);
    }

    static union<const T extends readonly Property<any, boolean>[]>(
        items: T,
        options?: PropertyInputOptions
    ): Property<PropertyUnion<T>, false> {
        return new Property<PropertyUnion<T>, false>(
            Type.Union(items.map((i) => i.type)),
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

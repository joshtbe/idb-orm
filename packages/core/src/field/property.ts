import {
    Dict,
    Literable,
    MaybeGenerator,
    NoUndefined,
    Promisable,
    RequiredKey,
} from "../util-types.js";
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
import { RecordKeyable, Tag, Type, TypeTag } from "../typing";

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

export class Property<Value, _HasDefault extends boolean> {
    private static readonly SYMBOL = Symbol.for("property");
    readonly symbol = Property.SYMBOL;
    protected defaultValue?: () => NoUndefined<Value>;
    protected options: PropertyOptions;

    constructor(
        public readonly type: TypeTag,
        options?: PropertyInputOptions,
    ) {
        this.options = {
            unique: options?.unique ?? false,
        };
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
                this.options.unique = true;
                return this;
            default:
                throw new Error("A non-primitive cannot be a unique value");
        }
    }

    getDefaultValue() {
        if (!this.defaultValue) {
            throw new Error(
                `Default value for this property does not exist. Please try calling 'hasDefaultValue()' to ensure the property provides a default value.`,
            );
        }
        return this.defaultValue();
    }

    hasDefaultValue() {
        return !!this.defaultValue;
    }

    static relation<To extends string, const Name extends string = never>(
        to: To,
        options?: RelationOptions<Name, ReferenceActions>,
    ) {
        return new Relation<To, Name>(to, options);
    }

    static primaryKey<V extends StringValidKeyType = "number">(
        type: V = "number" as V,
    ): PrimaryKey<false, FunctionMatch<V>> {
        return new PrimaryKey<false, FunctionMatch<V>>(
            this.nameToType(type) as ValidKeyType,
        );
    }

    public static nameToType(typeName: string): TypeTag {
        switch (typeName) {
            case "boolean":
                return Type.boolean();
            case "bigint":
                return Type.bigint();
            case "number":
                return Type.number();
            case "string":
                return Type.string();
            default:
                return Type.unknown();
        }
    }

    public static is(value: any): value is Property<any, any> {
        return typeof value === "object" && value?.symbol === this.SYMBOL;
    }

    array(): Property<Value[], false> {
        return new Property<Value[], false>(
            Type.array(this.type),
            this.options,
        );
    }

    default(
        defaultValue: MaybeGenerator<NoUndefined<Value>>,
    ): Property<NoUndefined<Value>, true> {
        if (typeof defaultValue === "function") {
            this.defaultValue = defaultValue as () => NoUndefined<Value>;
        } else {
            this.defaultValue = () => defaultValue;
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        (this.type as TypeTag) = Type.optional(this.type);
        return this as Property<NoUndefined<Value>, true>;
    }

    optional(): Property<Value | undefined, false> {
        return new Property(Type.optional(this.type), this.options);
    }

    static array<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions,
    ): Property<T[], false> {
        return new Property(Type.array(item.type), options);
    }

    static boolean(options?: PropertyInputOptions): Property<boolean, false> {
        return new Property(Type.boolean(), options);
    }

    static custom<T>(
        fn: ParseFn<T>,
        options?: CustomPropertyOptions<T>,
    ): Property<T, false> {
        return new Property(
            Type.custom<T>({
                isType: ((test) => fn(test).success) as (
                    test: unknown,
                ) => test is T,
                serialize: options?.serialize,
                deserialize: options?.deserialize,
            }),
            options,
        );
    }

    static date(options?: PropertyInputOptions): Property<Date, false> {
        return new Property(Type.date(), options);
    }

    static discriminatedUnion<
        Base extends Dict<TypeTag>,
        const Key extends string = string,
        const Options extends readonly RequiredKey<Key, TypeTag>[] = [],
    >(
        base: Base,
        key: Key,
        options: Options,
        propOptions: PropertyInputOptions,
    ): Property<Base & Options[number], false> {
        return new Property(
            Type.discriminatedUnion(base, key, options),
            propOptions,
        );
    }

    static enum<const V extends readonly Literable[]>(
        items: V,
        options?: PropertyInputOptions,
    ) {
        return new Property<V[number], false>(Type.enum(items), options);
    }

    static file(options?: PropertyInputOptions): Property<File, false> {
        return new Property(Type.file(), options);
    }

    static literal<const V extends Literable>(
        value: V,
        options?: PropertyInputOptions,
    ): Property<V, false> {
        return new Property(Type.literal<V>(value), options);
    }

    static number(options?: PropertyInputOptions): Property<number, false> {
        return new Property(Type.number(), options);
    }

    static record<K extends number | string, V>(
        keys: Property<K, boolean>,
        values: Property<V, boolean>,
        options?: PropertyInputOptions,
    ): Property<Record<K, V>, false> {
        return new Property(
            Type.record(keys.type as RecordKeyable, values.type),
            options,
        );
    }

    static string(options?: PropertyInputOptions): Property<string, false> {
        return new Property(Type.string(), options);
    }

    static set<T>(
        item: Property<T, boolean>,
        options?: PropertyInputOptions,
    ): Property<Set<T>, false> {
        return new Property(Type.set(item.type), options);
    }

    static union<const T extends readonly Property<any, boolean>[]>(
        items: T,
        options?: PropertyInputOptions,
    ): Property<PropertyUnion<T>, false> {
        return new Property<PropertyUnion<T>, false>(
            Type.union(items.map((i) => i.type)),
            options,
        );
    }
}

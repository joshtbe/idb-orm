import z from "zod";
import type { ValidKeyType } from "../types/common.js";
import type {
    FieldOptions,
    FunctionMatch,
    ReferenceActions,
    RelationOptions,
} from "./field-types.js";
import { DEFAULT_SCHEMA_MAP } from "./constants.js";
import PrimaryKey from "./primary-key.js";
import { Relation } from "./relation.js";

export class Field<OutputType, HasDefault extends boolean = false> {
    public schema: z.ZodType<OutputType>;
    private hasDefault: HasDefault = false as HasDefault;
    public static readonly schemas = DEFAULT_SCHEMA_MAP;
    private options: FieldOptions;
    constructor(
        schema: z.ZodType<OutputType>,
        options?: Partial<FieldOptions>
    ) {
        this.schema = schema;
        this.options = {
            unique: options?.unique ?? false,
        };
    }

    array() {
        return new Field(this.schema.array());
    }

    optional() {
        return new Field<OutputType | undefined>(this.schema.optional());
    }

    default(defaultValue: NonNullable<OutputType>) {
        this.schema = this.schema.default(defaultValue);
        this.hasDefault = true as HasDefault;
        return this as Field<NonNullable<OutputType>, true>;
    }

    refine(refineFn: (val: OutputType) => boolean) {
        this.schema = this.schema.refine(refineFn);
    }

    parse(value: unknown): z.ZodSafeParseResult<OutputType> {
        return this.schema.safeParse(value);
    }

    hasDefaultValue() {
        return this.hasDefault;
    }

    // TODO: Implement unique fields using indexes and {unique: true}

    /**
     * Indicates that a field must be unique across all documents
     *
     * **NOTE**: The field type must be a primitive. If this is applied to a non-primitive, it returns `null`
     */
    unique() {
        type O = OutputType extends boolean | string | number | symbol
            ? this
            : null;
        switch (this.schema.type) {
            case "boolean":
            case "string":
            case "number":
            case "symbol":
                this.options.unique = true;
                return this as O;
            default:
                console.error("A non-primitive cannot be a unique value");
                return null as O;
        }
    }

    // Static Functions
    static array<T>(item: z.ZodType<T> | Field<T>, options?: FieldOptions) {
        if (item instanceof Field) {
            return new Field(item.schema.array(), options);
        }
        return new Field(item.array());
    }

    static boolean(schema?: z.ZodType<boolean>, options?: FieldOptions) {
        return new Field<boolean>(
            schema ?? DEFAULT_SCHEMA_MAP.boolean,
            options
        );
    }

    static custom<T>(schema: z.ZodType<T>, options?: FieldOptions) {
        return new Field<T>(schema, options);
    }

    static object<T extends Record<string, z.ZodType>>(
        item: T,
        options?: FieldOptions
    ) {
        return new Field(z.object(item), options);
    }

    static primaryKey<V extends ValidKeyType = "number">(
        type: V = "number" as V
    ): PrimaryKey<false, FunctionMatch<V>> {
        return new PrimaryKey<false, FunctionMatch<V>>(type);
    }

    static literal<V extends string | number | boolean>(value: V) {
        return new Field(z.literal(value));
    }

    static number(schema?: z.ZodType<number>, options?: FieldOptions) {
        return new Field<number>(schema ?? DEFAULT_SCHEMA_MAP.number, options);
    }

    static string(schema?: z.ZodType<string>, options?: FieldOptions) {
        return new Field<string>(schema ?? DEFAULT_SCHEMA_MAP.string, options);
    }

    static relation<To extends string, Name extends string = never>(
        to: To,
        options?: RelationOptions<Name, ReferenceActions>
    ) {
        return new Relation<To, Name>(to, options);
    }
}

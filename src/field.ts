import z from "zod";

const DEFAULT_SCHEMA_MAP = {
    string: z.string(),
    boolean: z.boolean(),
    number: z.number(),
    array: z.array(z.any()),
    object: z.object({}),
};

export class Link<To extends string> {
    public to: To;
    constructor(to: To) {
        this.to = to;
    }
}

interface FieldOptions {
    readonly isPrimary: boolean;
}

type OmittedOptions = Omit<FieldOptions, "isPrimary">;

export class Field<Type> implements FieldOptions {
    public schema: z.ZodType<Type>;
    public readonly isPrimary: boolean;
    public static readonly schemas = DEFAULT_SCHEMA_MAP;
    constructor(schema: z.ZodType<Type>, options?: Partial<FieldOptions>) {
        this.schema = schema;
        this.isPrimary = options?.isPrimary ?? false;
    }

    static array<T>(item: z.ZodType<T> | Field<T>, options?: OmittedOptions) {
        if (item instanceof Field) {
            if (item.isPrimary) {
                throw "Primary key cannot be an array";
            }
            return new Field(item.schema.array(), options);
        }
        return new Field(item.array());
    }

    static boolean(schema?: z.ZodType<boolean>, options?: OmittedOptions) {
        return new Field<boolean>(
            schema ?? DEFAULT_SCHEMA_MAP.boolean,
            options
        );
    }

    static custom<T>(schema: z.ZodType<T>, options?: OmittedOptions) {
        return new Field<T>(schema, options);
    }

    static object<T extends Record<string, z.ZodType>>(
        item: T,
        options?: OmittedOptions
    ) {
        return new Field(z.object(item), options);
    }

    static optional<T>(
        item: z.ZodType<T> | Field<T>,
        options?: OmittedOptions
    ) {
        if (item instanceof Field) {
            if (item.isPrimary) {
                throw "Primary key cannot be optional";
            }
            return new Field(item.schema.optional(), options);
        }
        return new Field(item.optional(), options);
    }

    static primaryKey<B extends boolean = false>(
        autoIncrement?: B
    ): Field<B extends true ? number : string> {
        return (
            autoIncrement
                ? Field.number(undefined, { isPrimary: true })
                : Field.string(undefined, { isPrimary: true })
        ) as Field<B extends true ? number : string>;
    }

    static number(schema?: z.ZodType<number>, options?: FieldOptions) {
        return new Field<number>(schema ?? DEFAULT_SCHEMA_MAP.number, options);
    }

    static string(schema?: z.ZodType<string>, options?: FieldOptions) {
        return new Field<string>(schema ?? DEFAULT_SCHEMA_MAP.string, options);
    }
    static foreignKey<OtherNames extends string>(to: OtherNames) {
        return new Link(to);
    }
}

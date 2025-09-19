import z from "zod";

const DEFAULT_SCHEMA_MAP = {
    string: z.string(),
    boolean: z.boolean(),
    number: z.number(),
    array: z.array(z.any()),
    object: z.object({}),
};

export class Link<To extends string, Optional extends boolean = false> {
    public readonly to: To;
    public readonly isOptional: Optional;
    constructor(to: To, optional?: Optional) {
        this.to = to;
        this.isOptional = optional ?? (false as Optional);
    }
    optional() {
        return new Link(this.to, true);
    }
}

interface FieldOptions<IsPrimary extends boolean = false> {
    readonly isPrimary: IsPrimary;
}

type OmittedOptions = Omit<FieldOptions, "isPrimary">;

export class Field<Type, IsPrimary extends boolean = false>
    implements FieldOptions<IsPrimary>
{
    public schema: z.ZodType<Type>;
    public readonly isPrimary: IsPrimary;
    public static readonly schemas = DEFAULT_SCHEMA_MAP;
    constructor(
        schema: z.ZodType<Type>,
        options?: Partial<FieldOptions<IsPrimary>>
    ) {
        this.schema = schema;
        this.isPrimary = options?.isPrimary ?? (false as IsPrimary);
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
    ): Field<B extends true ? number : string, true> {
        return (
            autoIncrement
                ? new Field(Field.schemas.number, { isPrimary: true })
                : new Field(Field.schemas.string, { isPrimary: true })
        ) as Field<B extends true ? number : string, true>;
    }

    static number(schema?: z.ZodType<number>, options?: FieldOptions<false>) {
        return new Field<number, false>(
            schema ?? DEFAULT_SCHEMA_MAP.number,
            options
        );
    }

    static string(schema?: z.ZodType<string>, options?: FieldOptions<false>) {
        return new Field<string, false>(
            schema ?? DEFAULT_SCHEMA_MAP.string,
            options
        );
    }
    static foreignKey<OtherNames extends string, Bool extends boolean = false>(
        to: OtherNames,
        optional?: Bool
    ) {
        return new Link(to, optional);
    }
}

export type FieldOutput<T> = T extends Field<infer Type, any> ? Type : never;

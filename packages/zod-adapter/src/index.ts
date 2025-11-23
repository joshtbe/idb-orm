import { core, Property as P } from "@idb-orm/core";
import { z } from "zod";

const Type = core.Type;

export type CustomOptions<T> = Partial<core.CustomPropertyOptions<T>>;

function parseAdapter<T>(schema: z.ZodType<T>): core.ParseFn<T> {
    return ((value: unknown) => {
        const result = schema.safeParse(value);
        return {
            success: result.success,
            data: result.data,
            error: result?.error ? z.prettifyError(result.error) : undefined,
        };
    }) as core.ParseFn<T>;
}

export class Property<
    Value,
    HasDefault extends boolean
> extends core.AbstractProperty<Value, HasDefault> {
    constructor(
        protected schema: z.ZodType<Value>,
        options?: CustomOptions<Value>,
        type?: core.TypeTag
    ) {
        super(
            parseAdapter(schema),
            type ? type : Property.getTypeTag(schema),
            options
        );
    }

    array() {
        this.schema = this.schema.array() as unknown as z.ZodType<Value>;
        this.regenerateValidator();
        this.type = Type.Array(this.type);
        return this as Property<Value[], false>;
    }

    default(
        defaultValue: core.NoUndefined<Value>
    ): Property<core.NoUndefined<Value>, true> {
        this.schema = this.schema.default(defaultValue);
        this.hasDefault = true as HasDefault;
        this.regenerateValidator();
        return this as Property<core.NoUndefined<Value>, true>;
    }

    optional(): Property<Value | undefined, false> {
        this.schema = this.schema.optional() as unknown as z.ZodType<Value>;
        this.regenerateValidator();
        this.type = Type.Optional(this.type);
        return this as Property<Value | undefined, false>;
    }

    static readonly zodValidators = {
        string: z.string(),
        number: z.number(),
        boolean: z.boolean(),
        date: z.date(),
    };

    static array<T>(
        schema: z.ZodType<T>,
        options?: core.PropertyInputOptions
    ): Property<T[], false> {
        return new Property(z.array(schema), options);
    }

    static boolean(
        options?: core.PropertyInputOptions
    ): Property<boolean, false> {
        return new Property(
            Property.zodValidators.boolean,
            options,
            Type.Boolean
        );
    }

    static custom<T>(
        schema: z.ZodType<T>,
        options: CustomOptions<T>
    ): Property<T, false> {
        return new Property(schema, options);
    }

    static date(options?: core.PropertyInputOptions): Property<Date, false> {
        return new Property(Property.zodValidators.date, options, Type.Date);
    }

    static literal<const T extends core.Literable>(
        value: T,
        options?: core.PropertyInputOptions
    ): Property<T, false> {
        return new Property(z.literal(value), options);
    }

    static number(options?: core.PropertyInputOptions): NumberProperty<false> {
        return new NumberProperty(options);
    }

    static string(options?: core.PropertyInputOptions): StringProperty<false> {
        return new StringProperty(options);
    }

    static set<T>(
        schema: z.ZodType<T>,
        options?: core.PropertyInputOptions
    ): Property<Set<T>, false> {
        return new Property(z.set(schema), options);
    }

    static union<const T extends readonly z.core.SomeType[]>(
        items: T,
        options?: core.PropertyInputOptions
    ): Property<z.output<z.ZodUnion<T>>, false> {
        return new Property<z.output<z.ZodUnion<T>>, false>(
            z.union(items),
            options
        );
    }

    /**
     * Regenerates the stored parse function based on the schema
     */
    protected regenerateValidator() {
        this.parseFn = parseAdapter(this.schema);
    }

    private static getTypeTag(schema: z.ZodType): core.TypeTag {
        switch (schema.type) {
            case "array":
                return Type.Array(
                    this.getTypeTag((schema as z.ZodArray).element as z.ZodType)
                );
            case "bigint":
                return Type.BigInt;
            case "number":
                return Type.Number;
            case "string":
                return Type.String;
            case "boolean":
                return Type.Boolean;
            case "date":
                return Type.Date;
            case "file":
                return Type.File;
            case "symbol":
                return Type.Symbol;
            case "literal":
                return core.AbstractProperty.nameToType(
                    typeof Array.from((schema as z.ZodLiteral).values)[0]
                );
            case "optional":
                return Type.Optional(
                    this.getTypeTag(
                        (schema as z.ZodOptional).unwrap() as z.ZodType
                    )
                );
            case "set":
                return Type.Set(
                    this.getTypeTag(
                        (schema as z.ZodSet)._zod.def.valueType as z.ZodType
                    )
                );
            case "union":
                return Type.Union(
                    ((schema as z.ZodUnion).options as z.ZodType[]).map((o) =>
                        Property.getTypeTag(o)
                    )
                );
            case "object": {
                const result: Record<string, core.TypeTag> = {};
                for (const key in (schema as z.ZodObject).shape) {
                    if (!Object.hasOwn((schema as z.ZodObject).shape, key))
                        continue;

                    result[key] = this.getTypeTag(
                        (schema as z.ZodObject).shape[key]
                    );
                }
                return Type.Object(result);
            }
            default:
                return Type.Unknown;
        }
    }
}

class NumberProperty<HasDefault extends boolean> extends Property<
    number,
    HasDefault
> {
    constructor(options?: core.PropertyInputOptions) {
        super(Property.zodValidators.number, options, Type.Number);
    }

    default(value: number) {
        return super.default(value) as NumberProperty<true>;
    }

    min(value: number) {
        this.schema = (this.schema as z.ZodNumber).min(value);
        this.regenerateValidator();
        return this;
    }

    gte(value: number) {
        this.schema = (this.schema as z.ZodNumber).gte(value);
        this.regenerateValidator();
        return this;
    }

    max(value: number) {
        this.schema = (this.schema as z.ZodNumber).max(value);
        this.regenerateValidator();
        return this;
    }

    lte(value: number) {
        this.schema = (this.schema as z.ZodNumber).lte(value);
        this.regenerateValidator();
        return this;
    }

    lt(value: number) {
        this.schema = (this.schema as z.ZodNumber).lt(value);
        this.regenerateValidator();
        return this;
    }

    gt(value: number) {
        this.schema = (this.schema as z.ZodNumber).gt(value);
        this.regenerateValidator();
        return this;
    }

    positive() {
        this.schema = (this.schema as z.ZodNumber).positive();
        this.regenerateValidator();
        return this;
    }

    negative() {
        this.schema = (this.schema as z.ZodNumber).negative();
        this.regenerateValidator();
        return this;
    }

    nonnegative() {
        this.schema = (this.schema as z.ZodNumber).nonnegative();
        this.regenerateValidator();
        return this;
    }

    nonpositive() {
        this.schema = (this.schema as z.ZodNumber).nonpositive();
        this.regenerateValidator();
        return this;
    }

    multipleOf(value: number) {
        this.schema = (this.schema as z.ZodNumber).multipleOf(value);
        this.regenerateValidator();
        return this;
    }
}

interface ZodStringCache
    extends Partial<{
        email: z.ZodEmail;
        uuid: z.ZodUUID;
        url: z.ZodURL;
        httpUrl: z.ZodURL;
    }> {}

class StringProperty<HasDefault extends boolean> extends Property<
    string,
    HasDefault
> {
    constructor(options?: core.PropertyInputOptions) {
        super(Property.zodValidators.string, options, Type.String);
    }

    default(value: string) {
        return super.default(value) as StringProperty<true>;
    }

    private static readonly cache: ZodStringCache = {};
    private static getSchema<K extends keyof ZodStringCache>(
        key: K
    ): NonNullable<ZodStringCache[K]> {
        if (!this.cache[key]) {
            this.cache[key] = z[key]() as ZodStringCache[K];
        }
        return this.cache[key]!;
    }

    min(length: number) {
        this.schema = (this.schema as z.ZodString).min(length);
        this.regenerateValidator();
        return this;
    }

    max(length: number) {
        this.schema = (this.schema as z.ZodString).max(length);
        this.regenerateValidator();
        return this;
    }

    length(length: number) {
        this.schema = (this.schema as z.ZodString).length(length);
        this.regenerateValidator();
        return this;
    }

    regex(regex: RegExp) {
        this.schema = (this.schema as z.ZodString).regex(regex);
        this.regenerateValidator();
        return this;
    }

    startsWith(text: string) {
        this.schema = (this.schema as z.ZodString).startsWith(text);
        this.regenerateValidator();
        return this;
    }

    endsWith(text: string) {
        this.schema = (this.schema as z.ZodString).endsWith(text);
        this.regenerateValidator();
        return this;
    }

    includes(text: string) {
        this.schema = (this.schema as z.ZodString).includes(text);
        this.regenerateValidator();
        return this;
    }

    uppercase() {
        this.schema = (this.schema as z.ZodString).uppercase();
        this.regenerateValidator();
        return this;
    }

    toUpperCase() {
        this.schema = (this.schema as z.ZodString).toUpperCase();
        this.regenerateValidator();
        return this;
    }

    lowercase() {
        this.schema = (this.schema as z.ZodString).lowercase();
        this.regenerateValidator();
        return this;
    }

    toLowerCase() {
        this.schema = (this.schema as z.ZodString).toLowerCase();
        this.regenerateValidator();
        return this;
    }

    normalize() {
        this.schema = (this.schema as z.ZodString).normalize();
        this.regenerateValidator();
        return this;
    }

    trim() {
        this.schema = (this.schema as z.ZodString).trim();
        this.regenerateValidator();
        return this;
    }

    email() {
        this.schema = StringProperty.getSchema("email");
        this.regenerateValidator();
        return this;
    }

    uuid() {
        this.schema = StringProperty.getSchema("uuid");
        this.regenerateValidator();
        return this;
    }

    url() {
        this.schema = StringProperty.getSchema("url");
        this.regenerateValidator();
        return this;
    }

    httpUrl() {
        this.schema = StringProperty.getSchema("httpUrl");
        this.regenerateValidator();
        return this;
    }
}

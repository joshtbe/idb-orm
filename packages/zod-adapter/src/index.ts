import { core, Property as P } from "@idb-orm/core";
import { z } from "zod";

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
        private schema: z.ZodType<Value>,
        options?: core.PropertyInputOptions
    ) {
        super(
            parseAdapter(schema),
            core.AbstractProperty.nameToType(schema.type),
            options
        );
    }

    array() {
        this.schema = this.schema.array() as unknown as z.ZodType<Value>;
        this.regenerateValidator();
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
        return new Property(Property.zodValidators.boolean, options);
    }

    static custom<T>(
        schema: z.ZodType<T>,
        options?: core.PropertyInputOptions
    ): Property<T, false> {
        return new Property(schema, options);
    }

    static date(options?: core.PropertyInputOptions): Property<Date, false> {
        return new Property(Property.zodValidators.date, options);
    }

    static literal<const T extends core.Literable>(
        value: T,
        options?: core.PropertyInputOptions
    ): Property<T, false> {
        return new Property(z.literal(value), options);
    }

    static number(
        options?: core.PropertyInputOptions
    ): Property<number, false> {
        return new Property(Property.zodValidators.number, options);
    }

    static string(
        options?: core.PropertyInputOptions
    ): Property<string, false> {
        return new Property(Property.zodValidators.string, options);
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

    private regenerateValidator() {
        this.parseFn = parseAdapter(this.schema);
    }
}

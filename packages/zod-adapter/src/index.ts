import {
    ParseFn,
    AbstractProperty,
    PropertyInputOptions,
    util,
} from "@idb-orm/core/dev";
import { z } from "zod";

function parseAdapter<T>(schema: z.ZodType<T>): ParseFn<T> {
    return ((value: unknown) => {
        const result = schema.safeParse(value);
        return {
            success: result.success,
            data: result.data,
            error: result?.error ? z.prettifyError(result.error) : undefined,
        };
    }) as ParseFn<T>;
}

export class Property<
    Value,
    HasDefault extends boolean
> extends AbstractProperty<Value, HasDefault> {
    constructor(
        private schema: z.ZodType<Value>,
        options?: PropertyInputOptions
    ) {
        super(
            parseAdapter(schema),
            AbstractProperty.nameToType(schema.type),
            options
        );
    }

    array() {
        this.schema = this.schema.array() as unknown as z.ZodType<Value>;
        this.regenerateValidator();
        return this as Property<Value[], false>;
    }

    default(
        defaultValue: util.NoUndefined<Value>
    ): Property<util.NoUndefined<Value>, true> {
        this.schema = this.schema.default(defaultValue);
        this.hasDefault = true as HasDefault;
        this.regenerateValidator();
        return this as Property<util.NoUndefined<Value>, true>;
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
    };

    static literal<const T extends util.Literable>(
        value: T,
        options?: PropertyInputOptions
    ): Property<T, false> {
        return new Property(z.literal(value), options);
    }

    static string(options?: PropertyInputOptions): Property<string, false> {
        return new Property(Property.zodValidators.string, options);
    }

    static number(options?: PropertyInputOptions): Property<number, false> {
        return new Property(Property.zodValidators.number, options);
    }

    static boolean(options?: PropertyInputOptions): Property<boolean, false> {
        return new Property(Property.zodValidators.boolean, options);
    }

    static union<const T extends readonly z.core.SomeType[]>(
        items: T,
        options?: PropertyInputOptions
    ): Property<z.output<z.ZodUnion<T>>, false> {
        return new Property<z.output<z.ZodUnion<T>>, false>(
            z.union(items),
            options
        );
    }

    static custom<T>(
        schema: z.ZodType<T>,
        options?: PropertyInputOptions
    ): Property<T, false> {
        return new Property(schema, options);
    }

    static array<T>(
        schema: z.ZodType<T>,
        options?: PropertyInputOptions
    ): Property<T[], false> {
        return new Property(z.array(schema), options);
    }

    private regenerateValidator() {
        this.validateFn = parseAdapter(this.schema);
    }
}

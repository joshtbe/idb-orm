import { Builder, core, Model } from "@idb-orm/core";
import z from "zod";

type ZodHasDefault<S extends z.ZodType> = S extends z.ZodDefault<any>
    ? true
    : false;

export type ZodTranslation<
    R extends Record<string, z.ZodType | core.ValidValue>
> = {
    [K in keyof R]: R[K] extends z.ZodType
        ? core.Property<z.output<R[K]>, ZodHasDefault<R[K]>>
        : R[K] extends core.ValidValue
        ? R[K]
        : never;
};

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

const Type = core.Type;

function getTypeTag(schema: z.ZodType): core.TypeTag {
    switch (schema.type) {
        case "array":
            return Type.Array(
                getTypeTag((schema as z.ZodArray).element as z.ZodType)
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
            return core.Property.nameToType(
                typeof Array.from((schema as z.ZodLiteral).values)[0]
            );
        case "optional":
            return Type.Optional(
                getTypeTag((schema as z.ZodOptional).unwrap() as z.ZodType)
            );
        case "set":
            return Type.Set(
                getTypeTag((schema as z.ZodSet)._zod.def.valueType as z.ZodType)
            );
        case "enum":
            return Type.Union(
                (schema as z.ZodEnum).options.map((o) => Type.Literal(o))
            );
        case "union":
            return Type.Union(
                ((schema as z.ZodUnion).options as z.ZodType[]).map((o) =>
                    getTypeTag(o)
                )
            );
        case "object": {
            const result: Record<string, core.TypeTag> = {};
            for (const key in (schema as z.ZodObject).shape) {
                if (!Object.hasOwn((schema as z.ZodObject).shape, key))
                    continue;

                result[key] = getTypeTag((schema as z.ZodObject).shape[key]);
            }
            return Type.Object(result);
        }
        default:
            return Type.Unknown;
    }
}

function zodToProperty<S extends z.ZodType>(
    schema: S
): core.Property<z.output<S>, ZodHasDefault<S>> {
    const anySchema = schema as any;
    const prop = new core.Property(parseAdapter(anySchema), getTypeTag(schema));
    if (schema instanceof z.ZodDefault) {
        return zodToProperty(anySchema.unwrap() as z.ZodType) as any;
    }
    return new core.Property(parseAdapter(anySchema), getTypeTag(schema));
}

export function zodModel<
    Name extends string,
    ZodFields extends Record<string, core.ValidValue | z.ZodType>
>(
    name: Name,
    fields: ZodFields
): Model<
    Name,
    core.Simplify<ZodTranslation<ZodFields>>,
    core.FindPrimaryKey<core.Simplify<ZodTranslation<ZodFields>>>
> {
    const innerFields = {} as ZodTranslation<ZodFields>;

    for (const key in fields) {
        if (!Object.hasOwn(fields, key)) continue;
        const element = fields[key];
        if (element instanceof z.ZodType) {
            innerFields[key] = zodToProperty(element) as any;
        } else {
            innerFields[key] = element as any;
        }
    }

    return new Model(name, innerFields);
}

import { Builder, core, Model } from "@idb-orm/core";
import z from "zod";

type ZodHasDefault<S extends z.ZodType> =
    S extends z.ZodDefault<any> ? true : false;

export type ZodTranslation<
    R extends Record<string, z.ZodType | core.ValidValue>,
> = {
    [K in keyof R]: R[K] extends z.ZodType
        ? core.Property<z.output<R[K]>, ZodHasDefault<R[K]>>
        : R[K] extends core.ValidValue
          ? R[K]
          : never;
};

const Type = core.Type;

function getTypeTag(schema: z.ZodType): core.TypeTag {
    switch (schema.type) {
        case "array":
            return Type.array(
                getTypeTag((schema as z.ZodArray).element as z.ZodType),
            );
        case "bigint":
            return Type.bigint();
        case "number":
            return Type.number();
        case "string":
            return Type.string();
        case "boolean":
            return Type.boolean();
        case "date":
            return Type.date();
        case "file":
            return Type.file();
        case "undefined":
            return Type.undefined();
        case "null":
            return Type.null();
        case "literal":
            return core.Property.nameToType(
                typeof Array.from((schema as z.ZodLiteral).values)[0],
            );
        case "optional":
            return Type.optional(
                getTypeTag((schema as z.ZodOptional).unwrap() as z.ZodType),
            );
        case "set":
            return Type.set(
                getTypeTag(
                    (schema as z.ZodSet)._zod.def.valueType as z.ZodType,
                ),
            );
        case "enum":
            return Type.union(
                (schema as z.ZodEnum).options.map((o) => Type.literal(o)),
            );
        case "union":
            return Type.union(
                ((schema as z.ZodUnion).options as z.ZodType[]).map((o) =>
                    getTypeTag(o),
                ),
            );
        case "object": {
            const result: Record<string, core.TypeTag> = {};
            for (const key in (schema as z.ZodObject).shape) {
                if (!Object.hasOwn((schema as z.ZodObject).shape, key))
                    continue;

                result[key] = getTypeTag((schema as z.ZodObject).shape[key]);
            }
            return Type.object(result);
        }
        default:
            return Type.unknown();
    }
}

function zodToProperty<S extends z.ZodType>(
    schema: S,
): core.Property<z.output<S>, ZodHasDefault<S>> {
    const typeTag = getTypeTag(
        schema instanceof z.ZodDefault
            ? (schema.unwrap() as z.ZodType)
            : schema,
    );

    return new core.Property(
        Type.custom({
            isType: (test: unknown) => schema.safeParse(test).success,
            parse: (test: unknown) => schema.parse(test),
            serialize: typeTag,
            deserialize: typeTag,
        }),
    );
}

export function zodModel<
    Name extends string,
    ZodFields extends Record<string, core.ValidValue | z.ZodType>,
>(
    name: Name,
    fields: ZodFields,
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

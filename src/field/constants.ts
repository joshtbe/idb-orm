import z from "zod";

export const DEFAULT_SCHEMA_MAP = {
    string: z.string(),
    boolean: z.boolean(),
    number: z.number(),
    array: z.array(z.any()),
    object: z.looseObject({}),
    date: z.date(),
};

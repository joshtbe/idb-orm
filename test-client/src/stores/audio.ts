import z from "zod";
import { builder, basicItem } from "./builder.ts";
import { Field } from "../db/field.ts";

export const trimSchema = z
    .object({
        start: z.number().nonnegative(),
        end: z.number().positive(),
    })
    .refine((obj) => obj.start < obj.end);

const audio = builder.defineModel("audio", {
    ...basicItem,
    duration: Field.custom(Field.schemas.number.nonnegative()),
    trim: Field.custom(trimSchema).optional(),
    volume: Field.custom(Field.schemas.number.min(0).max(1)).optional(),
    file: Field.relation("files", "audio2file"),
});

export default audio;

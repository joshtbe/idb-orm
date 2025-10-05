import z from "zod";
import { builder, basicItem } from "./builder.ts";
import { Field } from "../db/field.ts";

export const FILE_TYPES = ["image", "audio", "video", "text", "binary"] as const;

const files = builder.defineModel("files", {
    ...basicItem,
    data: Field.custom(z.instanceof(File)),
    type: Field.custom(z.enum(FILE_TYPES)),
    parent: Field.relation("files", "parent2child").optional(),
    children: Field.relation("files", "parent2child").array(),
    audio: Field.relation("audio", "audio2file").array(),
});

export default files;
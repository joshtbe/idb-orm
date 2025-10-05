import { Builder } from "../db/builder.ts";
import { Field } from "../db/field.ts";

export const builder = new Builder("char2_db", ["audio", "files"]);

export const basicItem = {
    id: Field.primaryKey(),
    name: Field.string(),
};

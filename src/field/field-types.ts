import { ValidKey } from "../types/common.js";
import { Field } from "./field.js";
import PrimaryKey from "./primary-key.js";
import { BaseRelation, OptionalRelation, RelationArray } from "./relation.js";

export type ReferenceActions = "Cascade" | "None" | "Restrict";
export type OptionalActions = "SetNull" | ReferenceActions;

export interface RelationOptions<Name extends string, OnDelete> {
    name?: Name;
    onDelete?: OnDelete;
}

export interface RelationActions {
    onDelete: OptionalActions;
}

export const enum FieldTypes {
    Field,
    Relation,
    PrimaryKey,
    Invalid,
}
export type GenFunction<T extends ValidKey> = () => T;

export type FunctionMatch<E> = E extends "string"
    ? string
    : E extends "number"
    ? number
    : E extends "date"
    ? Date
    : never;

export type GetPrimaryKeyType<T> = T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export interface FieldOptions {
    unique: boolean;
}

export type RelationOutput<T> = T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export type RelationOutputStructure<
    R extends BaseRelation<any, any>,
    Output
> = R extends RelationArray<any, any>
    ? Output[]
    : R extends OptionalRelation<any, any>
    ? Output | undefined
    : Output;

export type NonRelationOutput<T> = T extends Field<infer Out, any>
    ? Out
    : T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export type ValidValue<N extends string = string> =
    | BaseRelation<N, string>
    | Field<any, any>
    | PrimaryKey<boolean, ValidKey>;

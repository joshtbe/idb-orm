import { Dict } from "../util-types.js";
import PrimaryKey from "./primary-key.js";
import { AbstractProperty, ParseFn, Property } from "./property.js";
import { BaseRelation, OptionalRelation, ArrayRelation } from "./relation.js";
import { DateTag, NumberTag, StringTag } from "./type-wrapper.js";

export type ValidKey = string | number | Date;
export type StringValidKeyType = "string" | "date" | "number";
export type ValidKeyType = StringTag | DateTag | NumberTag;

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
    Property,
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
> = R extends ArrayRelation<any, any>
    ? Output[]
    : R extends OptionalRelation<any, any>
    ? Output | null
    : Output;

export type NonRelationOutput<T> = T extends AbstractProperty<infer Out, any>
    ? Out
    : T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export type ValidValue<N extends string = string> =
    | BaseRelation<N, string>
    | AbstractProperty<any, any>
    | PrimaryKey<boolean, ValidKey>;

export type ParseFnWrap<T extends Dict> = {
    [K in keyof T]: ParseFn<T[K]>;
};

export type PropertyUnion<
    T extends readonly (Property<any, boolean> | ParseFn<any>)[]
> = T[number] extends Property<infer Type, boolean>
    ? Type
    : T extends ParseFn<infer Type>
    ? Type
    : never;

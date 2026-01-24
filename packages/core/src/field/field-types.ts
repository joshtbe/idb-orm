import { Dict } from "../util-types.js";
import PrimaryKey from "./primary-key.js";
import { ParseFn, Property } from "./property.js";
import { BaseRelation, OptionalRelation, ArrayRelation } from "./relation.js";
import { DateTag, NumberTag, StringTag } from "../typing";

export type ValidKey = string | number | Date;
export type StringValidKeyType = "string" | "date" | "number";
export type ValidKeyType = StringTag | DateTag | NumberTag;

export type ReferenceActions = "Cascade" | "None" | "Restrict";
export type OptionalActions = "SetNull" | ReferenceActions;

export interface RelationOptions<Name extends string, OnDelete> {
    /**
     * Optional identifier name for the relation. This is used to distinguish relations between the same models.
     *
     * It is recommended you always give a relation a name to reduce the risk of relation conflicts.
     */
    name?: Name;

    /**
     * Action to be performed when a document in this model is deleted.
     *
     * If the `bidirectional` option is set to `false`, only the `None` and `Cascade` options are allowed.
     */
    onDelete?: OnDelete;

    /**
     * Enforce a bidirctional relation. This means that this relation mut have a corresponding relation object on the related model.
     * Omitting the corresponding relation will throw an error during model compile time.
     *
     * If set to `false`, a corresponding relation will not be required.
     *
     * @default true
     */
    bidirectional?: boolean;
    array?: boolean;
    optional?: boolean;
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
export type GenFunction<T extends ValidKey> = (...args: unknown[]) => T;

export type FunctionMatch<E> = E extends "string"
    ? string
    : E extends "number"
      ? number
      : E extends "date"
        ? Date
        : never;

export type GetPrimaryKeyType<T> =
    T extends PrimaryKey<any, infer Type> ? Type : never;

export interface FieldOptions {
    unique: boolean;
}

export type RelationOutput<T> =
    T extends PrimaryKey<any, infer Type> ? Type : never;

export type RelationOutputStructure<R extends BaseRelation<any, any>, Output> =
    R extends ArrayRelation<any, any>
        ? Output[]
        : R extends OptionalRelation<any, any>
          ? Output | null
          : Output;

export type NonRelationOutput<T> =
    T extends Property<infer Out, any>
        ? Out
        : T extends PrimaryKey<any, infer Type>
          ? Type
          : never;

export type ValidValue<N extends string = string> =
    | BaseRelation<N, string>
    | Property<any, any>
    | PrimaryKey<boolean, ValidKey>;

export type ParseFnWrap<T extends Dict> = {
    [K in keyof T]: ParseFn<T[K]>;
};

export type PropertyUnion<
    T extends readonly (Property<any, boolean> | ParseFn<any>)[],
> =
    T[number] extends Property<infer Type, boolean>
        ? Type
        : T extends ParseFn<infer Type>
          ? Type
          : never;

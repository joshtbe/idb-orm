import { Dict, ValidKey, ValidKeyType } from "../util-types.js";
import PrimaryKey from "./primary-key.js";
import { AbstractProperty, ParseFn, Property } from "./property.js";
import { BaseRelation, OptionalRelation, ArrayRelation } from "./relation.js";

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
> = R extends ArrayRelation<any, any>
    ? Output[]
    : R extends OptionalRelation<any, any>
    ? Output | undefined
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

export const VALIDATORS: {
    [K in ValidKeyType]: ParseFn<FunctionMatch<K>>;
} = {
    string: (test) => {
        if (typeof test === "string") {
            return {
                success: true,
                data: test,
            };
        } else
            return {
                success: false,
                error: "Value is not a string",
            };
    },
    number: (test) => {
        if (typeof test === "number") {
            return {
                success: true,
                data: test,
            };
        } else
            return {
                success: false,
                error: "Value is not a string",
            };
    },
    date: (test) => {
        if (test instanceof Date) {
            if (!isNaN(test.getTime())) {
                return {
                    success: true,
                    data: test,
                };
            } else {
                return {
                    success: false,
                    error: "Value is not a valid date",
                };
            }
        }
        return {
            success: false,
            error: "Value is not a date",
        };
    },
};

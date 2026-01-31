import { CompiledDb } from "../builder.js";
import {
    ValidValue,
    BaseRelation,
    OptionalRelation,
    ArrayRelation,
    RelationOutput,
    Relation,
    Property,
    PrimaryKey,
    TypeTag,
} from "../field";
import { Dict, Keyof } from "../util-types.js";
import Model from "./model.js";

/**
 * Gets the field key that the primary key can be found on.
 */
export type FindPrimaryKey<F extends Record<string, ValidValue>> = Extract<
    {
        [K in keyof F]: F[K] extends PrimaryKey<any, any> ? K : never;
    }[keyof F],
    string
>;

/**
 * Gets the type of the primary key of a model
 */
export type PrimaryKeyType<M extends Model<any, any, any>> =
    M extends Model<any, infer F, any>
        ? {
              [K in keyof F]: F[K] extends PrimaryKey<any, infer Type>
                  ? Type
                  : never;
          }[keyof F]
        : never;

export interface ModelCache {
    delete?: Set<string>;
    autoIncrement?: number;
}

/**
 * Gets the type of a relation given its model's name
 */
export type RelationValue<Name extends string, C> = Name extends keyof C
    ? C[Name] extends Model<any, infer Fields, infer PrimaryKey>
        ? RelationOutput<Fields[PrimaryKey]>
        : never
    : never;

/**
 * Gets the primitive type of the relation field
 */
export type GetRelationField<F, C> =
    F extends Relation<infer To, any>
        ? RelationValue<To, C>
        : F extends OptionalRelation<infer To, any>
          ? RelationValue<To, C> | null
          : F extends ArrayRelation<infer To, any>
            ? RelationValue<To, C>[]
            : never;

/**
 * Resolved type of the fields of a model
 */
export type ModelStructure<F extends Dict<ValidValue>, C> = {
    [K in keyof F]: F[K] extends Property<infer Output, any>
        ? Output
        : F[K] extends PrimaryKey<any, infer Type>
          ? Type
          : GetRelationField<F[K], C>;
};

/**
 * Gets the resolved type of a document for a given model
 */
export type ModelType<
    M extends Model<any, any, any>,
    C extends CompiledDb<any, any, any>,
> =
    M extends Model<any, infer Fields, any>
        ? C extends CompiledDb<any, any, infer Collection>
            ? ModelStructure<Fields, Collection>
            : never
        : never;

/**
 * Extracts the fields of a Model class
 */
export type ExtractFields<M extends Model<any, any, any>> =
    M extends Model<any, infer Fields, any> ? Fields : never;

/**
 * A string union of every relation field on a model
 */
export type AllRelationKeys<M extends Model<any, any, any>> =
    M extends Model<any, infer Fields, any>
        ? {
              [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
                  ? K
                  : never;
          }[Keyof<Fields>]
        : never;

/**
 * Identical to {@link ModelStructure}, but any relations are omitted
 */
export type RelationlessModelStructure<M extends Model<any, any, any>> =
    M extends Model<any, infer Fields, any>
        ? Omit<
              {
                  [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
                      ? unknown
                      : Fields[K] extends Property<infer Type, any>
                        ? Type
                        : Fields[K] extends PrimaryKey<any, infer Type>
                          ? Type
                          : never;
              },
              AllRelationKeys<M>
          >
        : never;

/**
 * Maps over the keys of a collection and creates a type where each key is a dictionary of typetags. 
 */
export type CollectionSchema<C> =
    C extends Record<infer Keys, Model<any, any, any>>
        ? {
              [K in Keys]: C[K] extends Model<any, infer Fields, any>
                  ? { [K in keyof Fields]: TypeTag }
                  : never;
          }
        : never;

export type FindRelationKey<
    From extends string,
    RelationName extends string,
    M extends Model<any, any, any>,
> =
    M extends Model<any, infer Fields, any>
        ? {
              [K in Keyof<Fields>]: Fields[K] extends BaseRelation<
                  From,
                  infer CurName
              >
                  ? CurName extends RelationName
                      ? K
                      : never
                  : never;
          }[Keyof<Fields>]
        : never;

export type CollectionObject<Names extends string> = {
    [K in Names]: Model<K, any>;
};
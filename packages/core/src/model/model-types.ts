import { CompiledDb } from "../builder.js";
import {
    ValidValue,
    BaseRelation,
    OptionalRelation,
    RelationArray,
    RelationOutput,
    Relation,
    AbstractProperty,
    PrimaryKey,
    ParseFnWrap,
} from "../field";
// import {
//     BaseRelation,
//     OptionalRelation,
//     PrimaryKey,
//     Relation,
//     RelationArray,
//     RelationOutput,
//     ValidValue,
// } from "../field";
import { Dict, Keyof } from "../types.js";
import Model from "./model.js";

export type FindPrimaryKey<F extends Record<string, ValidValue>> = Extract<
    {
        [K in keyof F]: F[K] extends PrimaryKey<any, any> ? K : never;
    }[keyof F],
    string
>;

export type PrimaryKeyType<M extends Model<any, any, any>> = M extends Model<
    any,
    infer F,
    any
>
    ? {
          [K in keyof F]: F[K] extends PrimaryKey<any, infer Type>
              ? Type
              : never;
      }[keyof F]
    : never;

export interface ModelCache {
    delete?: Set<string>;
}

/**
 * Gets the type of a relation given its name
 */
export type RelationValue<Name extends string, C> = Name extends keyof C
    ? C[Name] extends Model<any, infer Fields, infer PrimaryKey>
        ? RelationOutput<Fields[PrimaryKey]>
        : never
    : never;

/**
 * Gets the primitive type of the relation field
 */
export type GetRelationField<F, C> = F extends Relation<infer To, any>
    ? RelationValue<To, C>
    : F extends OptionalRelation<infer To, any>
    ? RelationValue<To, C> | undefined
    : F extends RelationArray<infer To, any>
    ? RelationValue<To, C>[]
    : never;

export type ModelStructure<F extends Dict<ValidValue>, C> = {
    [K in keyof F]: F[K] extends AbstractProperty<infer Output, any>
        ? Output
        : F[K] extends PrimaryKey<any, infer Type>
        ? Type
        : GetRelationField<F[K], C>;
};

export type ModelType<
    M extends Model<any, any, any>,
    C extends CompiledDb<any, any, any>
> = M extends Model<any, infer Fields, any>
    ? C extends CompiledDb<any, any, infer Collection>
        ? ModelStructure<Fields, Collection>
        : never
    : never;

export type ExtractFields<M extends Model<any, any, any>> = M extends Model<
    any,
    infer Fields,
    any
>
    ? Fields
    : never;

export type AllRelationKeys<M extends Model<any, any, any>> = M extends Model<
    any,
    infer Fields,
    any
>
    ? {
          [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
              ? K
              : never;
      }[Keyof<Fields>]
    : never;

export type RelationlessModelStructure<M extends Model<any, any, any>> =
    M extends Model<any, infer Fields, any>
        ? Omit<
              {
                  [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
                      ? unknown
                      : Fields[K] extends AbstractProperty<infer Type, any>
                      ? Type
                      : Fields[K] extends PrimaryKey<any, infer Type>
                      ? Type
                      : never;
              },
              AllRelationKeys<M>
          >
        : never;

export type CollectionSchema<C> = C extends Record<
    infer Keys,
    Model<any, any, any>
>
    ? {
          [K in Keys]: C[K] extends Model<any, infer Fields, any>
              ? ParseFnWrap<ModelStructure<Fields, C>>
              : never;
      }
    : never;

export type FindRelationKey<
    From extends string,
    RelationName extends string,
    M extends Model<any, any, any>
> = M extends Model<any, infer Fields, any>
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

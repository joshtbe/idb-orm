import type { Dict, If, Keyof, RemoveNeverValues } from "../../util-types.js";
import type {
    ExtractFields,
    ModelStructure,
    RelationlessModelStructure,
} from "../../model/model-types.js";
import type { Model } from "../../model";
import type {
    BaseRelation,
    AbstractProperty,
    PrimaryKey,
    RelationOutputStructure,
    ValidValue,
} from "../../field";
import type { CollectionObject } from "../../builder.ts";

export type FilterFn<Input> = (item: Input) => boolean;

/**
 * If an property is an object type (dictionary, array, map, set, etc...) return never. If it's a union it strips out any object types
 */
export type ProhibitObjects<T> = T extends object ? never : T;

export type WhereObject<Fields extends Dict<ValidValue>> = Partial<
    RemoveNeverValues<{
        [K in keyof Fields]: Fields[K] extends AbstractProperty<
            infer Output,
            any
        >
            ? Output | FilterFn<Output>
            : Fields[K] extends PrimaryKey<any, infer Type>
            ? ProhibitObjects<Type> | FilterFn<Type>
            : never;
    }>
>;

export type SelectObject<
    All extends string,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>
> = {
    [K in keyof Fields]?: Fields[K] extends AbstractProperty<any, any>
        ? true
        : Fields[K] extends PrimaryKey<any, any>
        ? true
        : Fields[K] extends BaseRelation<infer To, any>
        ?
              | true
              | (To extends Keyof<C>
                    ? C[To] extends Model<any, infer SubFields, any>
                        ? QueryInput<All, SubFields, C>
                        : never
                    : never)
        : never;
};

export interface QueryInput<
    All extends string,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>
> {
    where?: WhereObject<Fields>;
    select?: SelectObject<All, Fields, C>;
    include?: SelectObject<All, Fields, C>;
}

export type FindInput<
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = Struct extends Model<any, infer Fields, any>
    ? QueryInput<All, Fields, C>
    : never;

type _FindOutput<
    All extends string,
    Select extends Dict<Dict | true>,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>
> =
    | {
          [K in Keyof<Select>]: Fields[K] extends BaseRelation<infer To, any>
              ? To extends Keyof<C>
                  ? C[To] extends Model<any, infer Sub, any>
                      ? If<
                            Select[K] extends true ? true : false,
                            RelationOutputStructure<
                                Fields[K],
                                RelationlessModelStructure<C[To]>
                            >,
                            Select[K] extends Dict<Dict | true>
                                ? RelationOutputStructure<
                                      Fields[K],
                                      _FindOutput<All, Select[K], Sub, C>
                                  >
                                : never
                        >
                      : never
                  : never
              : Fields[K] extends PrimaryKey<any, infer Type>
              ? Type
              : Fields[K] extends AbstractProperty<infer Type, any>
              ? Type
              : never;
      }
    | undefined;

export type FindOutput<
    All extends string,
    Struct extends Model<any, any, any>,
    C extends CollectionObject<All>,
    F extends FindInput<All, Struct, C>
> = Struct extends Model<any, infer Fields, any>
    ? F extends object
        ?
              | (F["select"] extends Dict<true | Dict>
                    ? _FindOutput<All, F["select"], Fields, C>
                    : ModelStructure<ExtractFields<Struct>, C>)
              | undefined
        : never
    : never;

import type {
    Dict,
    If,
    Keyof,
    MakeRequired,
    NoUndefined,
    RemoveNeverValues,
    Simplify,
} from "../../util-types.js";
import type {
    ExtractFields,
    ModelStructure,
    RelationlessModelStructure,
    RelationValue,
} from "../../model/model-types";
import type { Model, CollectionObject } from "../../model";
import type {
    BaseRelation,
    AbstractProperty,
    PrimaryKey,
    RelationOutputStructure,
    ValidValue,
    Relation,
} from "../../field";

export type FilterFn<Input> = (item: Input) => boolean;

/**
 * If an property is an object type (dictionary, array, map, set, etc...) return never. If it's a union it strips out any object types
 */
export type ProhibitObjects<T> = T extends Date
    ? Date
    : T extends object
    ? never
    : T;

export type WhereObject<Fields extends Dict<ValidValue>> = Partial<
    RemoveNeverValues<{
        [K in keyof Fields]: Fields[K] extends AbstractProperty<
            infer Output,
            any
        >
            ? ProhibitObjects<Output> | FilterFn<Output>
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

type SelectOutput<
    All extends string,
    Select extends Dict<Dict | true>,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>
> =
    | {
          [K in Keyof<Select>]: Fields[K] extends BaseRelation<infer To, any>
              ? To extends Keyof<C>
                  ? C[To] extends Model<any, any, any>
                      ? If<
                            Select[K] extends true ? true : false,
                            RelationOutputStructure<
                                Fields[K],
                                RelationlessModelStructure<C[To]>
                            >,
                            Select[K] extends FindInput<All, C[To], C>
                                ? RelationOutputStructure<
                                      Fields[K],
                                      FindOutput<All, C[To], C, Select[K]>
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
      };

type IncludeOutput<
    All extends string,
    Include extends Dict<Dict | true>,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>
> = Simplify<{
    [K in Keyof<Fields>]: Fields[K] extends BaseRelation<infer To, any>
        ? To extends Keyof<C>
            ? C[To] extends Model<any, any, any>
                ? K extends Keyof<Include>
                    ? Include[K] extends true
                        ? RelationOutputStructure<
                              Fields[K],
                              RelationlessModelStructure<C[To]>
                          >
                        : Include[K] extends FindInput<All, C[To], C>
                        ? MakeRequired<
                              Fields[K] extends Relation<any, any>
                                  ? true
                                  : false,
                              NoUndefined<
                                  RelationOutputStructure<
                                      Fields[K],
                                      NoUndefined<
                                          FindOutput<All, C[To], C, Include[K]>
                                      >
                                  >
                              >
                          >
                        : unknown
                    : RelationOutputStructure<Fields[K], RelationValue<To, C>>
                : never
            : never
        : Fields[K] extends PrimaryKey<any, infer Type>
        ? Type
        : Fields[K] extends AbstractProperty<infer Type, any>
        ? Type
        : never;
}>;

export type FindOutput<
    All extends string,
    Struct extends Model<any, any, any>,
    C extends CollectionObject<All>,
    F extends FindInput<All, Struct, C>
> = Struct extends Model<any, infer Fields, any>
    ?
          | Simplify<
                F["select"] extends Dict<true | Dict>
                    ? SelectOutput<All, F["select"], Fields, C>
                    : F["include"] extends Dict<true | Dict>
                    ? IncludeOutput<All, F["include"], Fields, C>
                    : ModelStructure<ExtractFields<Struct>, C>
            >
          | undefined
    : never;

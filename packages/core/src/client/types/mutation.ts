import type {
    MakeArrayable,
    MakeOptional,
    RemoveNeverValues,
    PartialOnUndefined,
    Extends,
    If,
    Or,
    Keyof,
} from "../../util-types.js";
import type {
    BaseRelation,
    AbstractProperty,
    OptionalRelation,
    PrimaryKey,
    ArrayRelation,
} from "../../field";
import type { CollectionObject } from "../../builder.ts";
import { WhereObject } from "./find.js";
import { Model, FindRelationKey, RelationValue } from "../../model";

export type MutationAction =
    | "$connect"
    | "$connectMany"
    | "$create"
    | "$createMany"
    | "$update"
    | "$updateMany"
    | "$delete"
    | "$deleteMany"
    | "$deleteAll"
    | "$disconnect"
    | "$disconnectMany"
    | "$disconnectAll";

type WhereSelection<Struct extends object> = Struct extends Model<
    any,
    infer Fields,
    any
>
    ? WhereObject<Fields>
    : never;

type _UpdateRelationMutation<
    This extends All,
    All extends string,
    C extends CollectionObject<All>,
    To extends All,
    Name extends string,
    Relation extends BaseRelation<To, Name>,
    ThisKey extends string,
    OmitKeys extends string,
    IsOptional extends boolean = Extends<Relation, OptionalRelation<any, any>>,
    IsArray extends boolean = Extends<Relation, ArrayRelation<any, any>>,
    IsNullable extends boolean = Or<IsOptional, IsArray>
> = MakeOptional<
    IsNullable,
    | MakeArrayable<
          IsArray,
          | {
                $connect: RelationValue<To, C>;
            }
          | {
                $create: Omit<
                    AddMutation<To, All, C[To], C>,
                    OmitKeys | FindRelationKey<This, Name, C[To]>
                >;
            }
          | {
                $update: If<
                    IsArray,
                    UpdateMutation<To, All, C[To], C, OmitKeys | ThisKey>,
                    Omit<UpdateMutation<To, All, C[To], C>["data"], OmitKeys>
                >;
            }
          | If<
                IsNullable,
                | {
                      $delete: If<IsArray, RelationValue<To, C>, true>;
                  }
                | {
                      $disconnect: If<IsArray, RelationValue<To, C>, true>;
                  },
                never
            >
      >
    | If<
          IsArray,
          | {
                $connectMany: RelationValue<To, C>[];
            }
          | {
                $createMany: Omit<
                    AddMutation<To, All, C[To], C>,
                    OmitKeys | FindRelationKey<This, Name, C[To]>
                >[];
            }
          | {
                $updateMany: UpdateMutation<
                    To,
                    All,
                    C[To],
                    C,
                    OmitKeys | ThisKey
                >[];
            }
          | {
                $deleteMany: RelationValue<To, C>[];
            }
          | {
                $deleteAll: true;
            }
          | {
                $disconnectMany: RelationValue<To, C>[];
            }
          | {
                $disconnectAll: true;
            },
          never
      >
>;

export type UpdateMutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>,
    OmitKeys extends string = never
> = {
    where?: WhereSelection<Struct>;
    data: PartialOnUndefined<
        RemoveNeverValues<
            Struct extends Model<any, infer Fields, any>
                ? {
                      [K in Exclude<
                          Keyof<Fields>,
                          OmitKeys
                      >]: Fields[K] extends AbstractProperty<infer Type, any>
                          ? Type | undefined | ((value: Type) => Type)
                          : Fields[K] extends PrimaryKey<any, any>
                          ? never
                          : Fields[K] extends BaseRelation<infer To, infer Name>
                          ? To extends All
                              ?
                                    | _UpdateRelationMutation<
                                          This,
                                          All,
                                          C,
                                          To,
                                          Name,
                                          Fields[K],
                                          K,
                                          OmitKeys
                                      >
                                    | undefined
                              : never
                          : never;
                  }
                : never
        >
    >;
};

export type AddMutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = PartialOnUndefined<
    RemoveNeverValues<
        Struct extends Model<any, infer Fields, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends AbstractProperty<
                      infer Type,
                      infer HasDefault
                  >
                      ? HasDefault extends true
                          ? Type | undefined
                          : Type
                      : Fields[K] extends PrimaryKey<infer IsAuto, infer Type>
                      ? IsAuto extends true
                          ? never
                          : Type
                      : Fields[K] extends BaseRelation<infer To, infer Name>
                      ? To extends All
                          ? MakeOptional<
                                Fields[K] extends OptionalRelation<any, any>
                                    ? true
                                    : Fields[K] extends ArrayRelation<any, any>
                                    ? true
                                    : false,
                                | MakeArrayable<
                                      Fields[K] extends ArrayRelation<any, any>
                                          ? true
                                          : false,
                                      | {
                                            $connect: RelationValue<To, C>;
                                        }
                                      | {
                                            $create: Omit<
                                                AddMutation<To, All, C[To], C>,
                                                FindRelationKey<
                                                    This,
                                                    Name,
                                                    C[To]
                                                >
                                            >;
                                        }
                                  >
                                | (Fields[K] extends ArrayRelation<any, any>
                                      ?
                                            | {
                                                  $connectMany: RelationValue<
                                                      To,
                                                      C
                                                  >[];
                                              }
                                            | {
                                                  $createMany: Omit<
                                                      AddMutation<
                                                          To,
                                                          All,
                                                          C[To],
                                                          C
                                                      >,
                                                      FindRelationKey<
                                                          This,
                                                          Name,
                                                          C[To]
                                                      >
                                                  >[];
                                              }
                                      : never)
                            >
                          : never
                      : never;
              }
            : never
    >
>;

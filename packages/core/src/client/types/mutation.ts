import type {
    MakeArrayable,
    MakeOptional,
    RemoveNeverValues,
    PartialOnUndefined,
    Extends,
    If,
    Or,
    Keyof,
} from "../../util-types";
import type {
    BaseRelation,
    Property,
    OptionalRelation,
    PrimaryKey,
    ArrayRelation,
} from "../../field";
import { WhereObject } from "./find";
import {
    Model,
    FindRelationKey,
    RelationValue,
    CollectionObject,
} from "../../model";

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
    IsNullable extends boolean = Or<IsOptional, IsArray>,
    Value = RelationValue<To, C>,
    Dest extends C[To] = C[To]
> = MakeOptional<
    IsNullable,
    | MakeArrayable<
          IsArray,
          | {
                $connect: Value;
            }
          | {
                $create: Omit<
                    AddMutation<To, All, Dest, C>,
                    OmitKeys | FindRelationKey<This, Name, Dest>
                >;
            }
          | {
                $update: If<
                    IsArray,
                    UpdateMutation<To, All, Dest, C, OmitKeys | ThisKey>,
                    Omit<UpdateMutation<To, All, Dest, C>["data"], OmitKeys>
                >;
            }
          | If<
                IsNullable,
                | {
                      $delete: If<IsArray, Value, true>;
                  }
                | {
                      $disconnect: If<IsArray, Value, true>;
                  },
                never
            >
      >
    | If<
          IsArray,
          | {
                $connectMany: Value[];
            }
          | {
                $createMany: Omit<
                    AddMutation<To, All, Dest, C>,
                    OmitKeys | FindRelationKey<This, Name, Dest>
                >[];
            }
          | {
                $updateMany: UpdateMutation<
                    To,
                    All,
                    Dest,
                    C,
                    OmitKeys | ThisKey
                >[];
            }
          | {
                $deleteMany: Value[];
            }
          | {
                $deleteAll: true;
            }
          | {
                $disconnectMany: Value[];
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
                      >]: Fields[K] extends Property<infer Type, any>
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

type AddMutationRelation<
    This extends All,
    All extends string,
    C extends CollectionObject<All>,
    To extends All,
    RelationName extends string,
    Relation extends BaseRelation<any, any>,
    IsArray extends boolean = Extends<Relation, ArrayRelation<any, any>>,
    Value = RelationValue<To, C>
> = MakeOptional<
    Or<IsArray, Extends<Relation, OptionalRelation<any, any>>>,
    | MakeArrayable<
          IsArray,
          | {
                $connect: Value;
            }
          | {
                $create: Omit<
                    AddMutation<To, All, C[To], C>,
                    FindRelationKey<This, RelationName, C[To]>
                >;
            }
      >
    | If<
          IsArray,
          | {
                $connectMany: Value[];
            }
          | {
                $createMany: Omit<
                    AddMutation<To, All, C[To], C>,
                    FindRelationKey<This, RelationName, C[To]>
                >[];
            },
          never
      >
>;

export type AddMutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = PartialOnUndefined<
    RemoveNeverValues<
        Struct extends Model<any, infer Fields, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends Property<
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
                          ? AddMutationRelation<
                                This,
                                All,
                                C,
                                To,
                                Name,
                                Fields[K]
                            >
                          : never
                      : never;
              }
            : never
    >
>;

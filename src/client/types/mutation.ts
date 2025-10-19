import type {
    MakeArrayable,
    MakeOptional,
    RemoveNeverValues,
    PartialOnUndefined,
} from "../../types/common.js";
import type { FindRelationKey, Model, RelationValue } from "../../model.js";
import type {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    RelationArray,
} from "../../field.ts";
import type { CollectionObject } from "../../builder.ts";
import { WhereObject } from "./find.js";
import { Arrayable } from "type-fest";

export type MutationActions =
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

export type Mutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>,
    MutType extends string = "add"
> = PartialOnUndefined<
    RemoveNeverValues<
        Struct extends Model<any, infer Fields, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends Field<
                      infer Type,
                      infer HasDefault
                  >
                      ? MutType extends "update"
                          ? Type | undefined | ((value: Type) => Type)
                          : HasDefault extends true
                          ? Type | undefined
                          : Type
                      : Fields[K] extends PrimaryKey<infer IsAuto, infer Type>
                      ? MutType extends "update"
                          ? never
                          : IsAuto extends true
                          ? never
                          : Type
                      : Fields[K] extends BaseRelation<infer To, infer Name>
                      ? To extends All
                          ? MakeOptional<
                                Fields[K] extends OptionalRelation<any, any>
                                    ? true
                                    : Fields[K] extends RelationArray<any, any>
                                    ? true
                                    : MutType extends "update"
                                    ? true
                                    : false,
                                | MakeArrayable<
                                      Fields[K] extends RelationArray<any, any>
                                          ? true
                                          : false,
                                      | {
                                            $connect: RelationValue<To, C>;
                                        }
                                      | {
                                            $create: Omit<
                                                Mutation<
                                                    To,
                                                    All,
                                                    C[To],
                                                    C,
                                                    "add"
                                                >,
                                                FindRelationKey<
                                                    This,
                                                    Name,
                                                    C[To]
                                                >
                                            >;
                                        }
                                      | (MutType extends "update"
                                            ?
                                                  | {
                                                        $update: Fields[K] extends RelationArray<
                                                            any,
                                                            any
                                                        >
                                                            ? {
                                                                  where?: WhereSelection<
                                                                      C[To]
                                                                  >;
                                                                  data: Mutation<
                                                                      To,
                                                                      All,
                                                                      C[To],
                                                                      C,
                                                                      MutType
                                                                  >;
                                                              }
                                                            : Mutation<
                                                                  To,
                                                                  All,
                                                                  C[To],
                                                                  C,
                                                                  MutType
                                                              >;
                                                    }
                                                  | {
                                                        $delete: Fields[K] extends RelationArray<
                                                            any,
                                                            any
                                                        >
                                                            ? RelationValue<
                                                                  To,
                                                                  C
                                                              >
                                                            : true;
                                                    }
                                                  | {
                                                        $disconnect: Fields[K] extends RelationArray<
                                                            any,
                                                            any
                                                        >
                                                            ? RelationValue<
                                                                  To,
                                                                  C
                                                              >
                                                            : true;
                                                    }
                                            : never)
                                  >
                                | (Fields[K] extends RelationArray<any, any>
                                      ?
                                            | {
                                                  $connectMany: RelationValue<
                                                      To,
                                                      C
                                                  >[];
                                              }
                                            | {
                                                  $createMany: Omit<
                                                      Mutation<
                                                          To,
                                                          All,
                                                          C[To],
                                                          C,
                                                          "add"
                                                      >,
                                                      FindRelationKey<
                                                          This,
                                                          Name,
                                                          C[To]
                                                      >
                                                  >[];
                                              }
                                            | {
                                                  $updateMany: {
                                                      where?: WhereSelection<
                                                          C[To]
                                                      >;
                                                      data: Mutation<
                                                          To,
                                                          All,
                                                          C[To],
                                                          C,
                                                          MutType
                                                      >;
                                                  }[];
                                              }
                                            | {
                                                  $deleteMany: RelationValue<
                                                      To,
                                                      C
                                                  >[];
                                              }
                                            | {
                                                  $deleteAll: true;
                                              }
                                            | {
                                                  $disconnectMany: RelationValue<
                                                      To,
                                                      C
                                                  >[];
                                              }
                                            | {
                                                  $disconnectAll: true;
                                              }
                                      : never)
                            >
                          : never
                      : never;
              }
            : never
    >
>;

export type AddMutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = Mutation<This, All, Struct, C, "add">;

export interface UpdateMutation<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> {
    where?: WhereSelection<Struct>;
    data: Mutation<This, All, Struct, C, "update">;
}

type WhereSelection<Struct extends object> = Struct extends Model<
    any,
    infer Fields,
    any
>
    ? WhereObject<Fields>
    : never;

import type {
    MakeArrayable,
    MakeOptional,
    RemoveNeverValues,
    PartialOnUndefined,
} from "../../types.ts";
import type { FindRelationKey, Model, RelationValue } from "../../model.js";
import type {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    RelationArray,
} from "../../field.ts";
import type { CollectionObject } from "../../builder.ts";

export type MutationQuery<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = PartialOnUndefined<
    RemoveNeverValues<
        Struct extends Model<any, infer Fields, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends Field<any, infer Input>
                      ? Input
                      : Fields[K] extends PrimaryKey<infer IsAuto, infer Type>
                      ? IsAuto extends true
                          ? never
                          : Type | undefined
                      : Fields[K] extends BaseRelation<infer To, infer Name>
                      ? To extends All
                          ? MakeOptional<
                                Fields[K] extends OptionalRelation<any, any>
                                    ? true
                                    : Fields[K] extends RelationArray<any, any>
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
                                                MutationQuery<
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
                                            >;
                                        }
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
                                                      MutationQuery<
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

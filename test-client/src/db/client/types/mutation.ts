import type {
    DoesExtend,
    If,
    MakeArrayable,
    MakeOptional,
    RemoveNeverValues,
} from "../../types.ts";
import type {
    FindRelationKey,
    Model,
    RelationValue,
} from "../../base-model.ts";
import type {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    RelationArray,
} from "../../field.ts";
import type { PartialOnUndefinedDeep } from "type-fest";
import type { CollectionObject } from "../../builder.ts";

// TODO: Accept $createMany, and $connectMany object arguments instead of array
export type MutationQuery<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = PartialOnUndefinedDeep<
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
                                If<
                                    DoesExtend<
                                        Fields[K],
                                        OptionalRelation<any, any>
                                    >,
                                    true,
                                    DoesExtend<
                                        Fields[K],
                                        RelationArray<any, any>
                                    >
                                >,
                                MakeArrayable<
                                    DoesExtend<
                                        Fields[K],
                                        RelationArray<any, any>
                                    >,
                                    | {
                                          $connect: RelationValue<To, C>;
                                      }
                                    | {
                                          $create: Omit<
                                              MutationQuery<To, All, C[To], C>,
                                              FindRelationKey<This, Name, C[To]>
                                          >;
                                      }
                                >
                            >
                          : never
                      : never;
              }
            : never
    >
>;

import type {
    Dec,
    Dict,
    Keyof,
    MakeRequired,
    NoUndefined,
    RecursionLimit,
    RemoveNeverValues,
    Simplify,
} from "../../util-types";
import type {
    GetRelationField,
    ModelStructure,
    ModelType,
    RelationValue,
} from "../../model/model-types";
import type { Model, CollectionObject } from "../../model";
import type {
    BaseRelation,
    PrimaryKey,
    RelationOutputStructure,
    ValidValue,
    Relation,
    Property,
} from "../../field";
import { CompiledDb } from "../../builder";

export type FilterFn<Input> = (item: Input) => boolean;

/**
 * If an property is an object type (dictionary, array, map, set, etc...) return never. If it's a union it strips out any object types
 *
 * `Date` objects are allowed
 */
export type ProhibitObjects<T> = T extends Date
    ? Date
    : T extends object
      ? never
      : T;

type ModelFields<C, K extends keyof C> =
    C[K] extends Model<any, infer Fields, any> ? Fields : never;

export type WhereObject<
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<string>,
> = Partial<
    RemoveNeverValues<{
        [K in keyof Fields]: Fields[K] extends Property<infer Output, any>
            ? ProhibitObjects<Output> | FilterFn<Output>
            : Fields[K] extends PrimaryKey<any, infer Type>
              ? ProhibitObjects<Type> | FilterFn<Type>
              :
                    | ProhibitObjects<GetRelationField<Fields[K], C>>
                    | FilterFn<GetRelationField<Fields[K], C>>;
    }>
>;

export type SelectObject<
    All extends string,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>,
    Depth extends number,
> = {
    [K in keyof Fields]?: Fields[K] extends Property<any, any>
        ? true
        : Fields[K] extends PrimaryKey<any, any>
          ? true
          : Fields[K] extends BaseRelation<infer To, any>
            ?
                  | true
                  | (To extends Keyof<C>
                        ? C[To] extends Model<any, infer SubFields, any>
                            ? QueryInput<All, SubFields, C, Depth>
                            : never
                        : never)
            : never;
};

export interface QueryInput<
    All extends string,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>,
    Depth extends number = RecursionLimit,
> {
    where?: WhereObject<Fields, C>;
    select?: SelectObject<All, Fields, C, Depth>;
    include?: SelectObject<All, Fields, C, Depth>;
}

export type FindInput<
    All extends string,
    To extends keyof C,
    C extends CollectionObject<All>,
    Depth extends number = RecursionLimit,
> = Depth extends 0
    ? never
    : QueryInput<All, ModelFields<C, To>, C, Dec<Depth>>;

type NormalizeQuery<F> = F extends { select: infer S }
    ? { mode: "select"; value: S }
    : F extends { include: infer I }
      ? { mode: "include"; value: I }
      : { mode: "none"; value: any };

type _SelectOutput<
    All extends string,
    Select extends Dict<Dict | true>,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>,
    Depth extends number,
> = {
    [K in Keyof<Select>]: Fields[K] extends BaseRelation<infer To, any>
        ? To extends keyof C
            ? Select[K] extends true
                ? RelationOutputStructure<
                      Fields[K],
                      Simplify<ModelType<C[To], CompiledDb<string, string, C>>>
                  >
                : Select[K] extends FindInput<All, To, C, Depth>
                  ? RelationOutputStructure<
                        Fields[K],
                        FindOutput<All, To, C, Select[K]>
                    >
                  : never
            : never
        : Fields[K] extends PrimaryKey<any, infer Type>
          ? Type
          : Fields[K] extends Property<infer Type, any>
            ? Type
            : never;
};

type _IncludeOutput<
    All extends string,
    Include extends Record<Keys, Dict | true>,
    Fields extends Dict<ValidValue>,
    C extends CollectionObject<All>,
    Depth extends number,
    Keys extends Keyof<Fields> = Keyof<Fields>,
> = {
    [K in Keys]: Fields[K] extends BaseRelation<infer To, any>
        ? To extends keyof C
            ? Include[K] extends true
                ? RelationOutputStructure<
                      Fields[K],
                      Simplify<ModelType<C[To], CompiledDb<string, string, C>>>
                  >
                : Include[K] extends FindInput<All, To, C, Depth>
                  ? MakeRequired<
                        Fields[K] extends Relation<any, any> ? true : false,
                        NoUndefined<
                            RelationOutputStructure<
                                Fields[K],
                                NoUndefined<FindOutput<All, To, C, Include[K]>>
                            >
                        >
                    >
                  : RelationOutputStructure<Fields[K], RelationValue<To, C>>
            : RelationOutputStructure<Fields[K], RelationValue<To, C>>
        : Fields[K] extends PrimaryKey<any, infer Type>
          ? Type
          : Fields[K] extends Property<infer Type, any>
            ? Type
            : never;
};

type _OutputFromQuery<
    Q extends NormalizeQuery<any>,
    Fields extends Dict<ValidValue>,
    All extends string,
    C extends CollectionObject<All>,
    Depth extends number,
> = Q["mode"] extends "none"
    ? ModelStructure<Fields, C>
    : Q["mode"] extends "select"
      ? _SelectOutput<All, Q["value"], Fields, C, Depth>
      : Q["mode"] extends "include"
        ? _IncludeOutput<All, Q["value"], Fields, C, Depth>
        : never;

export type FindOutput<
    All extends string,
    Name extends keyof C,
    C extends CollectionObject<All>,
    FIn extends FindInput<All, Name, C>,
    Depth extends number = RecursionLimit,
> = Depth extends 0
    ? unknown
    : C[Name] extends Model<any, infer Fields, any>
      ?
            | Simplify<
                  _OutputFromQuery<
                      NormalizeQuery<FIn>,
                      Fields,
                      All,
                      C,
                      Dec<Depth>
                  >
              >
            | undefined
      : never;

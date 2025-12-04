import type { Dict, Simplify } from "../../util-types.js";
import type {
    ExtractFields,
    Model,
    ModelStructure,
    PrimaryKeyType,
    CollectionObject,
} from "../../model";
import type {
    AddMutation,
    MutationAction,
    UpdateMutation,
} from "./mutation.ts";
import type { FindInput, FindOutput, WhereObject } from "./find.ts";
import type { CompiledQuery } from "../compiled-query.ts";
import type { DbClient } from "../index.ts";
import { Transaction } from "../../transaction.js";
import { BaseRelation, ValidKey } from "../../field";
import { CsvDump, JsonDump } from "../../dump/class.js";

export type GetStructure<N extends string, C extends Dict> = C[N] extends Model<
    N,
    infer F,
    any
>
    ? Simplify<ModelStructure<F, C>>
    : never;

export type ExportFormat = "json";

export interface StoreInterface<
    Name extends Names,
    Names extends string,
    C extends CollectionObject<Names>,
    KeyType = PrimaryKeyType<C[Name]>,
    Add = AddMutation<Name, Names, C[Name], C>,
    Update extends UpdateMutation<Name, Names, C[Name], C> = UpdateMutation<
        Name,
        Names,
        C[Name],
        C
    >
> {
    add(
        mutation: Add,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<KeyType>;
    addMany(
        mutations: Add[],
        transaction?: Transaction<"readwrite", Names>
    ): Promise<KeyType[]>;
    find<T extends FindInput<Names, C[Name], C>>(
        query: T,
        transaction?: Transaction<IDBTransactionMode, Names>
    ): Promise<NonNullable<FindOutput<Names, C[Name], C, T>>[]>;
    findFirst<T extends FindInput<Names, C[Name], C>>(
        query: T,
        transaction?: Transaction<IDBTransactionMode, Names>
    ): Promise<FindOutput<Names, C[Name], C, T>>;
    update(key: KeyType, data: Update["data"]): Promise<GetStructure<Name, C>>;
    updateFirst(
        item: Update,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<GetStructure<Name, C> | undefined>;
    updateMany(
        item: Update,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<GetStructure<Name, C>[]>;

    delete(key: KeyType): Promise<boolean>;
    deleteFirst(where?: WhereObject<ExtractFields<C[Name]>>): Promise<boolean>;
    deleteMany(where: WhereObject<ExtractFields<C[Name]>>): Promise<number>;
    compileQuery<T extends FindInput<Names, C[Name], C>>(
        query: T
    ): CompiledQuery<Names, C, DbClient<string, Names, C>, T>;
    get(key: KeyType): Promise<GetStructure<Name, C> | undefined>;

    dump<Format extends ExportFormat>(
        format: Format,
        where?: WhereObject<
            C[Name] extends Model<any, infer Fields, any> ? Fields : never
        >
    ): Promise<Format extends "json" ? JsonDump : CsvDump>;
}

export type InterfaceMap<
    Names extends string,
    C extends CollectionObject<Names>
> = {
    [K in Names]: Simplify<StoreInterface<K, Names, C>>;
};

export interface QueryState<Names extends string> {
    tx?: Transaction<IDBTransactionMode, Names>;
}

export interface MutationState<Names extends string>
    extends Partial<{
        tx: Transaction<"readwrite", Names>;
        relation: { id: ValidKey; key: string };
        singleton: {
            id: ValidKey;
        };
        /**
         * Flag indicating whether or not this is the final step of the query/mutation
         * @default true
         */
        finalStep: boolean;
    }> {}

export type ActionItem = [action: MutationAction, value: unknown];
export type KeyObject<Index = string> =
    | {
          key: Index;
      } & (
          | {
                isRelation: true;
                actions: ActionItem[];
                relation: BaseRelation<any, any>;
                updateFn?: undefined;
            }
          | {
                isRelation: false;
                actions?: undefined;
                relation?: undefined;
                updateFn: <T>(value: T) => T;
            }
      );

export type { AddMutation, UpdateMutation };

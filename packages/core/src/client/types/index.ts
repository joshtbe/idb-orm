import type { CollectionObject } from "../../builder.ts";
import type { Dict, ValidKey } from "../../util-types.js";
import type {
    ExtractFields,
    Model,
    ModelStructure,
    PrimaryKeyType,
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
import { BaseRelation } from "../../field";

export type InsertMutation<
    N extends string,
    C extends Dict
> = C[N] extends Model<N, infer F, any> ? ModelStructure<F, C> : never;

export interface StoreInterface<
    Name extends Names,
    Names extends string,
    C extends CollectionObject<Names>,
    KeyType = PrimaryKeyType<C[Name]>,
    Add = AddMutation<Name, Names, C[Name], C>,
    Update = UpdateMutation<Name, Names, C[Name], C>
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
    ): Promise<FindOutput<Names, C[Name], C, T>[]>;
    findFirst<T extends FindInput<Names, C[Name], C>>(
        query: T,
        transaction?: Transaction<IDBTransactionMode, Names>
    ): Promise<FindOutput<Names, C[Name], C, T>>;
    put(): Promise<void>;
    insert(
        item: InsertMutation<Name, C>,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<KeyType>;
    updateFirst(
        item: Update,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<KeyType | undefined>;
    updateMany(
        item: Update,
        transaction?: Transaction<"readwrite", Names>
    ): Promise<KeyType[]>;

    delete(key: KeyType): Promise<boolean>;
    deleteFirst(where?: WhereObject<ExtractFields<C[Name]>>): Promise<boolean>;
    deleteMany(where: WhereObject<ExtractFields<C[Name]>>): Promise<number>;

    /**
     * Clears a store (does not update any relations)
     */
    clear(transaction?: Transaction<"readwrite", Names>): Promise<void>;
    compileQuery<T extends FindInput<Names, C[Name], C>>(
        query: T
    ): CompiledQuery<Names, C, DbClient<string, Names, C>, T>;
    get(
        key: KeyType
    ): Promise<
        | (C[Name] extends Model<any, infer Fields, any>
              ? ModelStructure<Fields, C>
              : never)
        | undefined
    >;
}

export type InterfaceMap<
    Names extends string,
    C extends CollectionObject<Names>
> = {
    [K in Names]: StoreInterface<K, Names, C>;
};

export interface QueryState<Names extends string> {
    tx?: Transaction<IDBTransactionMode, Names>;
}

export const enum MutationBreath {
    Find,
    Singleton,
}

export enum Action {
    connect,
    create,
    disconnect,
    update,
    delete,
}
export type ActionKey = keyof typeof Action;

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

import type { CollectionObject } from "../../builder.ts";
import type { Dict, ValidKey } from "../../types/common.js";
import type {
    ExtractFields,
    Model,
    ModelStructure,
    PrimaryKeyType,
} from "../../model.js";
import type { AddMutation, UpdateMutation } from "./mutation.ts";
import type { FindInput, FindOutput, WhereObject } from "./find.ts";
import type { CompiledQuery } from "../compiled-query.ts";
import type { DbClient } from "../index.ts";
import { Transaction } from "../../transaction.js";
import { BaseRelation } from "../../field.js";

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

export interface MutationState<Names extends string>
    extends Partial<{
        tx: Transaction<"readwrite", Names>;
        relation: { id: ValidKey; key: string };
    }> {}

export type KeyObject<Index = string> =
    | {
          isFun: boolean;
          key: Index;
      } & (
          | {
                isRelation: true;
                relation: BaseRelation<any, any>;
            }
          | {
                isRelation: false;
                relation?: undefined;
            }
      );

export type { AddMutation, UpdateMutation };

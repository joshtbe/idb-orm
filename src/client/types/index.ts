import type { CollectionObject } from "../../builder.ts";
import type { Dict } from "../../types.ts";
import type { Model, ModelStructure, PrimaryKeyType } from "../../model.js";
import type { MutationQuery } from "./mutation.ts";
import type { FindInput, FindOutput } from "./find.ts";
import type { CompiledQuery } from "../compiled-query.ts";
import type { DbClient } from "../index.ts";

export type InsertMutation<
    N extends string,
    C extends Dict
> = C[N] extends Model<N, infer F, any> ? ModelStructure<F, C> : never;

export interface StoreInterface<
    Name extends Names,
    Names extends string,
    C extends CollectionObject<Names>,
    KeyType = PrimaryKeyType<C[Name]>,
    Mutation = MutationQuery<Name, Names, C[Name], C>
> {
    add(mutation: Mutation): Promise<KeyType>;
    find<T extends FindInput<Names, C[Name], C>>(
        query: T
    ): Promise<FindOutput<Names, C[Name], C, T>[]>;
    findFirst<T extends FindInput<Names, C[Name], C>>(
        query: T
    ): Promise<FindOutput<Names, C[Name], C, T>>;
    put(): Promise<void>;
    insert(item: InsertMutation<Name, C>): Promise<KeyType>;
    updateFirst(item: Mutation): Promise<KeyType>;
    updateMany(item: Mutation): Promise<KeyType[]>;

    /**
     * Clears a store (does not update any relations)
     */
    clear(): Promise<void>;
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

export type { MutationQuery };

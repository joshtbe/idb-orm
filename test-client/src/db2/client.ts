import {
    Model,
    ModelCollection,
    type CollectionGeneric,
    type GetPrimaryKey,
    type ResolvedModel,
} from "./model.ts";
import StoreInterface, { type InterfaceMap } from "./inferface.ts";
import type { OnlyString } from "./types.ts";
import { getKeys } from "./utils.ts";
import type { Arrayable } from "type-fest";
import { Transaction } from "./transaction.ts";

export class DbClient<
    Collection extends ModelCollection<any>,
    Interfaces extends InterfaceMap<Collection> = InterfaceMap<Collection>
> {
    public readonly stores: Interfaces;
    private readonly storeNames: OnlyString<keyof Interfaces>[];
    constructor(
        private readonly db: IDBDatabase,
        public readonly collection: Collection
    ) {
        this.storeNames = getKeys(collection.models) as OnlyString<
            keyof Interfaces
        >[];
        const map: Interfaces = {} as Interfaces;
        for (const key of this.storeNames) {
            map[key] = new StoreInterface(
                key,
                this as unknown as DbClient<
                    Collection,
                    InterfaceMap<Collection>
                >,
                this.collection.models[key],
                this.collection.schemas[key]
            ) as unknown as Interfaces[OnlyString<keyof Interfaces>];
        }
        this.stores = map;
    }

    getStore(store: keyof Interfaces) {
        return this.stores[store];
    }

    public transaction(
        mode: IDBTransactionMode,
        stores: Arrayable<Extract<keyof Collection["models"], string>>
    ) {
        return new Transaction(this.db, stores, mode);
    }
}

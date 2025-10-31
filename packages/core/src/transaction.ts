import {
    AssertionError,
    InvalidTransactionError,
    ObjectStoreNotFoundError,
    StoreError,
    UnknownError,
} from "./error";
import { ObjectStore } from "./object-store.js";
import { Arrayable } from "./util-types.js";

export type TransactionStatus = "running" | "aborted" | "complete" | "error";
export type TransactionEventHandler = (
    tx: Transaction<IDBTransactionMode>,
    ev: Event
) => void;
export interface TransactionOptions
    extends Partial<{
        onAbort: TransactionEventHandler;
        onError: TransactionEventHandler;
        onComplete: TransactionEventHandler;
    }> {}

// TODO: Just throw error and have transaction abort be automatic

export class Transaction<
    Mode extends IDBTransactionMode,
    Stores extends string = string
> {
    private internal: IDBTransaction;
    public status: TransactionStatus;
    public error: StoreError | null = null;
    public readonly storeNames: Stores[];

    /**
     * A record of store names to `IDBObjectStore` objects
     */
    private readonly objectStores: Record<Stores, ObjectStore>;

    constructor(
        db: IDBDatabase,
        stores: Arrayable<Stores>,
        mode: Mode,
        options: TransactionOptions = {}
    ) {
        this.internal = db.transaction(stores, mode);
        this.status = "running";
        this.storeNames = Array.from(
            this.internal.objectStoreNames
        ) as Stores[];
        this.objectStores = {} as Record<Stores, ObjectStore>;
        for (const store of this.storeNames) {
            this.objectStores[store] = this.getObjectstore(store);
        }
        this.internal.onabort = this.registerHandler(
            "aborted",
            options.onAbort
        );
        this.internal.onerror = this.registerHandler("error", options.onError);
        this.internal.oncomplete = this.registerHandler(
            "complete",
            options.onComplete
        );
    }

    abort(error: StoreError) {
        this.internal.abort();
        this.error = error;
        return this.error;
    }

    commit() {
        this.internal.commit();
    }

    /**
     * Gets the internal `IDBTransaction` object
     *
     * It's recommended you don't use this function and use the built-in functions of the wrapper
     * @returns Internal transaction object
     */
    getInternal() {
        return this.internal;
    }

    getStore(store: Stores): ObjectStore {
        const s = this.objectStores[store];
        if (!s)
            throw this.abort(
                new InvalidTransactionError(
                    `Store '${store}' is not a part of this transaction`
                )
            );
        return s;
    }

    get mode() {
        return this.internal.mode as Mode;
    }

    is(status: TransactionStatus) {
        return this.status === status;
    }

    contains(stores: Arrayable<string>) {
        if (!Array.isArray(stores)) {
            stores = [stores];
        }
        for (const store of stores) {
            if (!this.internal.objectStoreNames.contains(store)) {
                return false;
            }
        }
        return true;
    }

    assertIsArray(
        value: any,
        message: string = "Value is not an array"
    ): asserts value is any[] {
        if (!Array.isArray(value)) {
            throw this.abort(new AssertionError(message));
        }
    }

    private getObjectstore(store: string) {
        try {
            return new ObjectStore(this, this.internal.objectStore(store));
        } catch {
            throw this.abort(
                new ObjectStoreNotFoundError(
                    `No ObjectStore with the name '${store}' found`
                )
            );
        }
    }

    private registerHandler(
        status: TransactionStatus,
        fn: TransactionEventHandler = () => {}
    ) {
        return (e: Event) => {
            this.status = status;
            fn(this, e);
        };
    }

    async wrap<Output>(fn: (tx: this) => Promise<Output>): Promise<Output> {
        try {
            return await fn(this);
        } catch (error) {
            if (error instanceof StoreError && this.status === "aborted") {
                throw error;
            } else {
                throw this.abort(new UnknownError());
            }
        }
    }
}

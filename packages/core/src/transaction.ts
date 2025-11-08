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
    private stackCount = 0;
    public readonly onRejection = (error: any) => {
        if (error instanceof StoreError) {
            throw this.abort(error);
        } else {
            throw this.abort(new UnknownError(String(error)));
        }
    };

    /**
     * A record of store names to `IDBObjectStore` objects
     */
    private readonly objectStores: Map<Stores, ObjectStore>;

    constructor(transaction: Transaction<Mode, Stores>);

    constructor(
        first: IDBDatabase,
        stores: Arrayable<Stores>,
        mode: Mode,
        options?: TransactionOptions
    );

    constructor(
        first: IDBDatabase | Transaction<Mode, Stores>,
        stores?: Arrayable<Stores>,
        mode?: Mode,
        options: TransactionOptions = {}
    ) {
        if (first instanceof Transaction) {
            this.internal = first.getInternal();
            this.storeNames = first.storeNames;
            this.status = first.status;
            this.error = first.error;
            this.objectStores = first.getAllStores();
        } else {
            this.internal = first.transaction(stores!, mode);
            this.status = "running";
            this.storeNames = Array.from(
                this.internal.objectStoreNames
            ) as Stores[];
            this.objectStores = new Map(
                this.storeNames.map((s) => [s, this.getObjectstore(s)])
            );
            this.internal.onabort = this.registerHandler(
                "aborted",
                options.onAbort
            );
            this.internal.onerror = this.registerHandler(
                "error",
                options.onError
            );
            this.internal.oncomplete = this.registerHandler(
                "complete",
                options.onComplete
            );
        }
    }

    /**
     * Creates a new transaction, or, if an existing one is passed in, just returns the existing one
     * @param db IndexedDB object
     * @param stores List of store names
     * @param mode Transaction mode
     * @param existingTx Existing transaction
     */
    static create<Mode extends IDBTransactionMode, Stores extends string>(
        db: IDBDatabase,
        stores: Stores[],
        mode: Mode,
        existingTx?: Transaction<Mode, Stores>
    ): Transaction<Mode, Stores> {
        if (existingTx) {
            return existingTx;
        } else {
            return new Transaction(db, stores, mode);
        }
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
        const s = this.objectStores.get(store);
        if (!s)
            throw this.abort(
                new InvalidTransactionError(
                    `Store '${store}' is not a part of this transaction`
                )
            );
        return s;
    }

    getAllStores() {
        return this.objectStores;
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
        // Use stackCount to avoid layering many try-catch blocks
        if (this.stackCount === 0) {
            this.stackCount++;
            try {
                const result = await fn(this);
                this.stackCount--;
                return result;
            } catch (error) {
                if (error instanceof StoreError && this.status === "aborted") {
                    throw error;
                } else {
                    throw this.abort(new UnknownError());
                }
            }
        } else {
            return await fn(this);
        }
    }
}

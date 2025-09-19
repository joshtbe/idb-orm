import type { Arrayable } from "type-fest";
import { ErrorType, StoreError } from "./error.js";

type TransactionStatus = "running" | "aborted" | "complete" | "error";
type TransactionEventHandler = (
    tx: Transaction<IDBTransactionMode>,
    ev: Event
) => void;
type TransactionOptions = Partial<{
    onAbort: TransactionEventHandler;
    onError: TransactionEventHandler;
    onComplete: TransactionEventHandler;
}>;

export class Transaction<
    Mode extends IDBTransactionMode,
    Stores extends string = string
> {
    private tx: IDBTransaction;
    public status: TransactionStatus;
    public error: StoreError | null = null;

    constructor(
        db: IDBDatabase,
        stores: Arrayable<Stores>,
        mode: Mode,
        options: TransactionOptions = {}
    ) {
        if (!db) throw "Database not found";
        this.tx = db.transaction(stores, mode);
        this.status = "running";
        this.tx.onabort = this.registerHandler("aborted", options.onAbort);
        this.tx.onerror = this.registerHandler("error", options.onError);
        this.tx.oncomplete = this.registerHandler(
            "complete",
            options.onComplete
        );
    }

    abort(code: ErrorType, message: string) {
        this.error = new StoreError(code, message);
        this.tx.abort();
        return this.error;
    }

    getInternal() {
        return this.tx;
    }

    get mode() {
        return this.tx.mode;
    }

    get storeNames() {
        return Array.from(this.tx.objectStoreNames) as Stores[];
    }

    is(status: TransactionStatus) {
        return this.status === status;
    }

    contains(store: string) {
        return this.tx.objectStoreNames.contains(store);
    }

    objectstore(store: string) {
        try {
            return this.tx.objectStore(store);
        } catch (error) {
            throw this.abort(
                ErrorType.NOT_FOUND,
                `No ObjectStore with the name '${store}' found`
            );
        }
    }

    private registerHandler(
        status: TransactionStatus,
        fn?: TransactionEventHandler
    ) {
        return (e: Event) => {
            this.status = status;
            fn && fn(this, e);
        };
    }

    async wrap<Output>(
        fn: (tx: Transaction<Mode, Stores>) => Promise<Output>,
        onError: (
            error: StoreError,
            tx: Transaction<Mode, Stores>
        ) => Promise<Output> | Output
    ): Promise<Output> {
        try {
            return await fn(this);
        } catch (error) {
            if (error instanceof StoreError) {
                return await onError(error, this);
            } else {
                throw this.abort(
                    ErrorType.UNKNOWN,
                    `An unknown issue occurred: ${error}`
                );
            }
        }
    }
}

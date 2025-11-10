/**
 * A paper thin wrapper around IDBObjectStore
 */
import {
    AddError,
    DeleteError,
    DocumentNotFoundError,
    OpenCursorError,
    RetrievalError,
    StoreError,
    UpdateError,
} from "./error.js";
import { Transaction } from "./transaction.js";
import { Dict, Promisable, ValidKey } from "./util-types.js";

export class ObjectStore<T = Dict> {
    constructor(
        private readonly tx: Transaction<IDBTransactionMode, string>,
        public readonly store: IDBObjectStore
    ) {}

    async add(item: T) {
        return (await this.handleRequest(
            this.store.add(item),
            () => new AddError()
        )) as ValidKey;
    }

    /**
     * Attempts to retrieve the value from the object store.
     *
     * Returns `undefined` if no value was found
     */
    async get(key: ValidKey): Promise<T | undefined> {
        return (await this.handleRequest(
            this.store.get(key),
            () => new RetrievalError()
        )) as T | undefined;
    }

    /**
     * Like .get(), but throws an error if the item could not be found
     */
    async assertGet(key: ValidKey): Promise<T> {
        const item = (await this.handleRequest(
            this.store.get(key),
            () => new RetrievalError()
        )) as T | undefined;
        if (!item) throw this.tx.abort(new DocumentNotFoundError());
        return item;
    }

    async put(item: T) {
        return (await this.handleRequest(
            this.store.put(item),
            () => new UpdateError()
        )) as ValidKey;
    }

    async delete(key: ValidKey): Promise<undefined> {
        return await this.handleRequest(
            this.store.delete(key),
            () => new DeleteError()
        );
    }

    async openCursor(
        callback: (
            cursor: IDBCursorWithValue,
            tx: Transaction<IDBTransactionMode, string>
        ) => Promisable<boolean>,
        options: {
            query?: IDBValidKey | IDBKeyRange;
            direction?: IDBCursorDirection;
            onError?: () => StoreError;
        } = {}
    ) {
        const onError = options.onError || (() => new OpenCursorError());
        const request = this.store.openCursor(options.query, options.direction);
        await new Promise<void>((res) => {
            request.onsuccess = async (event) => {
                if (!event.target) {
                    throw this.tx.abort(onError());
                }
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
                    .result;
                if (!cursor || !(await callback(cursor, this.tx))) {
                    res();
                }
            };
            request.onerror = () => {
                throw this.tx.abort(onError());
            };
        });
    }

    private async handleRequest<T>(
        req: IDBRequest<T>,
        onError: () => StoreError
    ) {
        return await new Promise<T>((res) => {
            req.onsuccess = () => {
                res(req.result);
            };
            req.onerror = () => {
                throw this.tx.abort(onError());
            };
        });
    }
}

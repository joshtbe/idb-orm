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
    UnknownError,
    UpdateError,
} from "./error.js";
import { Transaction } from "./transaction.js";
import { Dict, Promisable, ValidKey } from "./util-types.js";

export class ObjectStore<T = Dict> {
    constructor(
        private readonly tx: Transaction<IDBTransactionMode, string>,
        public readonly store: IDBObjectStore
    ) {}

    add(item: T) {
        return this.handleRequest(
            this.store.add(item),
            () => new AddError()
        ) as Promise<ValidKey>;
    }

    /**
     * Attempts to retrieve the value from the object store.
     *
     * Returns `undefined` if no value was found
     */
    get(key: ValidKey): Promise<T | undefined> {
        return this.handleRequest(
            this.store.get(key),
            () => new RetrievalError()
        );
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

    put(item: T) {
        return this.handleRequest(
            this.store.put(item),
            () => new UpdateError()
        ) as Promise<ValidKey>;
    }

    delete(key: ValidKey): Promise<undefined> {
        return this.handleRequest(
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
        await new Promise<void>((res, reject) => {
            request.onsuccess = async (event) => {
                try {
                    if (!event.target) {
                        reject(this.tx.abort(onError()));
                    }
                    const cursor = (
                        event.target as IDBRequest<IDBCursorWithValue>
                    ).result;
                    if (!cursor || !(await callback(cursor, this.tx))) {
                        res();
                    }
                } catch (error) {
                    reject(
                        this.tx.abort(
                            error instanceof StoreError
                                ? error
                                : new UnknownError(String(error))
                        )
                    );
                }
            };
            request.onerror = () => {
                reject(this.tx.abort(onError()));
            };
        });
    }

    private handleRequest<T>(req: IDBRequest<T>, onError: () => StoreError) {
        return new Promise<T>((res) => {
            req.onsuccess = () => {
                res(req.result);
            };
            req.onerror = () => {
                throw this.tx.abort(onError());
            };
        });
    }
}

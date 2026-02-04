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
import { ValidKey } from "./field";
import { Transaction } from "./transaction.js";
import { Dict, IDBCursorWithType, Promisable } from "./util-types";

/**
 * A paper thin wrapper around IDBObjectStore
 */
export class ObjectStore<T = Dict> {
    constructor(
        private readonly tx: Transaction<IDBTransactionMode, string>,
        public readonly internal: IDBObjectStore,
    ) {}

    add(item: T) {
        return this.handleRequest(
            this.internal.add(item),
            () => new AddError(),
        ) as Promise<ValidKey>;
    }

    /**
     * Attempts to retrieve the value from the object store.
     *
     * Returns `undefined` if no value was found
     */
    get(key: ValidKey): Promise<T | undefined> {
        return this.handleRequest(
            this.internal.get(key),
            () => new RetrievalError(),
        );
    }

    /**
     * Like .get(), but throws an error if the item could not be found
     */
    async assertGet(key: ValidKey): Promise<T> {
        const item = (await this.handleRequest(
            this.internal.get(key),
            () => new RetrievalError(),
        )) as T | undefined;
        if (!item) throw this.tx.abort(new DocumentNotFoundError());
        return item;
    }

    put(item: T) {
        return this.handleRequest(
            this.internal.put(item),
            () => new UpdateError(),
        ) as Promise<ValidKey>;
    }

    delete(key: ValidKey): Promise<undefined> {
        return this.handleRequest(
            this.internal.delete(key),
            () => new DeleteError(),
        );
    }

    async openCursor(
        callback: (
            cursor: IDBCursorWithType<T>,
            tx: Transaction<IDBTransactionMode, string>,
        ) => Promisable<boolean>,
        options: {
            query?: IDBValidKey | IDBKeyRange;
            direction?: IDBCursorDirection;
            onError?: () => StoreError;
        } = {},
    ) {
        const onError = options.onError || (() => new OpenCursorError());
        const request = this.internal.openCursor(
            options.query,
            options.direction,
        );
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
                                : new UnknownError(JSON.stringify(error)),
                        ),
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

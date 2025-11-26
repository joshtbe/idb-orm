export type ErrorType =
    | "ID_EXISTS"
    | "INVALID_ITEM"
    | "ADD_FAILED"
    | "UPDATE_FAILED"
    | "DELETE_FAILED"
    | "OVERWRITE_RELATION"
    | "NOT_FOUND"
    | "GET_FAILED"
    | "EXPORT"
    /**
     * The given transaction is invalid for the store it is trying to access
     */
    | "INVALID_TX"
    /**
     * The database is not found
     */
    | "NO_DB"
    | "CUSTOM"
    | "INVALID_CONFIG"
    | "ASSERTION_FAILED"
    | "OPEN_CURSOR"
    | "UNKNOWN";

export class StoreError extends Error {
    public readonly code: ErrorType;
    constructor(code: ErrorType, message: string) {
        super(`(${code}) ${message}`);
        this.code = code;
    }
}

function storeErrorFactory<T extends ErrorType>(
    code: T,
    defaultMessage: string
) {
    return class extends StoreError {
        public static readonly code: T;
        constructor(message: string = defaultMessage) {
            super(code, message);
        }

        static of(message: string) {
            new this(message);
        }
    };
}

export const InvalidConfigError = storeErrorFactory(
    "INVALID_CONFIG",
    "Configuration is invalid"
);

export const InvalidTransactionError = storeErrorFactory(
    "INVALID_TX",
    "Transaction is invalid"
);

export const InvalidItemError = storeErrorFactory(
    "INVALID_ITEM",
    "Item is invalid"
);

export const AssertionError = storeErrorFactory(
    "ASSERTION_FAILED",
    "Assertion failed"
);

export const UnknownError = storeErrorFactory(
    "UNKNOWN",
    "An unknown error occurred"
);

export const DeleteError = storeErrorFactory(
    "DELETE_FAILED",
    "Item could not be deleted"
);

export const ObjectStoreNotFoundError = storeErrorFactory(
    "NOT_FOUND",
    "Object Store Not Found"
);

export const DocumentNotFoundError = storeErrorFactory(
    "NOT_FOUND",
    "Document Not Found"
);

export const UpdateError = storeErrorFactory(
    "UPDATE_FAILED",
    "Item could not be updated"
);

export const AddError = storeErrorFactory(
    "ADD_FAILED",
    "Item could not be added"
);

export const OpenCursorError = storeErrorFactory(
    "OPEN_CURSOR",
    "Cursor could not be opened"
);

export const RetrievalError = storeErrorFactory(
    "GET_FAILED",
    "Item could not be retrieved"
);

export const OverwriteRelationError = storeErrorFactory(
    "OVERWRITE_RELATION",
    "Relation cannot be overwritten"
);

export const ExportError = storeErrorFactory("EXPORT", "Export failed");

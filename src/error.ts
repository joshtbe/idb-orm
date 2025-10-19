export type ErrorType =
    | "ID_EXISTS"
    | "INVALID_ITEM"
    | "ADD_FAILED"
    | "UPDATE_FAILED"
    | "DELETE_FAILED"
    | "OVERWRITE_RELATION"
    | "NOT_FOUND"
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
    | "UNKNOWN";

export class StoreError extends Error {
    public readonly code: ErrorType;
    public readonly message: string;
    constructor(code: ErrorType, message: string) {
        super();
        this.code = code;
        this.message = message;
    }
}

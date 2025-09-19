export enum ErrorType {
    ID_EXISTS,
    INVALID_ITEM,
    ADD_FAILED,
    UPDATE_FAILED,
    DELETE_FAILED,
    NOT_FOUND,

    /**
     * The given transaction is invalid for the store it is trying to access
     */
    INVALID_TX,

    /**
     * The database is not found
     */
    NO_DB,

    CUSTOM,

    UNKNOWN,
}

export class StoreError {
    public readonly code: ErrorType;
    public readonly message: string;
    constructor(code: ErrorType, message: string) {
        this.code = code;
        this.message = message;
    }
}

import { ParseFn, ParseResult } from "./property.js";
import { Type } from "./type-wrapper.js";

function makeValidator<T>(
    type:
        | "string"
        | "number"
        | "bigint"
        | "boolean"
        | "symbol"
        | "undefined"
        | "object"
        | "function"
): ParseFn<T> {
    return (test: unknown): ParseResult<T> => {
        if (typeof test === type) {
            return {
                success: true,
                data: test as T,
            };
        } else
            return {
                success: false,
                error: "Value is not a string",
            };
    };
}

/**
 *
 */
export const VALIDATORS = {
    [Type.String.tag]: makeValidator<string>("string"),
    [Type.Number.tag]: makeValidator<number>("number"),
    [Type.BigInt.tag]: makeValidator<bigint>("bigint"),
    [Type.Boolean.tag]: makeValidator<boolean>("boolean"),
    [Type.Symbol.tag]: makeValidator<symbol>("symbol"),
    [Type.File.tag]: (test: unknown): ParseResult<File> => {
        if (test instanceof File) {
            return {
                success: true,
                data: test,
            };
        } else {
            return {
                success: false,
                error: "Value is not a file object",
            };
        }
    },
    [Type.Unknown.tag]: ((test: unknown): ParseResult<any> => ({
        success: true,
        data: test,
    })) as ParseFn<any>,
    [Type.Date.tag]: ((test: unknown): ParseResult<Date> => {
        if (test instanceof Date) {
            if (!isNaN(test.getTime())) {
                return {
                    success: true,
                    data: test,
                };
            } else {
                return {
                    success: false,
                    error: "Value is not a valid date",
                };
            }
        }
        return {
            success: false,
            error: "Value is not a date",
        };
    }) as ParseFn<Date>,
};

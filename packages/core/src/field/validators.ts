import { Type } from "../util-types.js";
import { ParseFn, ParseResult } from "./property.js";

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
    [Type.String]: makeValidator<string>("string"),
    [Type.Number]: makeValidator<number>("number"),
    [Type.BigInt]: makeValidator<bigint>("bigint"),
    [Type.Boolean]: makeValidator<boolean>("boolean"),
    [Type.Symbol]: makeValidator<symbol>("symbol"),
    [Type.Any]: ((test: unknown): ParseResult<any> => ({
        success: true,
        data: test,
    })) as ParseFn<any>,
    [Type.Date]: ((test: unknown): ParseResult<Date> => {
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

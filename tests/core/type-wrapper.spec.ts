import { test, expect, Page } from "@playwright/test";
import {
    ContextSession,
    EvalFn,
    expectEach,
    populatePage,
} from "../helpers.js";
import { Packages } from "./create-db.js";

test.describe("Type-wrapper Tests", () => {
    let page: Page;
    let session: ContextSession<Packages>;
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        page = await context.newPage();
        session = await populatePage<Packages>(page, {
            pkg: "import('./core/dist/index.js')",
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("is()", async () => {
        const result = await session.evaluate(async ({ pkg }) => {
            const Type = pkg.core.Type;
            if (!Type.is(Type.Number, 400)) return "Value is a number";
            if (Type.is(Type.Number, "")) return "Value is not a number";

            if (!Type.is(Type.String, "")) return "Value is a string";
            if (Type.is(Type.String, 400)) return "Value is not a string";

            if (!Type.is(Type.Boolean, true)) return "Value is a boolean";
            if (Type.is(Type.Boolean, 400)) return "Value is not a boolean";

            if (!Type.is(Type.Symbol, Symbol.for("h")))
                return "Value is a symbol";
            if (Type.is(Type.Symbol, 400)) return "Value is not a symbol";

            if (!Type.is(Type.BigInt, 1n)) return "Value is a bigint";
            if (Type.is(Type.BigInt, 400)) return "Value is not a bigint";

            if (!Type.is(Type.Date, new Date())) return "Value is a date";
            if (Type.is(Type.Date, 300)) return "Value is not a bigint";

            if (!Type.is(Type.Unknown, new Date())) return "Value is unknown";
            if (!Type.is(Type.Unknown, 300)) return "Value is unknown";

            if (!Type.is(Type.Array(Type.Number), [3, 1, 3, 45]))
                return "Value is a number array";
            if (
                !Type.is(Type.Array(Type.Array(Type.Number)), [
                    [3],
                    [12, 45],
                    [133],
                ])
            )
                return "Value is a 2D number array";
            if (Type.is(Type.Array(Type.String), ["hello", 2, 3, 4, 5]))
                return "Value is not a string array";
            if (Type.is(Type.Array(Type.Unknown), 300))
                return "Value is not an array";

            if (!Type.is(Type.Set(Type.Number), new Set([3, 1, 3, 45])))
                return "Value is a number set";
            if (Type.is(Type.Set(Type.String), new Set([1, 2, 3, 4, 5])))
                return "Value is not a string set";
            if (Type.is(Type.Set(Type.Unknown), 300))
                return "Value is not a set";

            if (!Type.is(Type.Optional(Type.String), ""))
                return "Value is a string";
            if (!Type.is(Type.Optional(Type.String), undefined))
                return "Value is undefined";

            if (Type.is(Type.Optional(Type.String), 400))
                return "Value is not string | undefined";

            const union = Type.Union([
                Type.String,
                Type.Number,
                Type.Array(Type.Number),
            ]);

            if (!Type.is(union, "hello")) return "Value is a string";
            if (!Type.is(union, 400)) return "Value is a number";
            if (!Type.is(union, [400, 12, 33]))
                return "Value is a number array";
            if (Type.is(union, true)) return "Value is not a valid union";
            if (Type.is(union, [400, "hello world", 1023]))
                return "Value is not a valid union";
            if (Type.is(union, new Date())) return "Value is not a valid union";

            const file = new File(["hello"], "test.txt");
            if (!Type.is(Type.File, file)) return "Value is a file";
            if (Type.is(Type.File, "hello")) return "Value is not a file";

            const custom = Type.Custom<{ hello: string; why: number }>({
                isType: (test) => {
                    return !!(
                        test &&
                        typeof test === "object" &&
                        "hello" in test &&
                        "why" in test &&
                        typeof test.hello === "string" &&
                        typeof test.why === "number"
                    );
                },
            });
            if (!Type.is(custom, { hello: "why not", why: 122 }))
                return "Value is the defined custom type";
            if (!Type.is(custom, { hello: "Hello World!", why: -1234234 }))
                return "Value is the defined custom type";
            if (Type.is(custom, 32424))
                return "Value is not the defined custom type";
            if (Type.is(custom, { hello: 400, why: "Hello World!" }))
                return "Value is not the defined custom type";

            return true;
        });
        expect(result).toBe(true);
    });
});

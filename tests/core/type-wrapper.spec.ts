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
            pkg: "import('./core/dist/index.es.js')",
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("is()", async () => {
        const result = await session.evaluate(async ({ pkg }) => {
            const Type = pkg.core.Type;
            if (!Type.is(Type.Number(), 400)) return "Value is a number";
            if (Type.is(Type.Number(), "")) return "Value is not a number";

            if (!Type.is(Type.String(), "")) return "Value is a string";
            if (Type.is(Type.String(), 400)) return "Value is not a string";

            if (!Type.is(Type.Boolean(), true)) return "Value is a boolean";
            if (Type.is(Type.Boolean(), 400)) return "Value is not a boolean";

            if (!Type.is(Type.Symbol(), Symbol.for("h")))
                return "Value is a symbol";
            if (Type.is(Type.Symbol(), 400)) return "Value is not a symbol";

            if (!Type.is(Type.BigInt(), 1n)) return "Value is a bigint";
            if (Type.is(Type.BigInt(), 400)) return "Value is not a bigint";

            if (!Type.is(Type.Date(), new Date())) return "Value is a date";
            if (Type.is(Type.Date(), 300)) return "Value is not a bigint";

            if (!Type.is(Type.Unknown(), new Date())) return "Value is unknown";
            if (!Type.is(Type.Unknown(), 300)) return "Value is unknown";

            if (!Type.is(Type.Array(Type.Number()), [3, 1, 3, 45]))
                return "Value is a number array";
            if (
                !Type.is(Type.Array(Type.Array(Type.Number())), [
                    [3],
                    [12, 45],
                    [133],
                ])
            )
                return "Value is a 2D number array";
            if (Type.is(Type.Array(Type.String()), ["hello", 2, 3, 4, 5]))
                return "Value is not a string array";
            if (Type.is(Type.Array(Type.Unknown()), 300))
                return "Value is not an array";

            if (!Type.is(Type.Set(Type.Number()), new Set([3, 1, 3, 45])))
                return "Value is a number set";
            if (Type.is(Type.Set(Type.String()), new Set([1, 2, 3, 4, 5])))
                return "Value is not a string set";
            if (Type.is(Type.Set(Type.Unknown()), 300))
                return "Value is not a set";

            if (!Type.is(Type.Optional(Type.String()), ""))
                return "Value is a string";
            if (!Type.is(Type.Optional(Type.String()), undefined))
                return "Value is undefined";

            if (Type.is(Type.Optional(Type.String()), 400))
                return "Value is not string | undefined";

            const union = Type.Union([
                Type.String(),
                Type.Number(),
                Type.Array(Type.Number()),
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
            if (!Type.is(Type.File(), file)) return "Value is a file";
            if (Type.is(Type.File(), "hello")) return "Value is not a file";

            const object = Type.Object({
                hello: Type.String(),
                morning: Type.Number(),
                nested: Type.Object({
                    nestedOne: Type.Optional(Type.Boolean()),
                    nestedTwo: Type.String(),
                }),
                arr: Type.Array(Type.Number()),
            });
            if (
                !Type.is(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!" },
                    arr: [],
                })
            ) {
                return "Value is the specified object";
            }
            if (
                !Type.is(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!", nestedOne: true },
                    arr: [],
                })
            ) {
                return "Value is the specified object";
            }
            if (
                Type.is(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!" },
                })
            ) {
                return "Value is not the specified object";
            }
            if (Type.is(object, {})) {
                return "Value is not the specified object";
            }
            if (Type.is(object, 4)) {
                return "Value is not the specified object";
            }

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

    test("isSubtype()", async () => {
        const result = await session.evaluate(async ({ pkg }) => {
            const Type = pkg.core.Type;

            function err(base: string, test: string, not: boolean = false) {
                return `${test} should${
                    not ? " not" : ""
                } be a subtype of ${base}`;
            }

            // Literal tests
            if (!Type.isSubtype(Type.Literal(400), Type.Literal(400)))
                return err("literal 400", "literal 400");
            if (Type.isSubtype(Type.Literal(400), Type.Literal(20)))
                return err("literal 400", "literal 20", true);
            if (Type.isSubtype(Type.Literal(400), Type.Literal("test")))
                return err("literal 400", "literal test", true);

            // Number tests
            if (!Type.isSubtype(Type.Number(), Type.Number()))
                return err("number", "number");
            if (!Type.isSubtype(Type.Number(), Type.Literal(40)))
                return err("number", "literal number");
            if (Type.isSubtype(Type.Number(), Type.String()))
                return err("number", "string", true);
            if (Type.isSubtype(Type.Number(), Type.Literal("test")))
                return err("number", "literal string", true);
            if (Type.isSubtype(Type.Number(), Type.BigInt()))
                return err("number", "bigint", true);

            // String tests
            if (!Type.isSubtype(Type.String(), Type.String()))
                return err("string", "string");
            if (!Type.isSubtype(Type.String(), Type.Literal("test")))
                return err("string", "literal string");
            if (Type.isSubtype(Type.String(), Type.Number()))
                return err("string", "number", true);
            if (Type.isSubtype(Type.String(), Type.Literal(33)))
                return err("string", "literal number", true);
            if (Type.isSubtype(Type.String(), Type.BigInt()))
                return err("string", "bigint", true);

            // Unknown
            if (!Type.isSubtype(Type.Unknown(), Type.Date()))
                return err("unknown", "date");
            if (!Type.isSubtype(Type.Unknown(), Type.String()))
                return err("unknown", "string");
            if (!Type.isSubtype(Type.Unknown(), Type.Array(Type.Number())))
                return err("unknown", "number[]");

            // Array
            if (
                !Type.isSubtype(
                    Type.Array(Type.Number()),
                    Type.Array(Type.Number())
                )
            ) {
                return err("number[]", "number[]");
            }
            if (
                !Type.isSubtype(
                    Type.Array(Type.Number()),
                    Type.Array(Type.Literal(200))
                )
            ) {
                return err("number[]", "number[]");
            }
            if (Type.isSubtype(Type.Array(Type.Number()), Type.String())) {
                return err("number[]", "string");
            }
            if (
                Type.isSubtype(
                    Type.Array(Type.Number()),
                    Type.Array(Type.String())
                )
            ) {
                return err("number[]", "string[]");
            }

            // Union
            const u1 = Type.Union([
                Type.Number(),
                Type.String(),
                Type.Array(Type.Number()),
            ]);
            const u2 = Type.Union([Type.String(), Type.Number()]);
            const u3 = Type.Union([...u2.options, Type.Set(Type.Number())]);
            const u4 = Type.Union([u2, Type.String()]);
            if (!Type.isSubtype(u1, Type.String())) {
                return err(Type.toString(u1), "string");
            }
            if (!Type.isSubtype(u1, u2)) {
                return err(Type.toString(u1), Type.toString(u2));
            }
            if (Type.isSubtype(u1, u3)) {
                return err(Type.toString(u1), Type.toString(u3), true);
            }
            if (!Type.isSubtype(u4, u2)) {
                return err(Type.toString(u4), Type.toString(u2));
            }

            // Object
            const o1 = Type.Object({
                hello: Type.Number(),
                test: Type.String(),
            });
            const o2 = Type.Object({ hello: Type.Number() });
            const o3 = Type.Object({ hello: Type.String() });
            const o4 = Type.Object({});
            if (!Type.isSubtype(o1, o2))
                return err(Type.toString(o1), Type.toString(o2));
            if (!Type.isSubtype(o1, o4))
                return err(Type.toString(o1), Type.toString(o4));
            if (!Type.isSubtype(o1, o2))
                return err(Type.toString(o1), Type.toString(o2));
            if (!Type.isSubtype(o3, o4))
                return err(Type.toString(o3), Type.toString(o4));
            if (Type.isSubtype(o1, o3))
                return err(Type.toString(o1), Type.toString(o3), true);
            if (Type.isSubtype(o3, o2))
                return err(Type.toString(o3), Type.toString(o2), true);
            if (Type.isSubtype(o4, o3))
                return err(Type.toString(o4), Type.toString(o3), true);
            return true;
        });
        expect(result).toBe(true);
    });
});

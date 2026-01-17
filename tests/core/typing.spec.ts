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

    test("isType()", async () => {
        const result = await session.evaluate(async ({ pkg }) => {
            const { isType, Type } = pkg.core;
            if (!isType(Type.number(), 400)) return "Value is a number";
            if (isType(Type.number(), "")) return "Value is not a number";

            if (!isType(Type.float(), 23.41)) return "Value is a float";
            if (!isType(Type.float(), 400)) return "Value is a float";
            if (isType(Type.float(), NaN)) return "Value is not a float";
            if (isType(Type.float(), NaN)) return "Value is not a float";

            if (!isType(Type.int(), 12345)) return "Value is an int";
            if (!isType(Type.int(), 400.0)) return "Value is an int";
            if (isType(Type.int(), NaN)) return "Value is not an int";
            if (isType(Type.int(), 34.567)) return "Value is not an int";

            if (!isType(Type.string(), "")) return "Value is a string";
            if (isType(Type.string(), 400)) return "Value is not a string";

            if (!isType(Type.boolean(), true)) return "Value is a boolean";
            if (isType(Type.boolean(), 400)) return "Value is not a boolean";

            if (!isType(Type.symbol(), Symbol.for("h")))
                return "Value is a symbol";
            if (isType(Type.symbol(), 400)) return "Value is not a symbol";

            if (!isType(Type.bigint(), 1n)) return "Value is a bigint";
            if (isType(Type.bigint(), 400)) return "Value is not a bigint";

            if (!isType(Type.date(), new Date())) return "Value is a date";
            if (isType(Type.date(), 300)) return "Value is not a date";

            if (!isType(Type.unknown(), new Date())) return "Value is unknown";
            if (!isType(Type.unknown(), 300)) return "Value is unknown";

            if (!isType(Type.array(Type.number()), [3, 1, 3, 45]))
                return "Value is a number array";
            if (
                !isType(Type.array(Type.array(Type.number())), [
                    [3],
                    [12, 45],
                    [133],
                ])
            )
                return "Value is a 2D number array";
            if (isType(Type.array(Type.string()), ["hello", 2, 3, 4, 5]))
                return "Value is not a string array";
            if (isType(Type.array(Type.unknown()), 300))
                return "Value is not an array";

            if (
                !isType(
                    Type.tuple([Type.string(), Type.number(), Type.string()]),
                    ["hello", 123, "yolo"],
                )
            )
                return "Ta: Value is a valid tuple";

            if (
                !isType(
                    Type.tuple([
                        Type.array(Type.number()),
                        Type.number(),
                        Type.boolean(),
                    ]),
                    [[1, 2, 3, 4, 5], 400, false],
                )
            )
                return "Tb: Value is a valid tuple";

            if (
                isType(
                    Type.tuple([
                        Type.array(Type.number()),
                        Type.number(),
                        Type.boolean(),
                    ]),
                    [1, 2, 3, 5, 6, 67, 7],
                )
            )
                return "Tc: Value is not a valid tuple";

            if (
                isType(
                    Type.tuple([
                        Type.set(Type.number()),
                        Type.set(Type.string()),
                    ]),
                    [
                        new Set([1, 2, 3, 4, 5]),
                        new Set(["a", "b", "c", "d"]),
                        3,
                        4,
                        5,
                        6,
                    ],
                )
            )
                return "Td: Value is not a valid tuple";

            if (!isType(Type.set(Type.number()), new Set([3, 1, 3, 45])))
                return "Value is a number set";
            if (isType(Type.set(Type.string()), new Set([1, 2, 3, 4, 5])))
                return "Value is not a string set";
            if (isType(Type.set(Type.unknown()), 300))
                return "Value is not a set";

            if (!isType(Type.optional(Type.string()), ""))
                return "Value is a string";
            if (!isType(Type.optional(Type.string()), undefined))
                return "Value is undefined";

            if (isType(Type.optional(Type.string()), 400))
                return "Value is not string | undefined";

            const union = Type.union([
                Type.string(),
                Type.number(),
                Type.array(Type.number()),
            ]);

            if (!isType(union, "hello")) return "Value is a string";
            if (!isType(union, 400)) return "Value is a number";
            if (!isType(union, [400, 12, 33])) return "Value is a number array";
            if (isType(union, true)) return "Value is not a valid union";
            if (isType(union, [400, "hello world", 1023]))
                return "Value is not a valid union";
            if (isType(union, new Date())) return "Value is not a valid union";

            const file = new File(["hello"], "test.txt");
            if (!isType(Type.file(), file)) return "Value is a file";
            if (isType(Type.file(), "hello")) return "Value is not a file";

            const object = Type.object({
                hello: Type.string(),
                morning: Type.number(),
                nested: Type.object({
                    nestedOne: Type.optional(Type.boolean()),
                    nestedTwo: Type.string(),
                }),
                arr: Type.array(Type.number()),
            });
            if (
                !isType(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!" },
                    arr: [],
                })
            ) {
                return "Value is the specified object";
            }
            if (
                !isType(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!", nestedOne: true },
                    arr: [],
                })
            ) {
                return "Value is the specified object";
            }
            if (
                isType(object, {
                    hello: "",
                    morning: 234,
                    nested: { nestedTwo: "Hello World!" },
                })
            ) {
                return "Value is not the specified object";
            }
            if (isType(object, {})) {
                return "Value is not the specified object";
            }
            if (isType(object, 4)) {
                return "Value is not the specified object";
            }

            const custom = Type.custom<{ hello: string; why: number }>({
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
            if (!isType(custom, { hello: "why not", why: 122 }))
                return "Value is the defined custom type";
            if (!isType(custom, { hello: "Hello World!", why: -1234234 }))
                return "Value is the defined custom type";
            if (isType(custom, 32424))
                return "Value is not the defined custom type";
            if (isType(custom, { hello: 400, why: "Hello World!" }))
                return "Value is not the defined custom type";

            return true;
        });
        expect(result).toBe(true);
    });

    test("isSubtype()", async () => {
        const result = await session.evaluate(async ({ pkg }) => {
            const { isSubtype, Type, typeToString } = pkg.core;

            function err(base: string, test: string, not: boolean = false) {
                return `${test} should${
                    not ? " not" : ""
                } be a subtype of ${base}`;
            }

            // Literal tests
            if (!isSubtype(Type.literal(400), Type.literal(400)))
                return err("literal 400", "literal 400");
            if (isSubtype(Type.literal(400), Type.literal(20)))
                return err("literal 400", "literal 20", true);
            if (isSubtype(Type.literal(400), Type.literal("test")))
                return err("literal 400", "literal test", true);

            // Number tests
            if (!isSubtype(Type.number(), Type.number()))
                return err("number", "number");
            if (!isSubtype(Type.number(), Type.literal(40)))
                return err("number", "literal number");
            if (isSubtype(Type.number(), Type.string()))
                return err("number", "string", true);
            if (isSubtype(Type.number(), Type.literal("test")))
                return err("number", "literal string", true);
            if (isSubtype(Type.number(), Type.bigint()))
                return err("number", "bigint", true);

            // Float tests
            if (!isSubtype(Type.float(), Type.float()))
                return err("float", "float");
            if (!isSubtype(Type.number(), Type.float()))
                return err("number", "float");
            if (isSubtype(Type.float(), Type.number()))
                return err("float", "number", true);
            if (isSubtype(Type.string(), Type.float()))
                return err("string", "float", true);

            // Integer tests
            if (!isSubtype(Type.int(), Type.int())) return err("int", "int");
            if (!isSubtype(Type.number(), Type.int()))
                return err("number", "int");
            if (isSubtype(Type.int(), Type.number()))
                return err("int", "number", true);
            if (isSubtype(Type.string(), Type.int()))
                return err("string", "int", true);

            // String tests
            if (!isSubtype(Type.string(), Type.string()))
                return err("string", "string");
            if (!isSubtype(Type.string(), Type.literal("test")))
                return err("string", "literal string");
            if (isSubtype(Type.string(), Type.number()))
                return err("string", "number", true);
            if (isSubtype(Type.string(), Type.literal(33)))
                return err("string", "literal number", true);
            if (isSubtype(Type.string(), Type.bigint()))
                return err("string", "bigint", true);

            // Unknown
            if (!isSubtype(Type.unknown(), Type.date()))
                return err("unknown", "date");
            if (!isSubtype(Type.unknown(), Type.string()))
                return err("unknown", "string");
            if (!isSubtype(Type.unknown(), Type.array(Type.number())))
                return err("unknown", "number[]");

            // Array
            if (
                !isSubtype(Type.array(Type.number()), Type.array(Type.number()))
            ) {
                return err("number[]", "number[]");
            }
            if (
                !isSubtype(
                    Type.array(Type.number()),
                    Type.array(Type.literal(200)),
                )
            ) {
                return err("number[]", "number[]");
            }
            if (isSubtype(Type.array(Type.number()), Type.string())) {
                return err("number[]", "string");
            }
            if (
                isSubtype(Type.array(Type.number()), Type.array(Type.string()))
            ) {
                return err("number[]", "string[]");
            }

            // Union
            const u1 = Type.union([
                Type.number(),
                Type.string(),
                Type.array(Type.number()),
            ]);
            const u2 = Type.union([Type.string(), Type.number()]);
            const u3 = Type.union([...u2.options, Type.set(Type.number())]);
            const u4 = Type.union([u2, Type.string()]);
            if (!isSubtype(u1, Type.string())) {
                return err(typeToString(u1), "string");
            }
            if (!isSubtype(u1, u2)) {
                return err(typeToString(u1), typeToString(u2));
            }
            if (isSubtype(u1, u3)) {
                return err(typeToString(u1), typeToString(u3), true);
            }
            if (!isSubtype(u4, u2)) {
                return err(typeToString(u4), typeToString(u2));
            }

            // Object
            const o1 = Type.object({
                hello: Type.number(),
                test: Type.string(),
            });
            const o2 = Type.object({ hello: Type.number() });
            const o3 = Type.object({ hello: Type.string() });
            const o4 = Type.object({});
            if (!isSubtype(o1, o2))
                return err(typeToString(o1), typeToString(o2));
            if (!isSubtype(o1, o4))
                return err(typeToString(o1), typeToString(o4));
            if (!isSubtype(o1, o2))
                return err(typeToString(o1), typeToString(o2));
            if (!isSubtype(o3, o4))
                return err(typeToString(o3), typeToString(o4));
            if (isSubtype(o1, o3))
                return err(typeToString(o1), typeToString(o3), true);
            if (isSubtype(o3, o2))
                return err(typeToString(o3), typeToString(o2), true);
            if (isSubtype(o4, o3))
                return err(typeToString(o4), typeToString(o3), true);
            return true;
        });
        expect(result).toBe(true);
    });
});

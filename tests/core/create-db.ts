import type * as core from "@idb-orm/core";

export type Packages = {
    pkg: typeof core;
};

export type SessionArguments = Packages & {
    client: Awaited<ReturnType<typeof createDb>>;
};

import { test, expect, Page } from "@playwright/test";
import { ContextSession, expectEach, populatePage } from "../helpers.js";

export const createDb = async ({ pkg }: Packages) => {
    const Builder = pkg.Builder;
    const Field = pkg.Property;
    const P = pkg.Property;
    const builder = new Builder("testdb", [
        "classes",
        "spellLists",
        "spells",
        "subclass",
        "components",
    ]);

    const t = builder.defineModel("classes", {
        id: P.primaryKey().autoIncrement(),
        name: P.string(),
        email: P.string(),
    });

    const subclass = builder.defineModel("subclass", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        class: Field.relation("classes", { name: "class2subclass" }),
    });

    const classStore = builder.defineModel("classes", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        description: Field.string().array(),
        spellList: Field.relation("spellLists", {
            name: "spellList2class",
        }).optional({ onDelete: "SetNull" }),
        subclasses: Field.relation("subclass", {
            name: "class2subclass",
        }).array(),
    });

    const spellListStore = builder.defineModel("spellLists", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        class: Field.relation("classes", {
            name: "spellList2class",
            onDelete: "Cascade",
        }).optional(),
        spells: Field.relation("spells", {
            name: "spells2spellLists",
        }).array(),
    });

    // BUG: Infinite type errors when defining a model with the model constructor
    const spellStore = builder.defineModel("spells", {
        id: Field.primaryKey().uuid(),
        name: Field.string(),
        range: Field.string(),
        components: Field.union([
            Field.literal("V"),
            Field.literal("S"),
            Field.literal("M"),
        ]).array(),
        cs: Field.relation("components", {
            name: "components2spells",
            bidirectional: false,
        }).array(),
        level: Field.number().default(0),
        lists: Field.relation("spellLists", {
            name: "spells2spellLists",
        }).array(),
    });

    const componentStore = builder.defineModel("components", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
    });

    const db = builder.compile({
        classes: classStore,
        spellLists: spellListStore,
        spells: spellStore,
        subclass,
        components: componentStore,
    });
    type SpellStore = core.ModelType<typeof spellStore, typeof db>;

    const client = await db.createClientAsync();

    // @ts-ignore
    return client;
};

// Core Tests
export function coreTests(
    createFn: any,
    imports: Record<string, string> = {},
    download: boolean = false,
) {
    test.describe("Multi Stage Test", () => {
        test.describe.configure({ mode: "serial" });

        let page: Page;
        let session: ContextSession<SessionArguments>;
        test.beforeAll(async ({ browser }) => {
            const context = await browser.newContext();
            page = await context.newPage();
            session = await populatePage<SessionArguments>(page, {
                ...imports,
                pkg: "import('./core/dist/index.es.js')",
                client: createFn,
            });
        });

        test.afterAll(async ({ browser }) => {
            await browser.close();
        });

        test("Add", async () => {
            const result = await session.evaluate(async ({ client }) => {
                const stores = client.stores;
                await stores.spells.add({
                    name: "Acid Splash",
                    level: 0,
                    components: ["V"],
                    range: "15 feet",
                });
                await stores.spells.add({
                    name: "Chromatic Orb",
                    level: 1,
                    components: ["V"],
                    range: "120 feet",
                });
                const x = await stores.spells.find({ where: { level: 0 } });
                return x;
            });
            expect(result).toBeInstanceOf(Array);
            expect(result.length === 1).toBeTruthy();
        });

        test("Add with $create", async () => {
            const result = await session.evaluate(async ({ client }) => {
                const stores = client.stores;
                await stores.subclass.add({
                    name: "Path of the Berserker",
                    class: {
                        $create: {
                            name: "Barbarian",
                            description: ["Big ragey boi"],
                        },
                    },
                });
                return await stores.classes.findFirst({
                    where: { name: "Barbarian" },
                });
            });
            expect(result).toBeDefined();
        });
        test("Add with $connect", async () => {
            const result = await session.evaluate(async ({ client }) => {
                const stores = client.stores;
                const barbarian = await stores.classes.findFirst({
                    where: { name: "Barbarian" },
                });
                if (!barbarian) return false;
                await stores.subclass.add({
                    name: "Path of the Giant",
                    class: {
                        $connect: barbarian.id,
                    },
                });

                return await stores.classes.findFirst({
                    where: { name: "Barbarian" },
                    include: {
                        subclasses: true,
                    },
                });
            });
            if (!result) throw new Error("Find result is not defined");
            expect(result.subclasses).toBeInstanceOf(Array);
            expect(result.subclasses).toHaveLength(2);
            for (const item of result.subclasses) {
                if (typeof item !== "object") {
                    throw new Error(
                        "Item is not an object, it is a " + typeof item,
                    );
                }
            }
        });
        test("Add Many with $connect", async () => {
            const result = await session.evaluate(async ({ client }) => {
                const stores = client.stores;

                const barbarian = await stores.classes.findFirst({
                    where: { name: "Barbarian" },
                    select: {
                        id: true,
                    },
                });
                if (!barbarian) return false;
                await stores.subclass.addMany([
                    {
                        name: "Path of the Zealot",
                        class: {
                            $connect: barbarian.id,
                        },
                    },
                    {
                        name: "Path of Wild Magic",
                        class: {
                            $connect: barbarian.id,
                        },
                    },
                    {
                        name: "School of Evocation",
                        class: {
                            $create: {
                                name: "Wizard",
                                description: [
                                    "Nerdy boi",
                                    "Did I mention a nerd?",
                                ],
                                spellList: {
                                    $create: {
                                        name: "Wizard Spell list",
                                        spells: {
                                            $createMany: [
                                                {
                                                    name: "Blur",
                                                    components: ["V"],
                                                    range: "Self",
                                                    level: 2,
                                                },
                                                {
                                                    name: "Catnap",
                                                    level: 3,
                                                    range: "30 feet",
                                                    components: ["S", "M"],
                                                },
                                                {
                                                    name: "Blight",
                                                    level: 4,
                                                    range: "30 feet",
                                                    components: ["V", "S"],
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                        },
                    },
                ]);
                return await stores.classes.findFirst({
                    where: { id: barbarian.id },
                    include: {
                        subclasses: true,
                    },
                });
            });
            if (!result) throw new Error("Find result is not defined");
            expect(result.subclasses).toBeInstanceOf(Array);
            expect(result.subclasses).toHaveLength(4);
            for (const item of result.subclasses) {
                if (typeof item !== "object") {
                    throw new Error(
                        "Item is not an object, it is a " + typeof item,
                    );
                }
            }
        });

        // FIXME: Include relations in deep find includes/select that are not the selected relation. (key  'cs' should be present in the output)
        test("Deep Find Include", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.subclass.findFirst({
                    where: {
                        name: "School of Evocation",
                    },
                    include: {
                        class: {
                            include: {
                                spellList: {
                                    select: {
                                        spells: true,
                                    },
                                },
                            },
                        },
                    },
                });
            });
            expect(result).toBeDefined();
            expect(result?.class).toBeDefined();
            expect(result?.class?.spellList).toBeDefined();
            expect(result?.class?.subclasses).toHaveLength(1);
            expect(Object.keys(result?.class?.spellList || {}).length).toBe(1);
            expect(result?.class?.spellList?.spells).toHaveLength(3);
            expectEach(
                result?.class?.spellList?.spells,
                (item) =>
                    typeof item === "object" &&
                    Object.keys(item || {}).length === 6,
                "Value is not a valid spell object",
            );
        });

        test("Create w/ Bad Input", async () => {
            const result = await session.evaluate(async ({ client }) => {
                try {
                    await client.stores.subclass.add({
                        name: 200 as any,
                        class: {
                            $connect: 0,
                        },
                    });
                    return false;
                } catch (error) {
                    return error;
                }
            });
            if (result instanceof Error) {
                expect(result.message).toContain(
                    "(INVALID_ITEM) Key 'name' has the following validation error:",
                );
            } else {
                throw new Error("result is not an error");
            }
        });

        test("Create w/ Bad Connection", async () => {
            const result = await session.evaluate(async ({ client }) => {
                try {
                    await client.stores.subclass.add({
                        name: "Hexblade",
                        class: {
                            $connect: 0,
                        },
                    });
                    return false;
                } catch (error) {
                    return error;
                }
            });
            if (result instanceof Error) {
                expect(result.message).toBe(
                    "(NOT_FOUND) Document with Primary Key '0' could not be found in model 'classes'",
                );
            } else {
                throw new Error("result is not an error");
            }
        });

        test("Create w/ Nested Bad Input", async () => {
            const result = await session.evaluate(async ({ client }) => {
                try {
                    await client.stores.subclass.add({
                        name: "Hexblade",
                        class: {
                            $create: {
                                name: "Warlock",
                                description: 200 as any,
                            },
                        },
                    });
                    return false;
                } catch (error) {
                    // Make sure warlock was not added
                    const item = await client.stores.classes.findFirst({
                        where: {
                            name: "Warlock",
                        },
                    });
                    if (item) return false;
                    return error;
                }
            });
            if (result instanceof Error) {
                expect(result.message).toContain(
                    "(INVALID_ITEM) Key 'description' has the following validation error:",
                );
            } else {
                throw new Error("result is not an error");
            }
        });

        test("Create w/ Nested Bad Connect Input", async () => {
            const result = await session.evaluate(async ({ client }) => {
                try {
                    await client.stores.subclass.add({
                        name: "Hexblade",
                        class: {
                            $create: {
                                name: "Warlock",
                                description: [],
                                spellList: {
                                    $connect: 0,
                                },
                            },
                        },
                    });
                    return false;
                } catch (error) {
                    // Make sure warlock was not added
                    const item = await client.stores.classes.findFirst({
                        where: {
                            name: "Warlock",
                        },
                    });
                    if (item) return false;
                    return error;
                }
            });
            if (result instanceof Error) {
                expect(result.message).toContain(
                    "(NOT_FOUND) Document with Primary Key '0' could not be found in model 'spellLists'",
                );
            } else {
                throw new Error("result is not an error");
            }
        });
        test("Empty Find", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.subclass.find({});
            });
            expect(result).toHaveLength(5);
        });
        test("Empty Find First", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.subclass.findFirst({});
            });
            expect(result).toBeDefined();
        });

        test("Find with no results", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.subclass.find({
                    where: { name: "Hexblade" },
                });
            });
            expect(result).toHaveLength(0);
        });

        test("Find First with no results", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.subclass.findFirst({
                    where: { name: "Hexblade" },
                });
            });
            expect(result).toBeUndefined();
        });

        test("Find First with Nested Where", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.spellLists.findFirst({
                    where: { name: "Wizard Spell list" },
                    include: {
                        spells: {
                            where: {
                                name: "Widasdsdsh",
                            },
                        },
                    },
                });
            });
            expect(result).toBeDefined();
            expect(result?.class).toBeDefined();
            expect(result?.spells).toHaveLength(0);
        });

        test("Find First with Nested Where (Empty)", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.spellLists.findFirst({
                    where: { name: "Wizard Spell list" },
                    include: {
                        spells: {
                            where: {
                                level: 3,
                            },
                        },
                    },
                });
            });
            expect(result).toBeDefined();
            expect(result?.spells).toHaveLength(1);
        });

        test("Find First with where function", async () => {
            const result = await session.evaluate(async ({ client }) => {
                return await client.stores.spellLists.findFirst({
                    where: { name: (name) => name === "Wizard Spell list" },
                    include: {
                        spells: {
                            where: {
                                level: (level) => level > 2,
                                components: (c) => c.includes("V"),
                            },
                        },
                    },
                });
            });
            expect(result).toBeDefined();
            expect(result?.spells).toHaveLength(1);
        });

        if (download) {
            test("Dump Database to JSON", async ({}, info) => {
                const downloadPromise = page.waitForEvent("download");
                const result = await session.evaluate(async ({ client }) => {
                    const dump = await client.dump("json");
                    const file = dump.toFile();
                    const a = document.createElement("a");
                    a.download = file.name;
                    a.href = window.URL.createObjectURL(file);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(a.href);
                });

                const download = await downloadPromise;
                await download.saveAs(download.suggestedFilename());
            });

            test("Dump Store to JSON", async ({}, info) => {
                const downloadPromise = page.waitForEvent("download");
                const result = await session.evaluate(async ({ client }) => {
                    const dump = await client.stores.spells.dump("json", {
                        level: (l) => l > 1,
                    });
                    const file = dump.toFile();
                    const a = document.createElement("a");
                    a.download = file.name;
                    a.href = window.URL.createObjectURL(file);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(a.href);
                });

                const download = await downloadPromise;
                await download.saveAs(download.suggestedFilename());
            });

            test("Dump Database to CSV", async ({}, info) => {
                const downloadPromise = page.waitForEvent("download");
                const result = await session.evaluate(async ({ client }) => {
                    const dump = await client.dump("csv");
                    const file = dump.toFile();
                    const a = document.createElement("a");
                    a.download = file.name;
                    a.href = window.URL.createObjectURL(file);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(a.href);
                });

                const download = await downloadPromise;
                await download.saveAs(download.suggestedFilename());
            });

            test("Dump Store to CSV", async ({}, info) => {
                const downloadPromise = page.waitForEvent("download");
                const result = await session.evaluate(async ({ client }) => {
                    const dump = await client.stores.spells.dump("csv", {
                        level: (l) => l > 1,
                    });
                    const file = dump.toFile();
                    const a = document.createElement("a");
                    a.download = file.name;
                    a.href = window.URL.createObjectURL(file);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(a.href);
                });

                const download = await downloadPromise;
                await download.saveAs(download.suggestedFilename());
            });
        }
    });
}

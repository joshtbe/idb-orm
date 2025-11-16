import { test, expect, Page } from "@playwright/test";
import {
    ContextSession,
    EvalFn,
    expectEach,
    populatePage,
} from "../helpers.js";
import { createDb, SessionArguments } from "./create-db.js";

test.describe("Multi Stage Test", () => {
    test.describe.configure({ mode: "serial" });

    let page: Page;
    let session: ContextSession<SessionArguments>;
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        page = await context.newPage();
        session = await populatePage<SessionArguments>(page, {
            pkg: "import('./core/dist/index.js')",
            client: createDb as any,
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("Basic Update", async () => {
        const result = await session.evaluate(async ({ client }) => {
            const id = await client.stores.classes.add({
                name: "Wizard",
                description: ["A big magic nerd"],
            });

            return await client.stores.classes.updateFirst({
                where: {
                    id,
                },
                data: {
                    description: [
                        "A person who spent years mastering the magic of the weave",
                        "Also a huge nerd",
                    ],
                },
            });
        });
        expect(result).toBeDefined();
        expect(result?.description).toHaveLength(2);
        expect(result?.description).toEqual([
            "A person who spent years mastering the magic of the weave",
            "Also a huge nerd",
        ]);
    });

    test("Basic Update with function", async () => {
        const result = await session.evaluate(async ({ client }) => {
            const wizard = await client.stores.classes.findFirst({
                where: { name: "Wizard" },
            });
            if (!wizard) throw new Error("Wizard not found");

            return await client.stores.classes.updateFirst({
                where: {
                    id: wizard.id,
                },
                data: {
                    description: (d) => {
                        d.shift();
                        return d;
                    },
                },
            });
        });
        expect(result).toBeDefined();
        expect(result?.description).toHaveLength(1);
        expect(result?.description).toEqual(["Also a huge nerd"]);
    });

    test("Basic Update with no matching element", async () => {
        const result = await session.evaluate(async ({ client }) => {
            return await client.stores.classes.updateFirst({
                where: {
                    name: "Warlock",
                },
                data: {
                    description: (d) => {
                        d.shift();
                        return d;
                    },
                },
            });
        });
        expect(result).toBeUndefined();
    });

    test("Update Create element", async () => {
        const result = await session.evaluate(async ({ client }) => {
            return await client.stores.classes.updateFirst({
                where: {
                    name: "Wizard",
                },
                data: {
                    spellList: {
                        $create: {
                            name: "Wizard Spell List",
                        },
                    },
                    subclasses: {
                        $createMany: [
                            { name: "School of Illusion" },
                            { name: "School of Evocation" },
                        ],
                    },
                },
            });
        });
        expect(result?.spellList).toBeDefined();
        expect(result?.subclasses).toHaveLength(2);
    });

    test("Update Connect element", async () => {
        const result = await session.evaluate(async ({ client }) => {
            const classId = await client.stores.classes.add({
                name: "Warlock",
                description: ["Edge child"],
            });

            const spellListId = await client.stores.spellLists.add({
                name: "Warlock Spell List",
            });

            return await client.stores.spellLists.updateFirst({
                where: {
                    id: spellListId,
                },
                data: {
                    class: {
                        $connect: classId,
                    },
                },
            });
        });
        expect(result?.class).toBeDefined();
    });

    test("Update Disconnect element", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    class: {
                        $disconnect: true,
                    },
                },
            });
        });
        expect(result?.class).toBe(null);
    });

    test("Update ConnectMany element", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const spells = await client.stores.spells.addMany([
                {
                    name: "Chromatic Orb",
                    level: 1,
                    components: ["V"],
                    range: "120 ft",
                },
                {
                    name: "Booming Blade",
                    level: 0,
                    components: ["S", "M"],
                    range: "5 ft",
                },
            ]);
            if (spells.length !== 2) return;

            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: {
                        $connectMany: spells,
                    },
                },
            });
        });
        expect(result?.spells, JSON.stringify(result)).toHaveLength(2);
    });
    test("Update Append ConnectMany", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const spells = await client.stores.spells.addMany([
                {
                    name: "Greater Invisbility",
                    level: 4,
                    components: ["V"],
                    range: "5 ft",
                },
                {
                    name: "Invisibility",
                    level: 2,
                    components: ["S", "M"],
                    range: "5 ft",
                },
            ]);
            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: {
                        $connectMany: spells,
                    },
                },
            });
        });
        expect(result?.spells).toHaveLength(4);
    });

    test("Update Append CreateMany", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: {
                        $createMany: [
                            {
                                name: "Darkness",
                                level: 2,
                                components: ["V", "S", "M"],
                                range: "60 ft",
                            },
                            {
                                name: "Eldritch Blast",
                                level: 0,
                                components: ["S"],
                                range: "120 ft",
                            },
                            {
                                name: "Mage Armor",
                                level: 1,
                                components: ["M"],
                                range: "5 ft",
                            },
                        ],
                    },
                },
            });
        });
        expect(result?.spells).toHaveLength(7);
    });
    test("Update DisconnectMany", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const level2 = await client.stores.spells.find({
                where: { level: 2 },
            });
            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: {
                        $disconnectMany: level2.map((l) => l.id),
                    },
                },
            });
        });
        expect(result?.spells).toHaveLength(5);
    });

    test("Update Multiple Disconnect", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const level2 = await client.stores.spells.find({
                where: { level: 0 },
            });
            if (level2.length !== 2) return;

            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: [
                        { $disconnect: level2[0].id },
                        { $disconnect: level2[1].id },
                    ],
                },
            });
        });
        expect(result?.spells).toHaveLength(3);
    });

    test("Update Multiple Connect", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const level0 = await client.stores.spells.find({
                where: { level: 0 },
            });
            if (level0.length !== 2) return;

            return await client.stores.spellLists.updateFirst({
                where: {
                    name: "Warlock Spell List",
                },
                data: {
                    spells: [
                        { $connect: level0[0].id },
                        { $connect: level0[1].id },
                    ],
                },
            });
        });
        expect(result?.spells).toHaveLength(5);
    });

    test("Update Delete", async () => {
        const result = await session.evaluate(async ({ client, pkg }) => {
            const level0 = await client.stores.spells.find({
                where: { level: 0 },
            });
            if (level0.length !== 2) return;

            return {
                update: await client.stores.spellLists.updateFirst({
                    where: {
                        name: "Warlock Spell List",
                    },
                    data: {
                        spells: {
                            $delete: level0[0].id,
                        },
                    },
                }),
                cantrips: await client.stores.spells.find({
                    where: { level: 0 },
                }),
            };
        });
        expect(result?.update?.spells).toHaveLength(4);
        expect(result?.cantrips).toHaveLength(1);
    });
});

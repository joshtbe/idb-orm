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

            await client.stores.classes.updateFirst({
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

            return client.stores.classes.findFirst({ where: { id } });
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

            await client.stores.classes.updateFirst({
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

            return client.stores.classes.findFirst({
                where: { id: wizard.id },
            });
        });
        expect(result).toBeDefined();
        expect(result?.description).toHaveLength(1);
        expect(result?.description).toEqual(["Also a huge nerd"]);
    });

    test("Basic Update with no matching element", async () => {
        const result = await session.evaluate(async ({ client }) => {
            await client.stores.classes.updateFirst({
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

            return client.stores.classes.findFirst({
                where: { name: "Warlock" },
            });
        });
        expect(result).toBeUndefined();
    });

    test("Update Create element", async () => {
        const result = await session.evaluate(async ({ client }) => {
            const id = await client.stores.classes.updateFirst({
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

            return client.stores.classes.findFirst({
                where: { id },
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

            await client.stores.spellLists.updateFirst({
                where: {
                    id: spellListId,
                },
                data: {
                    class: {
                        $connect: classId,
                    },
                },
            });

            return await client.stores.spellLists.findFirst({
                where: {
                    id: spellListId,
                },
            });
        });
        expect(result?.class).toBeDefined();
    });
});

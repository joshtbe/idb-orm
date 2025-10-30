import { test, expect, Page } from "@playwright/test";
import { ContextSession, EvalFn, populatePage } from "./helpers.js";
import { Builder, Field } from "../dist/index.js";
import * as idbOrm from "../dist/index.js";
import * as zod from "zod";

export type Packages = {
    pkg: typeof idbOrm;
    zod: typeof zod;
};
export type SessionArguments = Packages & {
    client: Awaited<ReturnType<typeof createDb>>;
};

const createDb = async ({ zod, pkg }: Packages) => {
    const Builder = pkg.Builder;
    const Field = pkg.Field;
    const z = zod;
    const builder = new Builder("testdb", ["classes", "spellLists", "spells"]);

    const classStore = builder.defineModel("classes", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        description: Field.string().array(),
        spellList: Field.relation("spellLists", {
            name: "spellList2class",
        }).optional({ onDelete: "SetNull" }),
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

    const spellStore = builder.defineModel("spells", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        range: Field.string(),
        components: Field.custom(z.enum(["V", "S", "M"]).array()),
        level: Field.number().default(0),
        lists: Field.relation("spellLists", {
            name: "spells2spellLists",
        }).array(),
    });

    const db = builder.compile({
        classes: classStore,
        spellLists: spellListStore,
        spells: spellStore,
    });

    const client = await db.createClient();
    return client;
};

test.describe("1 page multi-test", () => {
    test.describe.configure({ mode: "default" });
    
    let page: Page;
    let session: ContextSession<SessionArguments>;
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        page = await context.newPage();
        session = await populatePage<SessionArguments>(page, {
            pkg: "import('./index.js')",
            zod: 'import("https://cdn.jsdelivr.net/npm/zod@4.1.12/+esm")',
            client: createDb as any,
        });
    });

    test.afterAll(async ({ browser }) => {
        await browser.close();
    });

    test("Sample DB", async () => {
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
                components: ["V", "S"],
                range: "120 feet",
            });
            return await stores.spells.find({ where: { level: 0 } });
        });
        expect(result).toBeInstanceOf(Array);
        expect(result.length === 1).toBeTruthy();
    });
});

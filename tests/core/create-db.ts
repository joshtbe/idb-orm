import type * as core from "@idb-orm/core";

export type Packages = {
    pkg: typeof core;
};
export type SessionArguments = Packages & {
    client: Awaited<ReturnType<typeof createDb>>;
};

export const createDb = async ({ pkg }: Packages) => {
    const Builder = pkg.Builder;
    const Field = pkg.Property;
    const builder = new Builder("testdb", [
        "classes",
        "spellLists",
        "spells",
        "subclass",
    ]);

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

    const spellStore = builder.defineModel("spells", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        range: Field.string(),
        components: Field.union([
            Field.literal("V"),
            Field.literal("S"),
            Field.literal("M"),
        ]).array(),
        level: Field.number().default(0),
        lists: Field.relation("spellLists", {
            name: "spells2spellLists",
        }).array(),
    });

    const db = builder.compile({
        classes: classStore,
        spellLists: spellListStore,
        spells: spellStore,
        subclass,
    });

    const client = await db.createClient();

    // @ts-ignore
    return client;
};

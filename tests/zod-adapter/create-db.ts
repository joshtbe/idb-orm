import { Packages, coreTests } from "../core/create-db.js";
import * as ZOD from "zod";
import * as zodPackage from "@idb-orm/zod-adapter";

export type SessionArguments = Packages & {
    z: typeof ZOD;
    a: typeof zodPackage;
    client: Awaited<ReturnType<typeof createZodDb>>;
};

export const createZodDb: any = async ({ pkg, a, z }: SessionArguments) => {
    const Builder = pkg.Builder;
    const Field = pkg.Property;

    const builder = new Builder("testdb", [
        "classes",
        "spellLists",
        "spells",
        "subclass",
        "components",
        "attack",
    ]);

    const stringSchema = z.string();

    const subclassStore = builder.defineModel(
        a.zodModel("subclass", {
            id: Field.primaryKey().autoIncrement(),
            name: stringSchema,
            class: Field.relation("classes", { name: "class2subclass" }),
        }),
    );

    const classStore = builder.defineModel(
        a.zodModel("classes", {
            id: Field.primaryKey().autoIncrement(),
            name: stringSchema,
            description: stringSchema.array(),
            spellList: Field.relation("spellLists", {
                name: "spellList2class",
            }).optional({ onDelete: "SetNull" }),
            subclasses: Field.relation("subclass", {
                name: "class2subclass",
            }).array(),
        }),
    );

    const spellListStore = builder.defineModel(
        a.zodModel("spellLists", {
            id: Field.primaryKey().autoIncrement(),
            name: stringSchema,
            class: Field.relation("classes", {
                name: "spellList2class",
                onDelete: "Cascade",
            }).optional(),
            spells: Field.relation("spells", {
                name: "spells2spellLists",
            }).array(),
        }),
    );

    const spellStore = builder.defineModel(
        a.zodModel("spells", {
            id: Field.primaryKey().autoIncrement(),
            name: stringSchema,
            range: stringSchema,
            components: z.enum(["V", "S", "M"]).array(),
            level: z.number().nonnegative().default(0),
            cs: Field.relation("components", {
                name: "components2spells",
                bidirectional: false,
            }).array(),
            lists: Field.relation("spellLists", {
                name: "spells2spellLists",
            }).array(),
            onHigherLevels: z.record(stringSchema, stringSchema).optional(),
        }),
    );

    const componentStore = builder.defineModel("components", {
        id: Field.primaryKey().autoIncrement(),
        name: Field.string(),
        abbreviation: Field.string(),
    });

    const attackStore = builder.defineModel(
        a.zodModel("attack", {
            id: Field.primaryKey().uuid(),
            name: stringSchema,
            range: z.discriminatedUnion("type", [
                z.object({ type: z.literal("melee") }),
                z.object({
                    type: z.literal("ranged"),
                    close: stringSchema,
                    far: stringSchema,
                }),
            ]),
        }),
    );

    const db = builder.compile({
        classes: classStore,
        spellLists: spellListStore,
        spells: spellStore,
        subclass: subclassStore,
        components: componentStore,
        attack: attackStore,
    });

    const client = await db.createClientAsync();
    return client;
};

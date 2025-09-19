import z from "zod";
import { Model, ModelCollection } from "./db2/model.ts";
import { Field } from "./db2/field.ts";

export const DamageTypeSchema = z.enum([
    "acid",
    "force",
    "bludgeoning",
    "slashing",
    "necrotic",
    "radiant",
    "fire",
    "lightning",
    "poison",
    "cold",
    "psychic",
    "piercing",
    "thunder",
]);
export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export const AbilitySchema = z.enum(ABILITIES);
export const MagicSchoolSchema = z.enum([
    "evocation",
    "conjuration",
    "abjuration",
    "transmutation",
    "enchantment",
    "necromancy",
    "divination",
    "illusion",
]);

export const db = ModelCollection.createBuilder([
    "audio",
    "files",
    "spells",
    "characters",
])({
    audio: new Model({
        id: Field.primaryKey(),
        name: Field.string(),
        file: Field.relation("files", "audioToFiles"),
        duration: Field.custom(z.number().positive()),
        trim: Field.optional(
            z
                .object({
                    start: z.number().nonnegative(),
                    end: z.number().positive(),
                })
                .refine((o) => o.start < o.end)
        ),
        volume: Field.optional(z.number().min(0).max(1)),
    }),
    files: new Model({
        id: Field.primaryKey().uuid(),
        name: Field.string(),
        file: Field.custom(z.file()),
        type: Field.custom(z.enum(["image", "audio", "video"])),
        parent: Field.relation("files", "childrenToParent").optional(),
        children: Field.relation("files", "childrenToParent").array(),
        audio: Field.relation("audio", "audioToFiles").array(),
    }),
    spells: new Model({
        id: Field.primaryKey(),
        name: Field.string(),
        desc: Field.array(Field.schemas.string),
        higher_level: Field.array(Field.schemas.string),
        range: Field.string(),
        components: Field.custom(z.enum(["V", "S", "M"]).array()),
        material: Field.optional(Field.schemas.string),
        ritual: Field.boolean(),
        duration: Field.string(),
        concentration: Field.boolean(),
        casting_time: Field.string(),
        level: Field.custom(z.number().nonnegative()),
        attack_type: Field.custom(z.enum(["melee", "ranged"]).default("melee")),
        area_of_effect: Field.custom(
            z
                .object({
                    type: z.enum([
                        "cube",
                        "sphere",
                        "line",
                        "cone",
                        "cylinder",
                    ]),
                    size: z.number().positive(),
                })
                .optional()
        ),
        damage: Field.custom(
            z
                .object({
                    damage_type: DamageTypeSchema.optional(),
                    damage_at_slot_level: z
                        .record(
                            Field.schemas.string.regex(/^[0-9]$/),
                            Field.schemas.string
                        )
                        .optional(),
                    damage_at_character_level: z
                        .record(
                            Field.schemas.string.regex(/^[0-9]+$/),
                            Field.schemas.string
                        )
                        .optional(),
                })
                .optional()
        ),
        heal_at_slot_level: Field.custom(
            z
                .record(
                    Field.schemas.string.regex(/^[0-9]$/),
                    Field.schemas.string
                )
                .optional()
        ),
        dc: Field.custom(
            z
                .object({
                    dc_type: AbilitySchema,
                    dc_success: z.enum(["none", "half", "other"]),
                })
                .optional()
        ),
        school: Field.custom(MagicSchoolSchema),
    }),
    characters: new Model({
        id: Field.primaryKey().stringGenerator(() => `${Date.now()}`),
        name: Field.string(),
        class: Field.string().optional(),
    }),
});
console.log(db.schemas.audio);

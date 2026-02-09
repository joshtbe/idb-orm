import { InvalidConfigError, InvalidItemError, UnknownError } from "../error";
import {
    BaseRelation,
    DiscriminatedUnionTag,
    PrimaryKey,
    Property,
    Tag,
    Type,
    TypeTag,
    ValidKey,
    ValidValue,
} from "../field";
import { Dict, Literable, RequiredKey } from "../util-types";
import { FindPrimaryKey } from "./model-types";
import { BaseModel } from "./base-model";

interface UnionOptions<
    Discriminator extends string,
    Options extends readonly RequiredKey<Discriminator, ValidValue>[],
> {
    key: Discriminator;
    options: Options;
}

/**
 *
 * File to define a union model class.
 *
 * This type of model will have a different structure depending on the value of a given "discriminator" key.
 *
 * The class should consist of 3 main components:
 *  1. The key of each document that will be used as the discriminator, as a string.
 *  2. A base document that MUST house the primary key definition. It can also house additional fields.
 *  3. An array of different possible documents. Each document must contain the discriminator key and a unique, LITERAL value associated with it.
 *
 * Some things will need to be accounted for:
 *  1. Relations can be in the options array, this means that additional checks need to be made when
 *      connected/creating documents that the discriminator key is correct.
 *  2. I'm not even sure if this is possible with the TS type system.
 */

export class UnionModel<
    Name extends string,
    Base extends Dict<ValidValue>,
    Discriminator extends string,
    const Options extends readonly RequiredKey<Discriminator, ValidValue>[],
    Primary extends FindPrimaryKey<Base> = FindPrimaryKey<Base>,
> extends BaseModel<Name, Base & Options[number], Primary> {
    protected static readonly SYMBOL = Symbol.for("union_model");
    private readonly symbol = UnionModel.SYMBOL;

    readonly baseSchema: DiscriminatedUnionTag;
    private readonly baseFieldSymbol = Symbol.for("base");
    private readonly fieldMap = new Map<Literable | symbol, Dict<ValidValue>>();
    public readonly primaryKey = "" as Primary;

    /**
     * Key that is used in the different options as the discriminator.
     */
    private readonly discriminator: Discriminator;

    constructor(
        public readonly name: Name,
        base: Base,
        options: UnionOptions<Discriminator, Options>,
    ) {
        super();
        this.fieldMap.set(this.baseFieldSymbol, base);
        let foundPrimary = false;
        const baseProps: Dict<TypeTag> = {};

        // Find the primary key in the base fields
        for (const baseKey in base) {
            if (!Object.hasOwn(base, baseKey)) continue;

            const item = base[baseKey];
            if (PrimaryKey.is(item)) {
                if (foundPrimary) {
                    throw new InvalidConfigError(
                        `Model ${this.name} has more than one primary key.`,
                    );
                }
                if (!item.isGenerated()) {
                    baseProps[baseKey] = item.type;
                }
                this.primaryKey = baseKey as Primary;
                foundPrimary = true;
            } else if (Property.is(item)) {
                baseProps[baseKey] = item.type;
            }
        }

        if (!foundPrimary) {
            throw new InvalidConfigError(
                `Model ${this.name} has no primary key.`,
            );
        }

        this.discriminator = options.key;
        const discOptions: RequiredKey<Discriminator, TypeTag>[] = [];

        // Loop through the options, make sure they have the discriminator key, and that the value of that key is a literal value
        for (const opt of options.options) {
            // Check disciminator value
            const disc = opt[this.discriminator];

            if (!Property.is(disc) || disc.type.tag !== Tag.literal) {
                throw new InvalidConfigError(
                    `Option of model '${this.name}' with discriminator '${this.discriminator}' does not have the discriminator defined as a literal property.`,
                );
            }
            const discValue = disc.type.value as Literable;
            const discOpt: Dict<TypeTag> = {
                [this.discriminator]: disc.type,
            };

            // Make sure no models are sharing discriminator values
            if (this.fieldMap.has(discValue)) {
                throw new InvalidConfigError(
                    `Model '${this.name}':  Duplicate options with discriminator value '${discValue}' detected.`,
                );
            }

            for (const key in opt) {
                if (!Object.hasOwn(opt, key) || key === this.discriminator) {
                    continue;
                }

                if (PrimaryKey.is(opt[key])) {
                    throw new InvalidConfigError(
                        `Option of model '${this.name}' with discriminator '${this.discriminator}' defines a primary key. This is not allowed.`,
                    );
                } else if (Property.is(opt[key])) {
                    discOpt[key] = opt[key].type;
                }
            }
            this.fieldMap.set(discValue, opt);
            discOptions.push(discOpt as RequiredKey<Discriminator, TypeTag>);
        }

        // In case this model relates to itself, remove it from the relation links to prevent circular referencing
        this.baseSchema = Type.discriminatedUnion(
            baseProps,
            this.discriminator,
            discOptions,
        );
    }

    build(relationMap: Map<BaseRelation<string, any>, TypeTag>): void {
        const baseProps: Dict<TypeTag> = {
            [this.primaryKey]: this.getPrimaryKey().type,
        };
        const options: RequiredKey<Discriminator, TypeTag>[] = [];

        for (const [key, struct] of this.fieldMap) {
            const isBase = key === this.baseFieldSymbol;
            const opt: Dict<TypeTag> = isBase
                ? baseProps
                : {
                      [this.discriminator]: (
                          struct[this.discriminator] as Property<any, any>
                      ).type,
                  };
            for (const fieldKey in struct) {
                if (!Object.hasOwn(struct, fieldKey)) continue;
                const item = struct[fieldKey];
                if (BaseRelation.is(item)) {
                    const relationType = relationMap.get(item);
                    if (!relationType) {
                        throw new UnknownError(
                            `Relation '${item.name}' on model '${this.name}' does not appear in the relationMap.`,
                        );
                    }
                    opt[fieldKey] = relationType;
                }
            }
            if (!isBase) {
                options.push(opt as RequiredKey<Discriminator, TypeTag>);
            }
        }

        this.buildModel(
            Type.discriminatedUnion(baseProps, this.discriminator, options),
        );
    }

    /**
     * Generator for all of the entries present on the model
     */
    *entries(): Generator<[key: string, value: ValidValue]> {
        for (const struct of this.fieldMap.values()) {
            for (const key in struct) {
                if (!Object.hasOwn(struct, key)) continue;
                yield [key, struct[key]];
            }
        }
    }

    *entriesFor<K extends string = string>(
        payload: Dict<any>,
    ): Generator<[key: string, entry: ValidValue<K>], void, unknown> {
        const base = this.fieldMap.get(this.baseFieldSymbol)!;
        const discOption = this.fieldMap.get(
            payload[this.discriminator] as Literable,
        );
        if (!discOption) {
            throw new InvalidItemError(
                `Given document does not possess a valid '${this.discriminator}' key.`,
            );
        }
        for (const key in base) {
            if (!Object.hasOwn(base, key)) continue;
            yield [key, base[key] as ValidValue<K>];
        }
        for (const key in discOption) {
            if (!Object.hasOwn(discOption, key)) continue;
            yield [key, discOption[key] as ValidValue<K>];
        }
    }

    protected get<
        K extends
            | Extract<keyof Base, string>
            | Extract<keyof Options[number], string>,
    >(
        key: K,
        discriminator: symbol | Literable = this.baseFieldSymbol,
    ): (Base & Options[number])[K] {
        const item = this.fieldMap.get(discriminator);
        if (!item) {
            throw new InvalidConfigError(
                `Option '${String(discriminator)}' on model '${this.name}' not found.`,
            );
        }
        return item[key] as (Base & Options[number])[K];
    }

    getPrimaryKey() {
        return this.fieldMap.get(this.baseFieldSymbol)![
            this.primaryKey
        ] as PrimaryKey<boolean, ValidKey>;
    }

    instantiateDefaults(payload: Dict): Dict {
        const base = this.fieldMap.get(this.baseFieldSymbol)!;
        for (const key in base) {
            if (!Object.hasOwn(base, key)) continue;

            const entry = base[key];
            if (
                Property.is(entry) &&
                !payload[key] &&
                entry.hasDefaultValue()
            ) {
                payload[key] = entry.getDefaultValue();
            }
        }

        const discValue = payload[this.discriminator];
        for (const [key, struct] of this.fieldMap) {
            if (key === this.baseFieldSymbol) continue;
            if (key !== discValue) continue;

            for (const structKey in struct) {
                if (!Object.hasOwn(struct, structKey)) continue;

                const entry = struct[structKey];
                if (
                    Property.is(entry) &&
                    !payload[structKey] &&
                    entry.hasDefaultValue()
                ) {
                    payload[structKey] = entry.getDefaultValue();
                }
            }
        }

        return payload;
    }

    *relationsFor<K extends string = string>(
        payload: Dict<any>,
    ): Generator<
        [key: string, relation: BaseRelation<K, string>],
        void,
        unknown
    > {
        const base = this.fieldMap.get(this.baseFieldSymbol)!;
        const discOption = this.fieldMap.get(
            payload[this.discriminator] as Literable,
        );
        if (!discOption) {
            throw new InvalidItemError(
                `Given document does not possess a valid '${this.discriminator}' key.`,
            );
        }
        for (const key in base) {
            if (!Object.hasOwn(base, key)) continue;
            if (BaseRelation.is<K>(base[key])) {
                yield [key, base[key]];
            }
        }
        for (const key in discOption) {
            if (!Object.hasOwn(discOption, key)) continue;
            if (BaseRelation.is<K>(discOption[key])) {
                yield [key, discOption[key]];
            }
        }
    }

    static isType<
        Name extends string,
        Base extends Dict<ValidValue>,
        Discriminator extends string,
        const Options extends readonly RequiredKey<Discriminator, ValidValue>[],
    >(value: object): value is UnionModel<Name, Base, Discriminator, Options> {
        return (value as any)?.symbol === this.SYMBOL;
    }
}

const _x = new UnionModel(
    "hello",
    {
        id: Property.primaryKey().autoIncrement(),
        name: Property.string(),
    },
    {
        key: "type",
        options: [
            { type: Property.literal("hello"), value: Property.number() },
            {
                type: Property.literal(134),
                value: Property.set(Property.number()),
            },
        ],
    },
);

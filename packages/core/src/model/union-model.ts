// TODO: Implement this

import { InvalidConfigError } from "../error.js";
import { BaseRelation, PrimaryKey, Property, Tag, ValidValue } from "../field";
import { Dict, Keyof, Literable, RequiredKey } from "../util-types";
import { getKeys } from "../utils.js";
import { FindPrimaryKey } from "./model-types";
import Model from "./model";

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
> {
    protected static readonly SYMBOL = Symbol.for("union_model");
    private readonly symbol = UnionModel.SYMBOL;
    private readonly baseKeys: Keyof<Base>[];
    private readonly baseFieldSymbol = Symbol.for("base");
    private readonly fieldMap = new Map<Literable | symbol, Dict<ValidValue>>();
    public readonly primaryKey = "" as Primary;

    /**
     * Key that is used in the different options as the discriminator.
     */
    private readonly discriminator: Discriminator;

    /**
     * Set of other models this model links to
     */
    private readonly relationLinks = new Set<string>();

    constructor(
        public readonly name: Name,
        base: Base,
        options: UnionOptions<Discriminator, Options>,
    ) {
        this.baseKeys = getKeys(base);
        this.fieldMap.set(this.baseFieldSymbol, base);
        let foundPrimary = false;

        // Find the primary key in the base fields
        for (const baseKey of this.baseKeys) {
            const item = base[baseKey];
            if (BaseRelation.is(item)) {
                this.relationLinks.add(item.to);
            } else if (PrimaryKey.is(item)) {
                if (foundPrimary) {
                    throw new InvalidConfigError(
                        `Model ${this.name} has more than one primary key.`,
                    );
                }
                this.primaryKey = baseKey as Primary;
                foundPrimary = true;
            }
        }

        if (!foundPrimary) {
            throw new InvalidConfigError(
                `Model ${this.name} has no primary key.`,
            );
        }

        this.discriminator = options.key;

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

            // Make sure no models are sharing discriminator values
            if (this.fieldMap.has(discValue)) {
                throw new InvalidConfigError(
                    `Model '${this.name}':  Duplicate options with discriminator value '${discValue}' detected.`,
                );
            }

            for (const key in opt) {
                if (!Object.hasOwn(opt, key) || key === this.discriminator) {
                    continue;
                } else if (PrimaryKey.is(opt[key])) {
                    throw new InvalidConfigError(
                        `Option of model '${this.name}' with discriminator '${this.discriminator}' defines a primary key. This is not allowed.`,
                    );
                } else if (BaseRelation.is(opt[key])) {
                    this.relationLinks.add(opt[key].to);
                }
            }
            this.fieldMap.set(discValue, opt);
        }

        // In case this model relates to itself, remove it from the relation links to prevent circular referencing
        this.relationLinks.delete(this.name);
    }

    static is<
        Name extends string,
        Fields extends Dict<ValidValue>,
        Primary extends FindPrimaryKey<Fields> = FindPrimaryKey<Fields>,
    >(value: object): value is Model<Name, Fields, Primary> {
        return (value as any)?.symbol === this.SYMBOL;
    }
}

import { BaseRelation, PrimaryKey, ValidValue, ValidKey } from "../field";
import { Dict, Keyof } from "../util-types";
import { getKeys } from "../utils.js";
import { InvalidConfigError } from "../error";
import { FindPrimaryKey, ModelCache } from "./model-types";
import { BaseModel } from "./base-model.js";

export default class Model<
    Name extends string,
    F extends Dict<ValidValue>,
    Primary extends FindPrimaryKey<F> = FindPrimaryKey<F>,
> extends BaseModel<Name, F, Primary> {
    protected static readonly SYMBOL = Symbol.for("model");
    private readonly symbol = Model.SYMBOL;

    /**
     * Array of all the model's fields
     */
    protected readonly fieldKeys: readonly Keyof<F>[];
    /**
     * Set of other models this model links to
     */
    protected readonly relationLinks = new Set<string>();
    protected cache: ModelCache = {};
    public readonly primaryKey = "" as Primary;
    constructor(
        public readonly name: Name,
        private readonly fields: F,
    ) {
        super();
        this.fieldKeys = getKeys(fields);
        let foundPrimary = false;

        // Generate a set of all models this one is linked to
        for (const key of this.fieldKeys) {
            const item = this.fields[key];
            if (BaseRelation.is(item)) {
                if (item.to !== this.name) {
                    this.relationLinks.add(item.to);
                }
            } else if (PrimaryKey.is(item)) {
                if (foundPrimary) {
                    throw new InvalidConfigError(
                        `Model ${this.name} has more than one primary key.`,
                    );
                }
                this.primaryKey = key as Primary;
                foundPrimary = true;
            }
        }

        if (!foundPrimary) {
            throw new InvalidConfigError(
                `Model ${this.name} has no primary key`,
            );
        }
    }

    get<K extends Keyof<F>>(key: K): F[K] {
        return this.fields[key];
    }

    getPrimaryKey() {
        return this.fields[this.primaryKey] as PrimaryKey<boolean, ValidKey>;
    }

    static is<
        Name extends string,
        Fields extends Dict<ValidValue>,
        Primary extends FindPrimaryKey<Fields> = FindPrimaryKey<Fields>,
    >(value: object): value is Model<Name, Fields, Primary> {
        return super.is(value) && (value as any)?.symbol === this.SYMBOL;
    }
}

import {
    BaseRelation,
    PrimaryKey,
    ValidValue,
    ValidKey,
    ObjectTag,
    TypeTag,
    Type,
    Property,
} from "../field";
import { Dict, Keyof } from "../util-types";
import { InvalidConfigError, UnknownError } from "../error";
import { FindPrimaryKey } from "./model-types";
import { BaseModel } from "./base-model";

export class Model<
    Name extends string,
    F extends Dict<ValidValue>,
    Primary extends FindPrimaryKey<F> = FindPrimaryKey<F>,
> extends BaseModel<Name, F, Primary> {
    protected static readonly SYMBOL = Symbol.for("model");
    private readonly symbol = Model.SYMBOL;

    protected readonly baseSchema: ObjectTag;
    public readonly primaryKey = "" as Primary;
    constructor(
        public readonly name: Name,
        private readonly fields: F,
    ) {
        super();
        let foundPrimary = false;
        const props: Dict<TypeTag> = {};

        // Generate a set of all models this one is linked to
        for (const key in this.fields) {
            if (!Object.hasOwn(this.fields, key)) continue;

            if (key.length === 0) {
                throw new InvalidConfigError(
                    `Model '${this.name}' has an empty-string field key. This is not allowed.`,
                );
            }
            const item = this.fields[key];
            if (PrimaryKey.is(item)) {
                if (foundPrimary) {
                    throw new InvalidConfigError(
                        `Model ${this.name} has more than one primary key.`,
                    );
                }
                this.primaryKey = key as Primary;
                props[key] = item.type;
                foundPrimary = true;
            } else if (Property.is(item)) {
                props[key] = item.type;
            }
        }

        if (!foundPrimary) {
            throw new InvalidConfigError(
                `Model ${this.name} has no primary key`,
            );
        }
        this.baseSchema = Type.object(props);
    }

    build(relationMap: Map<BaseRelation<string, string>, TypeTag>): void {
        const props: Dict<TypeTag> = {};

        for (const [key, field] of this.entries()) {
            if (BaseRelation.is(field)) {
                const relationType = relationMap.get(field);
                if (!relationType) {
                    throw new UnknownError(
                        `Relation '${field.name}' on model '${this.name}' does not appear in the relationMap.`,
                    );
                }
                props[key] = relationType;
            }
        }

        this.buildModel(Type.object(props));
    }

    /**
     * Generator for all of the entries present on the model
     */
    *entries(): Generator<[key: string, value: ValidValue]> {
        for (const key in this.fields) {
            if (!Object.hasOwn(this.fields, key)) continue;
            yield [key, this.fields[key]];
        }
    }

    protected get<K extends Keyof<F>>(key: K): F[K] {
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

import { CollectionSchema, FindPrimaryKey, Model } from "./model";
import { DbClient } from "./client";
import {
    BaseRelation,
    AbstractProperty,
    PrimaryKey,
    type ValidValue,
    ParseFn,
    Property,
} from "./field";
import type { Dict, Keyof } from "./util-types";
import { getKeys, handleRequest } from "./utils";
import { InvalidConfigError } from "./error";
import { VALIDATORS } from "./field/validators.js";

export type CollectionObject<Names extends string> = {
    [K in Names]: Model<K, any>;
};

export class Builder<Name extends string, Names extends string> {
    private models: Record<Names, Model<Names, Dict<ValidValue>>>;
    constructor(public readonly name: Name, public readonly names: Names[]) {
        this.models = {} as any;
    }

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        model: Model<N, T, FindPrimaryKey<T>>
    ): Model<N, T, FindPrimaryKey<T>>;

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        name: N,
        values: T
    ): Model<N, T, FindPrimaryKey<T>>;

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        nameOrModel: N | Model<N, T, FindPrimaryKey<T>>,
        values?: T
    ): Model<N, T, FindPrimaryKey<T>> {
        if (nameOrModel instanceof Model) {
            this.models[nameOrModel.name] = nameOrModel as any;
            return nameOrModel;
        } else {
            if (!values) throw new Error("Model Fields must be defined");
            const m = new Model(nameOrModel, values);
            this.models[nameOrModel] = m as any;
            return m;
        }
    }

    compile<M extends CollectionObject<Names>>(models: M) {
        return new CompiledDb<Name, Names, M>(this.name, models);
    }
}

export class CompiledDb<
    Name extends string,
    Names extends string,
    C extends CollectionObject<Names>
> {
    public readonly schemas: CollectionSchema<C>;
    private readonly modelKeys: Names[];
    constructor(public readonly name: Name, private readonly models: C) {
        this.modelKeys = getKeys<Record<Names, unknown>>(this.models);
        this.schemas = {} as CollectionSchema<C>;
        for (const key of this.modelKeys) {
            const model = this.models[key];
            const schema: Dict<ParseFn<any>> = {};
            for (const fieldKey of model.keys()) {
                const field = model.get(fieldKey);
                if (field instanceof AbstractProperty) {
                    schema[fieldKey] = field.parse;
                } else if (field instanceof BaseRelation) {
                    const { onDelete } = field.getActions();
                    const linked = this.models[field.to as Keyof<C>];
                    const linkedPrimary = linked.getPrimaryKey();
                    schema[fieldKey] = VALIDATORS[linkedPrimary.type.tag];
                    if (field.isOptional) {
                        schema[fieldKey] = new Property(
                            schema[fieldKey],
                            linkedPrimary.type
                        ).optional().parse;
                    } else if (field.isArray) {
                        schema[fieldKey] = schema[fieldKey] = new Property(
                            schema[fieldKey],
                            linkedPrimary.type
                        ).array().parse;
                    }

                    let hasRelation = !!field.getRelatedKey();
                    if (!hasRelation) {
                        for (const [otherKey, element] of linked.relations()) {
                            if (
                                fieldKey !== otherKey &&
                                element.to === model.name &&
                                element.name === field.name
                            ) {
                                hasRelation = true;
                                field.setRelatedKey(otherKey);
                                element.setRelatedKey(fieldKey);
                                if (
                                    onDelete === "SetNull" &&
                                    !element.isNullable()
                                ) {
                                    throw new InvalidConfigError(
                                        `Key '${otherKey}' on model '${linked.name}': Non-optional relation cannot have the 'SetNull' action`
                                    );
                                }
                                break;
                            }
                        }
                    }

                    if (!hasRelation)
                        throw new InvalidConfigError(
                            `Relation '${field.name}' of model ${key} does not have an equivalent relation on model '${field.to}'`
                        );
                } else if (field instanceof PrimaryKey) {
                    schema[fieldKey] = VALIDATORS[field.type.tag];
                } else {
                    throw new InvalidConfigError(
                        `Unknown field value detected: ${JSON.stringify(field)}`
                    );
                }
            }
            this.schemas[key] = schema as CollectionSchema<C>[Names];
        }
    }

    getModel<N extends Names>(name: N): C[N] {
        return this.models[name];
    }

    async createClient(version: number = 1) {
        const openRequest = window.indexedDB.open(this.name, version);

        openRequest.onupgradeneeded = (event) => {
            const db = (event.target as unknown as { result: IDBDatabase })
                .result;

            for (const key of this.modelKeys) {
                const model = this.models[key];
                if (!db.objectStoreNames.contains(model.name))
                    db.createObjectStore(model.name, {
                        autoIncrement: model
                            .getPrimaryKey()
                            .isAutoIncremented(),
                        keyPath: model.primaryKey,
                    });
            }
        };

        const db = await handleRequest(openRequest);
        return new DbClient(db, this);
    }

    keys() {
        return [...this.modelKeys];
    }
}

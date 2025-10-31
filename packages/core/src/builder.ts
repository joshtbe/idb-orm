import { CollectionSchema, Model } from "./model";
import { DbClient } from "./client";
import {
    BaseRelation,
    AbstractProperty,
    PrimaryKey,
    type ValidValue,
    ParseFn,
    Property,
} from "./field";
import type { Dict, Keyof } from "./types";
import { getKeys, handleRequest, stringTypeToEnum } from "./utils";
import { StoreError } from "./error";

export type CollectionObject<Names extends string> = {
    [K in Names]: Model<K, any>;
};

export class Builder<Name extends string, Names extends string> {
    private models: Record<Names, Model<Names, Dict<ValidValue>>>;
    constructor(public readonly name: Name, public readonly names: Names[]) {
        this.models = {} as any;
    }

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        name: N,
        values: T
    ) {
        const m = new Model(name, values);
        this.models[name] = m as any;
        return m;
    }

    // TODO: Implement union models

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
        this.modelKeys = getKeys(this.models) as unknown as Names[];
        this.schemas = {} as CollectionSchema<C>;
        for (const key of this.modelKeys) {
            const model = this.models[key];
            const schema: Dict<ParseFn<any>> = {};
            for (const fieldKey of model.keys()) {
                const field = model.get(fieldKey);
                if (field instanceof AbstractProperty) {
                    schema[fieldKey] = field.validate;
                } else if (field instanceof BaseRelation) {
                    const linkedModel = this.models[field.to as Keyof<C>];
                    const linkedPrimary = linkedModel.getPrimaryKey();
                    schema[fieldKey] =
                        AbstractProperty.validators[linkedPrimary.type];
                    if (field.isOptional) {
                        schema[fieldKey] = new Property(
                            schema[fieldKey],
                            stringTypeToEnum(linkedPrimary.type)
                        ).optional().validate;
                    } else if (field.isArray) {
                        schema[fieldKey] = schema[fieldKey] = new Property(
                            schema[fieldKey],
                            stringTypeToEnum(linkedPrimary.type)
                        ).array().validate;
                    }

                    let hasRelation = !!field.getRelatedKey();
                    if (!hasRelation) {
                        for (const otherKey of linkedModel.keys()) {
                            const element = linkedModel.get(otherKey);
                            if (
                                fieldKey !== otherKey &&
                                element instanceof BaseRelation &&
                                element.to === model.name &&
                                element.name === field.name
                            ) {
                                // They're pointing to the same model
                                if (element.to === field.to) {
                                    hasRelation = fieldKey !== otherKey;
                                } else {
                                    hasRelation = true;
                                }
                                if (hasRelation) {
                                    field.setRelatedKey(otherKey);
                                    element.setRelatedKey(fieldKey);
                                }
                                break;
                            }
                        }
                    }

                    if (!hasRelation)
                        throw new StoreError(
                            "INVALID_CONFIG",
                            `Relation '${field.name}' of model ${key} does not have an equivalent relation on model '${field.to}'`
                        );
                } else if (field instanceof PrimaryKey) {
                    schema[fieldKey] = AbstractProperty.validators[field.type];
                } else {
                    throw new StoreError(
                        "INVALID_CONFIG",
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

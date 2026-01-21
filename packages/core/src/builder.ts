import {
    CollectionObject,
    CollectionSchema,
    FindPrimaryKey,
    Model,
} from "./model";
import { DbClient } from "./client";
import {
    BaseRelation,
    PrimaryKey,
    type ValidValue,
    Property,
    TypeTag,
    Type,
} from "./field";
import type { Dict, Keyof } from "./util-types";
import { getKeys, handleRequest } from "./utils";
import { InvalidConfigError } from "./error";

export class Builder<Name extends string, Names extends string> {
    private models: Record<Names, Model<Names, Dict<ValidValue>>>;
    constructor(
        public readonly name: Name,
        public readonly names: Names[],
    ) {
        this.models = {} as any;
    }

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        model: Model<N, T, FindPrimaryKey<T>>,
    ): Model<N, T, FindPrimaryKey<T>>;

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        name: N,
        values: T,
    ): Model<N, T, FindPrimaryKey<T>>;

    defineModel<N extends Names, T extends Dict<ValidValue<Names>>>(
        nameOrModel: N | Model<N, T, FindPrimaryKey<T>>,
        values?: T,
    ): Model<N, T, FindPrimaryKey<T>> {
        if (typeof nameOrModel === "object" && Model.is<N, T>(nameOrModel)) {
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
    C extends CollectionObject<Names>,
> {
    public readonly schemas: CollectionSchema<C>;
    private readonly modelKeys: Names[];
    constructor(
        public readonly name: Name,
        private readonly models: C,
    ) {
        this.modelKeys = getKeys<Record<Names, unknown>>(this.models);
        this.schemas = {} as CollectionSchema<C>;
        for (const key of this.modelKeys) {
            const model = this.models[key];
            const schema: Dict<TypeTag> = {};
            for (const [fieldKey, field] of model.entries()) {
                if (Property.is(field)) {
                    schema[fieldKey] = field.type;
                } else if (BaseRelation.is(field)) {
                    const { onDelete } = field.getActions();
                    const linked = this.models[field.to as Keyof<C>];
                    const linkedPrimary = linked.getPrimaryKey();
                    schema[fieldKey] = linkedPrimary.type;
                    if (field.isOptional) {
                        schema[fieldKey] = Type.optional(schema[fieldKey]);
                    } else if (field.isArray) {
                        schema[fieldKey] = Type.array(schema[fieldKey]);
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
                                        `Key '${otherKey}' on model '${linked.name}': Non-optional relation cannot have the 'SetNull' action`,
                                    );
                                }
                                break;
                            }
                        }
                    }

                    if (!hasRelation)
                        throw new InvalidConfigError(
                            `Relation '${field.name}' of model ${key} does not have an equivalent relation on model '${field.to}'`,
                        );
                } else if (PrimaryKey.is(field)) {
                    schema[fieldKey] = field.type;
                } else {
                    throw new InvalidConfigError(
                        `Unknown field value detected: ${JSON.stringify(field)}`,
                    );
                }
            }
            this.schemas[key] = schema as CollectionSchema<C>[Names];
        }
    }

    getModel<N extends Names>(name: N): C[N] {
        return this.models[name];
    }

    async createClientAsync(version: number = 1) {
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

    createClient(
        version: number = 1,
    ):
        | { loading: true; result?: never }
        | { loading: false; result: DbClient<Name, Names, C> } {
        const openRequest = window.indexedDB.open(this.name, version);
        const obj = { loading: true, result: null as never };

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

        openRequest.onsuccess = () => {
            obj.loading = false;
            obj.result = new DbClient(openRequest.result, this) as never;
        };
        return obj;
    }

    keys() {
        return Array.from(this.modelKeys);
    }
}

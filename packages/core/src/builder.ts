import { BaseModel, CollectionObject, FindPrimaryKey, Model } from "./model";
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
import { handleRequest } from "./utils";
import { InvalidConfigError } from "./error";

export class Builder<Name extends string, Names extends string> {
    private models: Record<Names, BaseModel<Names, Dict<ValidValue>, string>>;
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
    constructor(
        public readonly name: Name,
        private readonly collection: C,
    ) {
        const relationMap = new Map<BaseRelation<string, any>, TypeTag>();
        for (const key in this.collection) {
            if (!Object.hasOwn(this.collection, key)) continue;

            relationMap.clear();
            const model = this.collection[key];
            for (const [fieldKey, field] of model.entries()) {
                if (BaseRelation.is<Keyof<C>>(field)) {
                    const { onDelete } = field.getActions();
                    const linked = this.collection[field.to];
                    const linkedPrimary = linked.getPrimaryKey();
                    let type: TypeTag = linkedPrimary.type;
                    if (field.isOptional) {
                        type = Type.optional(type);
                    } else if (field.isArray) {
                        type = Type.array(type);
                    }
                    relationMap.set(field, type);

                    let hasRelation = !field.isBidirectional || field.isBuilt();
                    // Check to make sure the other relation exists (if bidirectional)
                    if (!hasRelation) {
                        for (const [otherKey, element] of linked.relations()) {
                            if (
                                fieldKey !== otherKey &&
                                element.to === model.name &&
                                element.name === field.name
                            ) {
                                hasRelation = true;
                                field.build(otherKey);
                                element.build(fieldKey);
                                if (
                                    onDelete === "SetNull" &&
                                    !element.isNullable()
                                ) {
                                    throw new InvalidConfigError(
                                        `Key '${fieldKey}' on model '${model.name}': Non-optional relation cannot have the 'SetNull' action`,
                                    );
                                }
                                break;
                            }
                        }
                    }

                    if (!hasRelation) {
                        throw new InvalidConfigError(
                            `Relation '${field.name}' of model ${key} does not have an equivalent relation on model '${field.to}'`,
                        );
                    }
                } else if (!Property.is(field) && !PrimaryKey.is(field)) {
                    throw new InvalidConfigError(
                        `Unknown field value detected: ${JSON.stringify(field)}`,
                    );
                }
            }

            model.build(relationMap);
        }
    }

    createClient(
        version: number = 1,
    ):
        | { loading: true; result?: never }
        | { loading: false; result: DbClient<Name, Names, C> } {
        const openRequest = window.indexedDB.open(this.name, version);
        const obj = { loading: true, result: null as never };

        openRequest.onupgradeneeded = (event) => this.onUpgradeNeeded(event);
        openRequest.onsuccess = async () => {
            const cli = new DbClient(openRequest.result, this);
            await this.loadModels(cli);
            obj.result = cli as never;
            obj.loading = false;
        };
        return obj;
    }

    async createClientAsync(version: number = 1) {
        const openRequest = window.indexedDB.open(this.name, version);
        openRequest.onupgradeneeded = (event) => this.onUpgradeNeeded(event);
        const db = await handleRequest(openRequest);

        const cli = new DbClient(db, this);
        await this.loadModels(cli);
        return cli;
    }

    getModel<N extends Names>(name: N): C[N] {
        return this.collection[name];
    }

    *keys() {
        for (const key in this.collection) {
            if (!Object.hasOwn(this.collection, key)) continue;
            yield key as unknown as Names;
        }
    }

    private async loadModels(client: DbClient<Name, Names, C>) {
        const tx = client.createTransaction("readonly", this.toKeys());
        const promises: Promise<void>[] = [];
        for (const model of this.models()) {
            promises.push(model.loadIncrementCounter(client, tx));
        }
        await Promise.all(promises);
    }

    *models() {
        for (const key in this.collection) {
            if (!Object.hasOwn(this.collection, key)) continue;
            yield this.collection[key];
        }
    }

    private onUpgradeNeeded(event: IDBVersionChangeEvent) {
        const db = (event.target as unknown as { result: IDBDatabase }).result;

        for (const key of this.keys()) {
            const model = this.collection[key];
            if (!db.objectStoreNames.contains(model.name))
                db.createObjectStore(model.name, {
                    // We are using our implementation of autoIncrement instead
                    autoIncrement: false,
                    keyPath: model.primaryKey,
                });
        }
    }

    toKeys() {
        return Array.from(this.keys());
    }
}

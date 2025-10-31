import type { CollectionObject, CompiledDb } from "../builder";
import type { Arrayable, Dict, Keyof, ValidKey } from "../util-types";
import type { ModelType, PrimaryKeyType } from "../model/model-types.ts";
import { getKeys, handleRequest, toArray, unionSets } from "../utils";
import { Transaction, type TransactionOptions } from "../transaction";
import {
    type InterfaceMap,
    type AddMutation,
    type StoreInterface,
    type MutationState,
    type QueryState,
    type UpdateMutation,
    type KeyObject,
} from "./types";
import type { FindInput, FindOutput } from "./types/find.ts";
import {
    generateSelector,
    generateWhereClause,
    getAccessedStores,
    getSearchableQuery,
    promiseCatch,
} from "./helpers.js";
import { CompiledQuery } from "./compiled-query.js";
import { Mutation, MutationActions } from "./types/mutation.js";
import {
    DocumentNotFoundError,
    InvalidItemError,
    UnknownError,
    UpdateError,
} from "../error.js";
import { FieldTypes } from "../field/field-types.js";
import { deleteItems } from "./delete.js";

export class DbClient<
    Name extends string,
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>
> {
    public readonly name: Name;
    public readonly version: number;
    public readonly stores: InterfaceMap<ModelNames, Models>;
    constructor(
        private readonly db: IDBDatabase,
        private readonly models: CompiledDb<Name, ModelNames, Models>
    ) {
        this.name = this.db.name as Name;
        this.version = this.db.version;
        this.stores = {} as InterfaceMap<ModelNames, Models>;
        for (const key of this.models.keys()) {
            this.stores[key] = this.createInterface(key);
        }
    }

    getStore<Name extends ModelNames>(name: Name): (typeof this.stores)[Name] {
        return this.stores[name];
    }

    createTransaction<
        Mode extends IDBTransactionMode,
        Names extends ModelNames
    >(mode: Mode, stores: Arrayable<Names>, options?: TransactionOptions) {
        return new Transaction(this.db, stores, mode, options);
    }

    async deleteDb() {
        await handleRequest(window.indexedDB.deleteDatabase(this.name));
    }

    deleteAllStores() {
        for (const store of this.models.keys()) {
            this.db.deleteObjectStore(store);
        }
    }
    deleteStore(storeNames: Arrayable<ModelNames>) {
        if (!Array.isArray(storeNames)) {
            storeNames = [storeNames];
        }
        for (const store of storeNames) {
            this.db.deleteObjectStore(store);
        }
    }

    public getModel<N extends ModelNames>(name: N) {
        return this.models.getModel(name);
    }

    private getAccessedStores(
        name: ModelNames,
        item: Dict,
        type: "mutation" | "query" = "mutation"
    ): ModelNames[] {
        return Array.from(getAccessedStores(name, item, type, this));
    }

    private createInterface<N extends ModelNames>(
        modelName: N
    ): StoreInterface<N, ModelNames, Models> {
        return {
            add: async (mutation, tx) =>
                await this.add(modelName, mutation, { tx }),
            addMany: async (mutations, tx) => {
                if (!tx) {
                    const stores = new Set<ModelNames>();
                    for (const mut of mutations) {
                        unionSets(
                            stores,
                            getAccessedStores(modelName, mut, "mutation", this)
                        );
                    }
                    tx = this.createTransaction(
                        "readwrite",
                        Array.from(stores)
                    );
                }
                type T = PrimaryKeyType<Models[N]>;
                const result: T[] = [];
                let promise: Promise<T> | undefined = undefined;
                for (const mut of mutations) {
                    promise = this.add(modelName, mut, { tx });
                    promise
                        .then((value) => result.push(value))
                        .catch(promiseCatch(tx));
                }
                if (promise) {
                    await promise;
                }
                return result;
            },
            clear: async (tx) => await this.clear(modelName, { tx }),
            findFirst: async (query, tx) =>
                (await this.find(modelName, query, true, { tx }))[0],
            find: async (query, tx) =>
                await this.find(modelName, query, false, { tx }),
            put: async () => {},
            get: async (key) => {
                const tx = this.createTransaction("readonly", modelName);
                return await tx.getStore(modelName).get(key);
            },
            insert: async (_mutation, _tx) => {
                await new Promise<void>((res) => res());
                return 5 as PrimaryKeyType<Models[N]>;
            },
            updateFirst: async (mutation, tx) =>
                (await this.update(modelName, mutation, true, { tx }))[0],
            updateMany: async (mutation, tx) =>
                await this.update(modelName, mutation, false, { tx }),
            compileQuery: (query) =>
                new CompiledQuery(this, modelName as ModelNames, query),

            delete: async (key) =>
                (await deleteItems(modelName, this, undefined, undefined, {
                    singleton: { id: key },
                })) > 0,
            deleteFirst: async (where) =>
                (await deleteItems(modelName, this, where, true)) > 0,
            deleteMany: async (where) =>
                await deleteItems(modelName, this, where, false),
        };
    }

    private async add<N extends ModelNames>(
        name: N,
        item: AddMutation<N, ModelNames, Models[N], Models>,
        _state: MutationState<ModelNames> = {}
    ) {
        // Local type declaration for ease of use
        type T = typeof item;
        let { tx } = _state;
        const { relation } = _state;
        const accessed = tx
            ? tx.storeNames
            : this.getAccessedStores(name, item, "mutation");
        tx = tx ?? new Transaction(this.db, accessed, "readwrite");

        // Quickly create the item just to get the id
        const objectStore = tx.getStore(name);
        const model = this.getModel(name);
        const primaryKey = model.getPrimaryKey();
        const relationAdd = relation
            ? {
                  [relation.key]: model.getRelation(relation.key)?.isArray
                      ? [relation.id]
                      : relation.id,
              }
            : {};
        const initAdd: Dict = primaryKey.isAutoIncremented()
            ? {
                  ...relationAdd,
              }
            : {
                  ...relationAdd,
                  [model.primaryKey]:
                      item[model.primaryKey as keyof T] ?? primaryKey.genKey(),
              };
        const id = await objectStore.add(initAdd);
        const toAdd: Dict = {};
        const visited = new Set<string>();
        for (const key of getKeys(item) as string[]) {
            visited.add(key);
            const element = item[
                key as Keyof<AddMutation<N, ModelNames, Models[N], Models>>
            ] as Dict;
            switch (model.keyType(key)) {
                case FieldTypes.Invalid:
                    throw tx.abort(
                        new InvalidItemError(
                            `Key '${key}' does ont exist on model '${name}'`
                        )
                    );
                case FieldTypes.Field: {
                    const parseResult = model.parseField(key, element);
                    if (!parseResult) throw tx.abort(new UnknownError());
                    if (!parseResult.success) {
                        throw tx.abort(
                            new InvalidItemError(
                                `Key '${key}' has the following validation error: ${parseResult.error}`
                            )
                        );
                    }
                    toAdd[key] = parseResult.data;
                    break;
                }
                case FieldTypes.Relation: {
                    // Skip over it if the key is not defined
                    if (!element) continue;
                    const value = toArray<Dict>(element);

                    // Get the relation object
                    const relation = model.getRelation<ModelNames>(key)!;
                    if (relation.isArray) {
                        toAdd[key] = [];
                        if (
                            "$createMany" in element ||
                            "$connectMany" in element
                        ) {
                            const newValue: Dict[] = [];
                            for (const item of (element as any)[
                                "$createMany"
                            ] ?? []) {
                                newValue.push({ $create: item });
                            }
                            for (const item of (element as any)[
                                "$connectMany"
                            ] ?? []) {
                                newValue.push({ $connect: item });
                            }
                            value.push(...newValue);
                        }
                    }

                    // Get the model object of the model the relation is pointing to
                    const otherModel = this.getModel(relation.to);
                    const otherRelation = otherModel.getRelation(
                        relation.getRelatedKey()
                    );
                    const otherStore = tx.getStore(relation.to);

                    // Set of all connection keys
                    const usedKeys = new Set<ValidKey>();

                    // TODO: Optimize with batch editing with cursor
                    for (const item of value) {
                        const firstKey = getKeys(item)[0];
                        if (!firstKey)
                            throw tx.abort(
                                new InvalidItemError(
                                    `Key '${key}' cannot be an empty connection object`
                                )
                            );

                        switch (firstKey) {
                            case "$connect": {
                                // Modify item so that it references the new item
                                const connectId: ValidKey = item[
                                    firstKey
                                ] as string;

                                // Disallow duplicate connections
                                if (usedKeys.has(connectId)) {
                                    throw tx.abort(
                                        new InvalidItemError(
                                            `Primary key '${connectId}' was already used for a connection`
                                        )
                                    );
                                }
                                usedKeys.add(connectId);

                                const current = (await otherStore.get(
                                    connectId
                                )) as Dict<Arrayable<unknown>>;
                                if (!current)
                                    throw tx.abort(
                                        new DocumentNotFoundError(
                                            `Document with Primary Key '${connectId}' could not be found in model '${relation.to}'`
                                        )
                                    );

                                if (!otherRelation)
                                    throw tx.abort(
                                        new InvalidItemError(
                                            `Could not find corresponding relation '${relation.name}'`
                                        )
                                    );
                                if (otherRelation.isArray) {
                                    (
                                        current[
                                            relation.getRelatedKey()
                                        ] as unknown[]
                                    ).push(id);
                                } else {
                                    const relatedKey = relation.getRelatedKey();
                                    if (current[relatedKey]) {
                                        // TODO: Handle updating relation if it already exists
                                    }
                                    current[relatedKey] = id;
                                }

                                // We don't have to await because tx events are processed in order
                                otherStore.put(current).catch(promiseCatch(tx));

                                if (relation.isArray) {
                                    (toAdd[key] as ValidKey[]).push(connectId);
                                } else {
                                    toAdd[key] = connectId;
                                }
                                break;
                            }
                            case "$create": {
                                // Create the new item and have it reference this one
                                const newId = await this.add(
                                    relation.to,
                                    item[firstKey] as AddMutation<
                                        ModelNames,
                                        ModelNames,
                                        Models[ModelNames],
                                        Models
                                    >,
                                    {
                                        tx,
                                        relation: {
                                            id,
                                            key: relation.getRelatedKey(),
                                        },
                                    }
                                );
                                if (relation.isArray) {
                                    (toAdd[key] as ValidKey[]).push(newId);
                                } else {
                                    toAdd[key] = newId;
                                }
                                break;
                            }

                            // These keys were converted into "$create" and "$connect"
                            case "$connectMany":
                            case "$createMany":
                                break;
                            default:
                                throw tx.abort(
                                    new InvalidItemError(
                                        `Connection Object on key '${key}' has an unknown key '${firstKey}'`
                                    )
                                );
                        }
                        // If it's not a relation array stop after the first key
                        if (!relation.isArray) break;
                    }
                    break;
                }
                // The primary key was already added
                case FieldTypes.PrimaryKey:
                default:
                    break;
            }
        }

        const unused = Array.from(new Set(model.keys()).difference(visited));
        for (const unusedField of unused) {
            switch (model.keyType(unusedField)) {
                case FieldTypes.Field: {
                    const parseResult = model.parseField(
                        unusedField,
                        undefined
                    );
                    if (!parseResult) throw tx.abort(new UnknownError());
                    if (!parseResult.success)
                        throw tx.abort(
                            new InvalidItemError(
                                `Key '${unusedField}' is missing`
                            )
                        );
                    toAdd[unusedField] = parseResult.data;
                    break;
                }
                case FieldTypes.Relation: {
                    const field = model.getRelation(unusedField)!;
                    const established = relationAdd[unusedField];
                    if (field.isArray) {
                        toAdd[unusedField] = established ?? [];
                    } else if (field.isOptional) {
                        toAdd[unusedField] = established ?? null;
                    } else if (!established)
                        throw tx.abort(
                            new InvalidItemError(
                                `Required relation '${unusedField}' is not defined`
                            )
                        );
                    else {
                        toAdd[unusedField] = established;
                    }

                    break;
                }
                // This should never happen
                case FieldTypes.Invalid:
                case FieldTypes.PrimaryKey:
                default:
                    break;
            }
        }

        return (await objectStore.put({
            [model.primaryKey]: id,
            ...toAdd,
        })) as PrimaryKeyType<Models[N]>;
    }

    private async clear(name: ModelNames, _state?: MutationState<ModelNames>) {
        await deleteItems(name, this, undefined, false, _state);
    }

    /**
     * Finds documents from the store that match the filter
     * @param name Name of the store
     * @param item Object containing the filter and the selection query
     * @param stopOnFirst Flag to stop after one successful find
     * @param _state Optional state for mutli-stage actions
     * @returns Transformed selection item
     */
    private async find<
        N extends ModelNames,
        Q extends FindInput<ModelNames, Models[N], Models> = FindInput<
            ModelNames,
            Models[N],
            Models
        >,
        O = FindOutput<ModelNames, Models[N], Models, Q>
    >(
        name: N,
        item: Q,
        stopOnFirst: boolean,
        _state: QueryState<ModelNames> = {}
    ): Promise<O[]> {
        let { tx } = _state;
        const accessed = tx
            ? tx.storeNames
            : this.getAccessedStores(name, getSearchableQuery(item), "query");
        tx = tx ?? new Transaction(this.db, accessed, "readonly");
        const result: O[] = [];
        const initStore = tx.getStore(name);

        const selectClause = generateSelector<ModelNames, Models, this>(
            name,
            this,
            item,
            tx
        );

        await initStore.openCursor(async (cursor) => {
            const selection = await selectClause(cursor.value as Dict, tx);

            if (selection) {
                result.push(selection as O);
            }

            // Stop early and return if it's just finding the first one
            if (stopOnFirst && result.length) {
                return false;
            }
            cursor.continue();
            return true;
        });

        return result;
    }

    private async update<N extends ModelNames>(
        name: N,
        item: UpdateMutation<N, ModelNames, Models[N], Models>,
        stopOnFirst: boolean,
        _state: MutationState<ModelNames> = {}
    ): Promise<PrimaryKeyType<Models[N]>[]> {
        // Setup
        type U = typeof item;
        type T = U["data"];
        let { tx } = _state;
        const { singleton = false } = _state;
        const accessed = tx
            ? tx.storeNames
            : this.getAccessedStores(name, item.data, "mutation");
        tx = tx ?? new Transaction(this.db, accessed, "readwrite");
        const result: PrimaryKeyType<Models[N]>[] = [];
        const initStore = tx.getStore(name);
        const model = this.getModel(name);

        const { where, data } = item;
        const keyObjs: KeyObject<keyof T>[] = [];
        for (const key of getKeys(data)) {
            switch (model.keyType(key as string)) {
                case FieldTypes.Field:
                    keyObjs.push({
                        key: key,
                        isFun: typeof data[key] === "function",
                        isRelation: false,
                    });
                    break;
                case FieldTypes.Relation:
                    // TODO: unfurl key to reduce (connect|create|update|delete|disconnect)Many to just be the singleton in an array
                    keyObjs.push({
                        key: key,
                        isFun: false,
                        isRelation: true,
                        relation: model.getRelation(key as string)!,
                    });
                    break;
                case FieldTypes.PrimaryKey:
                    throw tx.abort(
                        new UpdateError("Primary key field cannot be updated")
                    );
                case FieldTypes.Invalid:
                default:
                    throw tx.abort(
                        new UnknownError(`Unknown key '${key as string}'`)
                    );
            }
        }
        const whereClause = generateWhereClause(where);

        const getData = async (value: T) => {
            if (where && !whereClause(value)) return false;

            for (const { key, isRelation, isFun, relation } of keyObjs) {
                // If it's just a normal field
                if (!isRelation) {
                    value[key] = isFun
                        ? ((data[key] as (arg1: unknown) => unknown)(
                              value[key]
                          ) as any)
                        : data[key];
                    continue;
                }

                const relationValue = toArray<Dict>(data[key] as Dict);
                for (const item of relationValue) {
                    for (const firstKey in item) {
                        if (!Object.hasOwn(item, key)) continue;
                        const element = item[key] as any;
                        switch (firstKey as MutationActions) {
                            // TODO: If a relation is getting disconnected from this or $create, ensure it is an optional or array relation on the other model
                            case "$connect": {
                                break;
                            }
                            case "$create": {
                                break;
                            }
                            case "$update": {
                                if (relation.isArray) {
                                    await this.update(
                                        relation.to,
                                        element as U,
                                        true,
                                        { tx }
                                    );
                                } else if (value[key]) {
                                    await this.updateSingleton(
                                        relation.to,
                                        value[key],
                                        element as Mutation<
                                            any,
                                            ModelNames,
                                            Models[any],
                                            Models,
                                            "update"
                                        >,
                                        { tx }
                                    );
                                }
                                break;
                            }
                            case "$updateMany":
                                break;
                            case "$delete":
                                break;
                            case "$disconnect":
                                break;
                            // These keys were converted into their singleton versions
                            case "$connectMany":
                            case "$createMany":
                            case "$deleteMany":
                            case "$disconnectMany":
                            case "$disconnectAll":
                            case "$deleteAll":
                                throw tx.abort(
                                    new InvalidItemError(
                                        `Connection Object on key '${
                                            key as string
                                        }' has an unknown key '${firstKey}'`
                                    )
                                );
                        }

                        break;
                    }
                }
            }
        };

        if (!singleton) {
            await initStore.openCursor(async (cursor) => {
                await getData(cursor.value as T);

                // Stop early and return if it's just finding the first one
                if (stopOnFirst && result.length) {
                    return false;
                }
                cursor.continue();
                return true;
            });
        } else {
            await getData((await initStore.get(singleton.id)) as T);
        }

        return result;
    }

    private async updateSingleton<
        N extends ModelNames,
        KeyType = PrimaryKeyType<Models[N]>
    >(
        name: N,
        key: KeyType,
        item: Mutation<N, ModelNames, Models[N], Models, "update">,
        _state: MutationState<ModelNames>
    ): Promise<ModelType<Models[N], typeof this.models>> {
        let { tx } = _state;
        const accessed = tx
            ? tx.storeNames
            : this.getAccessedStores(name, item, "mutation");
        tx = tx ?? new Transaction(this.db, accessed, "readwrite");
        const initStore = tx.getStore(name);
        const model = this.getModel(name);
        const currentItem = await initStore.get(key as ValidKey);
        if (!currentItem) {
            throw tx.abort(
                new DocumentNotFoundError(
                    `No document with key '${key}' could be found in store '${model.name}'`
                )
            );
        }

        // TODO: Loop over the fields and update any fields and/or relation values

        return currentItem as ModelType<Models[N], typeof this.models>;
    }
}

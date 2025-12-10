import type { CompiledDb } from "../builder";
import type { Arrayable, Dict, Keyof } from "../util-types";
import type { CollectionObject, ExtractFields, PrimaryKeyType } from "../model";
import { getKeys, handleRequest, toArray, unionSets } from "../utils";
import { Transaction, type TransactionOptions } from "../transaction";
import {
    type InterfaceMap,
    type AddMutation,
    type StoreInterface,
    type MutationState,
    type QueryState,
    UpdateMutation,
    KeyObject,
    ActionItem,
    GetStructure,
    ExportFormat,
} from "./types";
import type { FindInput, FindOutput, WhereObject } from "./types/find.ts";
import {
    generateSelector,
    generateWhereClause,
    getAccessedStores,
    getSearchableQuery,
    parseWhere,
} from "./helpers.js";
import { CompiledQuery } from "./compiled-query.js";
import {
    DocumentNotFoundError,
    InvalidItemError,
    OverwriteRelationError,
    UnknownError,
    UpdateError,
} from "../error.js";
import { deleteItems } from "./delete.js";
import { MutationAction } from "./types/mutation.js";
import { BaseRelation, ValidKey, FieldTypes } from "../field";
import { Dump, DumpOptions, getDatabaseData, getStoreData } from "./dump";

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

    getDb() {
        return this.db;
    }

    getStore<Name extends ModelNames>(name: Name): (typeof this.stores)[Name] {
        return this.stores[name];
    }

    getStoreNames() {
        return this.models.keys();
    }

    createTransaction<
        Mode extends IDBTransactionMode,
        Names extends ModelNames
    >(mode: Mode, stores: Arrayable<Names>, options?: TransactionOptions) {
        return new Transaction(this.db, stores, mode, options);
    }

    async drop() {
        await handleRequest(window.indexedDB.deleteDatabase(this.name));
    }

    async dump<const Format extends ExportFormat>(
        format: Format,
        stores?: ModelNames[],
        options?: DumpOptions
    ): Promise<Dump<Format>> {
        const data = await getDatabaseData(this, stores);
        switch (format) {
            case "json":
                return Dump.toJson(this.name, data, options) as Dump<Format>;
            case "csv":
                return Dump.toCsvDb(
                    this as unknown as DbClient<
                        string,
                        string,
                        CollectionObject<string>
                    >,
                    stores || this.getStoreNames(),
                    data
                ) as Dump<Format>;
        }
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
        isMutation: boolean,
        tx?: Transaction<IDBTransactionMode, ModelNames>
    ): ModelNames[] {
        if (tx) {
            return tx.storeNames;
        }
        return Array.from(getAccessedStores(name, item, isMutation, this));
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
                            getAccessedStores(modelName, mut, true, this)
                        );
                    }
                    tx = this.createTransaction(
                        "readwrite",
                        Array.from(stores)
                    );
                }
                type T = PrimaryKeyType<Models[N]>;
                const result: T[] = [];
                for (const mut of mutations) {
                    result.push(await this.add(modelName, mut, { tx }));
                }
                return result;
            },
            findFirst: async (query, tx) =>
                (await this.find(modelName, query, true, { tx }))[0],
            find: async (query, tx) =>
                await this.find(modelName, query, false, { tx }),
            get: async (key) => {
                const tx = this.createTransaction("readonly", modelName);
                return (await tx.getStore(modelName).get(key)) as GetStructure<
                    N,
                    Models
                >;
            },
            update: async (key, data) => {
                return (
                    await this.update(modelName, { data }, true, {
                        singleton: { id: key },
                    })
                )[0];
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
            dump: async (format, where, options?: DumpOptions) => {
                type Result = Dump<typeof format>;
                const data = await getStoreData(
                    // eslint-disable-next-line
                    this as any,
                    modelName,
                    where as undefined
                );
                switch (format) {
                    case "json":
                        return Dump.toJson(modelName, data, options) as Result;
                    case "csv":
                        return Dump.toCsvStore(
                            this.getModel(modelName),
                            data
                        ) as Result;
                }
            },
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
        const accessed = this.getAccessedStores(name, item, true, tx);
        tx = Transaction.create(this.db, accessed, "readwrite", tx);

        return await tx.wrap(async (tx) => {
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
                          item[model.primaryKey as keyof T] ??
                          primaryKey.genKey(),
                  };
            const id = await objectStore.add(initAdd);
            const toAdd: Dict = {};
            const visited = new Set<string>();
            for (const key in item) {
                visited.add(key);
                const element = item[
                    key as Keyof<AddMutation<N, ModelNames, Models[N], Models>>
                ] as Dict;
                switch (model.keyType(key)) {
                    case FieldTypes.Invalid:
                        throw new InvalidItemError(
                            `Key '${key}' does ont exist on model '${name}'`
                        );

                    case FieldTypes.Property: {
                        const parseResult = model.parseField(key, element);
                        if (!parseResult) throw new UnknownError();
                        if (!parseResult.success) {
                            throw new InvalidItemError(
                                `Key '${key}' has the following validation error: ${parseResult.error}`
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
                        const otherRelation =
                            otherModel.getRelation<ModelNames>(
                                relation.getRelatedKey()
                            );

                        // Set of all connection keys
                        const usedKeys = new Set<ValidKey>();

                        for (const item of value) {
                            const firstKey = getKeys(item)[0];
                            if (!firstKey)
                                throw new InvalidItemError(
                                    `Key '${key}' cannot be an empty connection object`
                                );

                            switch (firstKey) {
                                case "$connect": {
                                    // Modify item so that it references the new item
                                    const connectId: ValidKey = item[
                                        firstKey
                                    ] as string;

                                    // Disallow duplicate connections
                                    if (usedKeys.has(connectId)) {
                                        throw new InvalidItemError(
                                            `Primary key '${connectId}' was already used for a connection`
                                        );
                                    }
                                    usedKeys.add(connectId);

                                    if (!otherRelation)
                                        throw new InvalidItemError(
                                            `Could not find corresponding relation '${relation.name}'`
                                        );

                                    await this.connectDocument(
                                        relation,
                                        id,
                                        connectId,
                                        tx
                                    );

                                    if (relation.isArray) {
                                        (toAdd[key] as ValidKey[]).push(
                                            connectId
                                        );
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
                                    throw new InvalidItemError(
                                        `Connection Object on key '${key}' has an unknown key '${firstKey}'`
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

            const unused = Array.from(
                new Set(model.keys()).difference(visited)
            );
            for (const unusedField of unused) {
                switch (model.keyType(unusedField)) {
                    case FieldTypes.Property: {
                        const parseResult = model.parseField(
                            unusedField,
                            undefined
                        );
                        if (!parseResult)
                            throw new UnknownError("A parsing error occurred");
                        if (!parseResult.success)
                            throw new InvalidItemError(
                                `Key '${unusedField}' is missing`
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
                            throw new InvalidItemError(
                                `Required relation '${unusedField}' is not defined`
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
        });
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
        const accessed = this.getAccessedStores(
            name,
            getSearchableQuery(item),
            false,
            tx
        );
        tx = Transaction.create(this.db, accessed, "readonly", tx);
        const result: O[] = [];

        return await tx.wrap(async (tx) => {
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
        });
    }

    private async update<
        N extends ModelNames,
        U extends UpdateMutation<N, ModelNames, Models[N], Models>
    >(
        name: N,
        item: U,
        stopOnFirst: boolean,
        _state: MutationState<ModelNames> = {}
    ): Promise<GetStructure<N, Models>[]> {
        type T = U["data"];
        const { singleton } = _state;
        const updateData = _state.singleton ? item : item.data;
        const accessed = this.getAccessedStores(
            name,
            updateData,
            true,
            _state.tx
        );
        const tx = Transaction.create(
            this.db,
            accessed,
            "readwrite",
            _state.tx
        );

        return await tx.wrap(async (tx) => {
            const store = tx.getStore(name);
            const model = this.getModel(name);

            const keyObjs: KeyObject<keyof T>[] = [];
            for (const key of getKeys(updateData)) {
                switch (model.keyType(key as string)) {
                    case FieldTypes.Property:
                        keyObjs.push({
                            key: key,
                            isRelation: false,
                            updateFn: (typeof updateData[key] === "function"
                                ? updateData[key]
                                : () => updateData[key]) as <T>() => T,
                        });
                        break;
                    case FieldTypes.Relation: {
                        const element = toArray(
                            updateData[key] as Arrayable<
                                Record<MutationAction, unknown[]>
                            >
                        );
                        if (!element) continue;

                        const actions: ActionItem[] = [];

                        for (const elementItem of element) {
                            for (const elementKey in elementItem) {
                                switch (elementKey) {
                                    case "$createMany":
                                    case "$connectMany":
                                    case "$updateMany":
                                    case "$deleteMany":
                                    case "$disconnectMany": {
                                        // Strip the -Many from the name
                                        const singletonName =
                                            elementKey.substring(
                                                0,
                                                elementKey.length - 4
                                            ) as MutationAction;
                                        for (const item of elementItem[
                                            elementKey
                                        ]) {
                                            actions.push([singletonName, item]);
                                        }
                                        break;
                                    }
                                    default:
                                        actions.push([
                                            elementKey as MutationAction,
                                            elementItem[
                                                elementKey as MutationAction
                                            ],
                                        ]);
                                        break;
                                }
                                break;
                            }
                        }

                        keyObjs.push({
                            actions,
                            key: key,
                            isRelation: true,
                            relation: model.getRelation(key as string)!,
                        });
                        break;
                    }
                    case FieldTypes.PrimaryKey:
                        throw new UpdateError(
                            "Primary key field cannot be updated"
                        );

                    case FieldTypes.Invalid:
                    default:
                        throw new UnknownError(
                            `Unknown key '${key as string}'`
                        );
                }
            }
            const results: GetStructure<N, Models>[] = [];
            const updateDocument = async (
                value: any
            ): Promise<GetStructure<N, Models>> => {
                const thisId: ValidKey = value[model.primaryKey as keyof T];
                for (const { key, ...obj } of keyObjs) {
                    const relation = obj.relation as BaseRelation<
                        ModelNames,
                        string
                    >;
                    if (obj.isRelation) {
                        for (const [action, payload] of obj.actions) {
                            switch (action) {
                                case "$connect": {
                                    // payload is the id of the other object
                                    if (value[key] && !relation.isArray) {
                                        await this.disconnectDocument(
                                            relation,
                                            thisId,
                                            value[key] as ValidKey,
                                            tx
                                        ).catch(tx.onRejection);
                                    }

                                    await this.connectDocument(
                                        relation,
                                        thisId,
                                        payload as ValidKey,
                                        tx
                                    ).catch(tx.onRejection);
                                    if (relation.isArray) {
                                        (value[key] as unknown[]).push(payload);
                                    } else {
                                        value[key] = payload as ValidKey;
                                    }
                                    break;
                                }
                                case "$create": {
                                    // payload is the creation object
                                    const newId = await this.add(
                                        relation.to,
                                        payload as AddMutation<
                                            ModelNames,
                                            ModelNames,
                                            Models[ModelNames],
                                            Models
                                        >,
                                        {
                                            tx,
                                            relation: {
                                                id: thisId,
                                                key: relation.getRelatedKey(),
                                            },
                                        }
                                    );
                                    if (relation.isArray) {
                                        (value[key] as ValidKey[]).push(newId);
                                    } else {
                                        value[key] = newId;
                                    }
                                    break;
                                }
                                case "$delete":
                                    if (!relation.isNullable()) {
                                        throw new InvalidItemError(
                                            "Item cannot be deleted, relation is required"
                                        );
                                    }
                                    // payload is the id of the other object
                                    value[key] =
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                            ? value[key].filter(
                                                  (v) =>
                                                      v !==
                                                      (payload as ValidKey)
                                              )
                                            : null;
                                    await deleteItems(
                                        relation.to,
                                        this,
                                        {},
                                        true,
                                        {
                                            tx,
                                            singleton: {
                                                id: payload as ValidKey,
                                            },
                                        }
                                    );

                                    break;
                                case "$disconnect": {
                                    // payload is the id of the other object

                                    if (!relation.isNullable()) {
                                        throw new InvalidItemError(
                                            "Item cannot be disconnected, relation is required"
                                        );
                                    } else if (
                                        !value[key] ||
                                        value[key]?.lenth === 0
                                    ) {
                                        break;
                                    }

                                    const otherRelation = this.getModel(
                                        relation.to
                                    ).getRelation(relation.getRelatedKey())!;

                                    await this.disconnectDocument(
                                        relation,
                                        thisId,
                                        (otherRelation.isArray
                                            ? payload
                                            : value[key]) as ValidKey,
                                        tx
                                    ).catch(tx.onRejection);

                                    value[key] =
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                            ? value[key].filter(
                                                  (v) => v !== payload
                                              )
                                            : null;
                                    break;
                                }
                                case "$update": {
                                    // payload is the update object (no where clause) for that store

                                    if (relation.isArray) {
                                        // If the relationship on this end is an array, payload is a full UpdateMutation
                                        await this.update(
                                            relation.to,
                                            payload as UpdateMutation<
                                                ModelNames,
                                                ModelNames,
                                                Models[ModelNames],
                                                Models
                                            >,
                                            false,
                                            { tx }
                                        );
                                    } else if (value[key] != null) {
                                        // Otherwise, make the sure the relation is actually there
                                        await this.update(
                                            relation.to,
                                            payload as UpdateMutation<
                                                ModelNames,
                                                ModelNames,
                                                Models[ModelNames],
                                                Models
                                            >,
                                            false,
                                            {
                                                tx,
                                                singleton: {
                                                    id: thisId,
                                                },
                                            }
                                        );
                                    }

                                    break;
                                }
                                case "$deleteAll":
                                    // payload should be truthy
                                    if (
                                        payload &&
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                    ) {
                                        const otherModel = this.getModel(
                                            relation.to
                                        );
                                        const idSet = new Set(
                                            value[key] as ValidKey[]
                                        );
                                        await deleteItems(
                                            relation.to,
                                            this,
                                            {
                                                [otherModel.primaryKey]: (
                                                    value: ValidKey
                                                ) => idSet.has(value),
                                            } as WhereObject<
                                                ExtractFields<
                                                    Models[ModelNames]
                                                >
                                            >,
                                            false,
                                            { tx }
                                        );
                                        value[key] = [];
                                    }
                                    break;
                                case "$disconnectAll":
                                    // payload should be truthy
                                    if (
                                        payload &&
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                    ) {
                                        for (const item of value[
                                            key
                                        ] as ValidKey[]) {
                                            await this.disconnectDocument(
                                                relation,
                                                thisId,
                                                item,
                                                tx
                                            );
                                        }
                                        value[key] = [];
                                    }
                                    break;
                                default:
                                    break;
                            }
                        }
                    } else {
                        value[key] = obj.updateFn(value[key]);
                    }
                }
                return value as GetStructure<N, Models>;
            };

            if (singleton) {
                const getResult = await store.get(singleton.id);
                if (!getResult) {
                    throw new DocumentNotFoundError(
                        `${model.name} with priamry key '${singleton.id}' not found`
                    );
                }
                const updateResult = await updateDocument(getResult).catch(
                    tx.onRejection
                );
                await store.put(updateResult);
                return [updateResult];
            } else {
                const where = generateWhereClause(item.where);
                await store.openCursor(async (cursor) => {
                    const value = cursor.value;
                    if (parseWhere(where, value)) {
                        const newValue = await updateDocument(value).catch(
                            tx.onRejection
                        );
                        await handleRequest(
                            cursor.update(newValue) as IDBRequest<ValidKey>
                        )
                            .then(() => results.push(newValue))
                            .catch(tx.onRejection);

                        if (stopOnFirst) {
                            return false;
                        }
                    }
                    cursor.continue();
                    return true;
                });
                return results;
            }
        });
    }

    /**
     * Connects a document to another
     *
     * **This must be called within a wrapped environment**
     * @param relation Relation object
     * @param thisId Id of the source document
     * @param documentId If of the target document
     * @param tx Transaction this function is wrapped in
     * @returns Id of the target document
     */
    private async connectDocument(
        relation: BaseRelation<ModelNames, string>,
        thisId: ValidKey,
        documentId: ValidKey,
        tx: Transaction<"readwrite", ModelNames>
    ) {
        const store = tx.getStore(relation.to);
        const current = (await store.get(documentId)) as Dict<
            Arrayable<unknown>
        >;
        if (!current) {
            throw new DocumentNotFoundError(
                `Document with Primary Key '${documentId}' could not be found in model '${relation.to}'`
            );
        }
        const relatedKey = relation.getRelatedKey();
        const otherRelation = this.getModel(relation.to).getRelation(
            relatedKey
        )!;

        const value = current[relatedKey];
        if (otherRelation.isArray && Array.isArray(value)) {
            if (!value.includes(thisId)) value.push(thisId);
        } else {
            if (value) {
                throw new OverwriteRelationError();
            }
            current[relatedKey] = thisId;
        }

        await store.put(current).catch(tx.onRejection);
        return documentId;
    }

    /**
     * Disconnects a document from another
     *
     * **This must be called within a wrapped environment**
     * @param relation Relation object
     * @param thisId Id of the source document
     * @param documentId If of the target document
     * @param tx Transaction this function is wrapped in
     * @returns Id of the target document
     */
    private async disconnectDocument(
        relation: BaseRelation<ModelNames, string>,
        thisId: ValidKey,
        documentId: ValidKey,
        tx: Transaction<"readwrite", ModelNames>
    ) {
        const store = tx.getStore(relation.to);
        const current = (await store.get(documentId)) as Dict<
            Arrayable<unknown>
        >;
        if (!current) {
            throw new DocumentNotFoundError(
                `Document with Primary Key '${documentId}' could not be found in model '${relation.to}'`
            );
        }

        const otherRelation = this.getModel(relation.to).getRelation(
            relation.getRelatedKey()
        )!;

        if (otherRelation.isArray) {
            (current[relation.getRelatedKey()] as unknown[]).filter(
                (u) => u !== thisId
            );
        } else if (otherRelation.isOptional) {
            current[relation.getRelatedKey()] = null;
        } else {
            throw new OverwriteRelationError();
        }

        await store.put(current).catch(tx.onRejection);
        return documentId;
    }
}

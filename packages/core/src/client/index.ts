import type { CompiledDb } from "../builder";
import type { Arrayable, Dict, PartialRecord } from "../util-types";
import type { CollectionObject, ExtractFields, PrimaryKeyType } from "../model";
import { firstKey, getKeys, handleRequest, toArray, unionSets } from "../utils";
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
import type { FindInput, FindOutput, WhereObject } from "./types/find";
import {
    generateSelector,
    generateWhereClause,
    getAccessedStores,
    getSearchableQuery,
    parseWhere,
} from "./helpers";
import { CompiledQuery } from "./compiled-query";
import {
    DocumentNotFoundError,
    InvalidItemError,
    ObjectStoreNotFoundError,
    OverwriteRelationError,
    UnknownError,
    UpdateError,
} from "../error";
import { deleteItems } from "./delete.js";
import { MutationAction } from "./types/mutation.js";
import {
    BaseRelation,
    ValidKey,
    FieldTypes,
    PrimaryKey,
    stripUnknownProperties,
} from "../field";
import { Dump, DumpOptions, getDatabaseData, getStoreData } from "./dump";

export class DbClient<
    Name extends string,
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>,
> {
    readonly name: Name;
    readonly version: number;
    readonly stores: InterfaceMap<ModelNames, Models>;

    constructor(
        /**
         * Internal `IDBDatabase` object.
         *
         * @see https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase
         */
        readonly IDB: IDBDatabase,
        private readonly models: CompiledDb<Name, ModelNames, Models>,
    ) {
        this.name = this.IDB.name as Name;
        this.version = this.IDB.version;
        this.stores = {} as InterfaceMap<ModelNames, Models>;
        for (const key of this.models.keys()) {
            this.stores[key] = this.createInterface(key);
        }
    }

    private async add<N extends ModelNames>(
        name: N,
        item: AddMutation<N, ModelNames, Models[N], Models>,
        _state: MutationState<ModelNames> = {},
    ) {
        // Local type declaration for ease of use
        type T = typeof item;
        const { relation } = _state;
        const accessed = this.getAccessedStores(name, item, true, _state.tx);
        const tx = Transaction.create(
            this.IDB,
            accessed,
            "readwrite",
            _state.tx,
        );

        return await tx.wrap(async (tx) => {
            // Quickly create the item just to get the id
            const objectStore = tx.getStore(name);
            const model = this.getModel(name);
            if (!model.isValid(item)) {
                throw new InvalidItemError(
                    `Item is not a valid instance of '${model.name}'.`,
                );
            }
            const stripped = model.instantiateDefaults(
                stripUnknownProperties(model.baseSchema, item),
            );
            const id: ValidKey =
                item[model.primaryKey as keyof T] ??
                model.genPrimaryKey(stripped);
            const toAdd: Dict = { [model.primaryKey]: id, ...stripped };
            if (relation) {
                toAdd[relation.key] = model.getRelation(relation.key)?.isArray
                    ? [relation.id]
                    : relation.id;
            }

            for (const [key, relation] of model.relationsFor<ModelNames>(
                stripped,
            )) {
                const field = (item as Dict<Dict<any[]>>)[key];
                const value = toArray<Dict>(field);
                if (!field) {
                    if (relation.isArray) {
                        toAdd[key] ??= [];
                    } else if (relation.isOptional) {
                        toAdd[key] ??= null;
                    } else if (!toAdd[key]) {
                        throw new InvalidItemError(
                            `Required relation '${key}' on new document of model '${model.name}' is not defined`,
                        );
                    }
                } else {
                    if (relation.isArray) {
                        toAdd[key] = [];
                        if (
                            Object.hasOwn(field, "$createMany") ||
                            Object.hasOwn(field, "$connectMany")
                        ) {
                            const newValue: PartialRecord<
                                "$connect" | "$create",
                                any
                            >[] = [];
                            for (const item of field["$createMany"] ?? []) {
                                newValue.push({ $create: item });
                            }
                            for (const item of field["$connectMany"] ?? []) {
                                newValue.push({ $connect: item });
                            }

                            value.push(...newValue);
                        }
                    }

                    const usedKeys: ValidKey[] = [];
                    for (const item of value) {
                        const first = firstKey(item);
                        if (!first) {
                            throw new InvalidItemError(
                                `Key '${key}' cannot be an empty connection object`,
                            );
                        }
                        switch (first) {
                            case "$connect": {
                                // Modify item so that it references the new item
                                const connectId = item[first] as ValidKey;

                                // Disallow duplicate connections
                                if (PrimaryKey.inKeyList(usedKeys, connectId)) {
                                    throw new InvalidItemError(
                                        `Primary key '${connectId}' was already used for a connection`,
                                    );
                                }
                                usedKeys.push(connectId);

                                await this.connectDocument(
                                    relation,
                                    id,
                                    connectId,
                                    tx,
                                );

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
                                    item[first] as AddMutation<
                                        ModelNames,
                                        ModelNames,
                                        Models[ModelNames],
                                        Models
                                    >,
                                    {
                                        tx,
                                        relation: relation.isBidirectional
                                            ? {
                                                  id,
                                                  key: relation.relatedKey,
                                              }
                                            : undefined,
                                    },
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
                                    `Connection Object on key '${key}' has an unknown key '${first}'`,
                                );
                        }
                    }
                }
            }
            return await objectStore.add(toAdd);
        });
    }

    private async clear(name: ModelNames, _state?: MutationState<ModelNames>) {
        await deleteItems(name, this, undefined, false, _state);
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
        tx: Transaction<"readwrite", ModelNames>,
    ) {
        // This is a unidirectional relationship, nothing needs to be connected.
        if (!relation.isBidirectional) return documentId;

        const store = tx.getStore(relation.to);
        const current = await store.get(documentId);
        if (!current) {
            throw new DocumentNotFoundError(
                `Document with Primary Key '${documentId}' could not be found in model '${relation.to}'`,
            );
        }
        const relatedKey = relation.relatedKey;
        const otherRelation = this.getModel(relation.to).getRelation(
            relatedKey,
        )!;

        const value = current[relatedKey] as Arrayable<ValidKey>;
        if (otherRelation.isArray && Array.isArray(value)) {
            if (!PrimaryKey.inKeyList(value, thisId)) value.push(thisId);
        } else {
            if (value) {
                throw new OverwriteRelationError();
            }
            current[relatedKey] = thisId;
        }

        await store.put(current).catch(tx.onRejection);
        return documentId;
    }

    private createInterface<N extends ModelNames>(
        modelName: N,
    ): StoreInterface<N, ModelNames, Models> {
        return {
            add: async (mutation, tx) =>
                (await this.add(modelName, mutation, { tx })) as PrimaryKeyType<
                    Models[N]
                >,
            addMany: async (mutations, tx) => {
                if (!tx) {
                    const stores = new Set<ModelNames>();
                    for (const mut of mutations) {
                        unionSets(
                            stores,
                            getAccessedStores(modelName, mut, true, this),
                        );
                    }
                    tx = this.createTransaction(
                        "readwrite",
                        Array.from(stores),
                    );
                }
                type T = PrimaryKeyType<Models[N]>;
                const result: T[] = [];
                for (const mut of mutations) {
                    result.push(
                        (await this.add(modelName, mut, {
                            tx,
                        })) as PrimaryKeyType<Models[N]>,
                    );
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
                    where as undefined,
                );
                switch (format) {
                    case "json":
                        return Dump.toJson(modelName, data, options) as Result;
                    case "csv":
                        return Dump.toCsvStore(
                            this.getModel(modelName),
                            data,
                        ) as Result;
                }
            },
        };
    }

    createTransaction<
        Mode extends IDBTransactionMode,
        Names extends ModelNames,
    >(mode: Mode, stores: Arrayable<Names>, options?: TransactionOptions) {
        return new Transaction(this.IDB, stores, mode, options);
    }

    deleteAllStores() {
        for (const store of this.models.keys()) {
            this.IDB.deleteObjectStore(store);
        }
    }

    deleteStore(storeNames: Arrayable<ModelNames>) {
        if (!Array.isArray(storeNames)) {
            storeNames = [storeNames];
        }
        for (const store of storeNames) {
            this.IDB.deleteObjectStore(store);
        }
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
        tx: Transaction<"readwrite", ModelNames>,
    ) {
        // Relation is unidirectional no disconnect logic is necessary
        if (!relation.isBidirectional) return documentId;

        const store = tx.getStore(relation.to);
        const current = await store.get(documentId);
        if (!current) {
            throw new DocumentNotFoundError(
                `Document with Primary Key '${documentId}' could not be found in model '${relation.to}'`,
            );
        }

        const otherRelation = this.getModel(relation.to).getRelation(
            relation.relatedKey,
        )!;

        if (otherRelation.isArray) {
            (current[relation.relatedKey] as unknown[]).filter(
                (u) => u !== thisId,
            );
        } else if (otherRelation.isOptional) {
            current[relation.relatedKey] = null;
        } else {
            throw new OverwriteRelationError();
        }

        await store.put(current).catch(tx.onRejection);
        return documentId;
    }

    async drop() {
        await handleRequest(window.indexedDB.deleteDatabase(this.name));
    }

    async dump<const Format extends ExportFormat>(
        format: Format,
        stores?: ModelNames[],
        options?: DumpOptions,
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
                    stores || Array.from(this.storeNames()),
                    data,
                ) as Dump<Format>;
        }
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
        Q extends FindInput<ModelNames, N, Models> = FindInput<
            ModelNames,
            N,
            Models
        >,
        O = FindOutput<ModelNames, N, Models, Q>,
    >(
        name: N,
        item: Q,
        stopOnFirst: boolean,
        _state: QueryState<ModelNames> = {},
    ): Promise<O[]> {
        let { tx } = _state;
        const accessed = this.getAccessedStores(
            name,
            getSearchableQuery(item),
            false,
            tx,
        );
        tx = Transaction.create(this.IDB, accessed, "readonly", tx);
        const result: O[] = [];

        return await tx.wrap(async (tx) => {
            const initStore = tx.getStore(name);
            const selectClause = generateSelector<ModelNames, Models, this>(
                name,
                this,
                item,
                tx,
            );

            await initStore.openCursor(async (cursor) => {
                const selection = await selectClause(cursor.value, tx);

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

    public getModel<N extends ModelNames>(name: N) {
        const model = this.models.getModel(name);
        if (!model)
            throw new ObjectStoreNotFoundError(
                `Model with name '${name}' not found`,
            );

        return model;
    }

    private getAccessedStores(
        name: ModelNames,
        item: Dict,
        isMutation: boolean,
        tx?: Transaction<IDBTransactionMode, ModelNames>,
    ): ModelNames[] {
        if (tx) {
            return tx.storeNames;
        }
        return Array.from(getAccessedStores(name, item, isMutation, this));
    }

    getStore<Name extends ModelNames>(name: Name): (typeof this.stores)[Name] {
        return this.stores[name];
    }

    /**
     * Iterator for all of the models
     */
    *storeNames() {
        for (const store of this.models.keys()) {
            yield store;
        }
    }

    // TODO: Refactor this someday
    private async update<
        N extends ModelNames,
        U extends UpdateMutation<N, ModelNames, Models[N], Models>,
    >(
        name: N,
        item: U,
        stopOnFirst: boolean,
        _state: MutationState<ModelNames> = {},
    ): Promise<GetStructure<N, Models>[]> {
        type T = U["data"];
        const { singleton } = _state;
        const updateData = _state.singleton ? item : item.data;
        const accessed = this.getAccessedStores(
            name,
            updateData,
            true,
            _state.tx,
        );
        const tx = Transaction.create(
            this.IDB,
            accessed,
            "readwrite",
            _state.tx,
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
                            >,
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
                                                elementKey.length - 4,
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
                            "Primary key field cannot be updated",
                        );

                    case FieldTypes.Invalid:
                    default:
                        throw new UnknownError(
                            `Unknown key '${key as string}'`,
                        );
                }
            }
            const results: GetStructure<N, Models>[] = [];
            const updateDocument = async (
                value: any,
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
                                            tx,
                                        ).catch(tx.onRejection);
                                    }

                                    await this.connectDocument(
                                        relation,
                                        thisId,
                                        payload as ValidKey,
                                        tx,
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
                                            relation: relation.isBidirectional
                                                ? {
                                                      id: thisId,
                                                      key: relation.relatedKey,
                                                  }
                                                : undefined,
                                        },
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
                                            "Item cannot be deleted, relation is required",
                                        );
                                    }
                                    // payload is the id of the other object
                                    value[key] =
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                            ? value[key].filter(
                                                  (v) =>
                                                      v !==
                                                      (payload as ValidKey),
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
                                        },
                                    );

                                    break;
                                case "$disconnect": {
                                    // payload is the id of the other object

                                    if (!relation.isNullable()) {
                                        throw new InvalidItemError(
                                            "Item cannot be disconnected, relation is required",
                                        );
                                    } else if (
                                        !value[key] ||
                                        value[key]?.lenth === 0
                                    ) {
                                        break;
                                    }

                                    if (relation.isBidirectional) {
                                        const otherRelation = this.getModel(
                                            relation.to,
                                        ).getRelation(relation.relatedKey)!;

                                        await this.disconnectDocument(
                                            relation,
                                            thisId,
                                            (otherRelation.isArray
                                                ? payload
                                                : value[key]) as ValidKey,
                                            tx,
                                        ).catch(tx.onRejection);
                                    }

                                    value[key] =
                                        relation.isArray &&
                                        Array.isArray(value[key])
                                            ? value[key].filter(
                                                  (v) => v !== payload,
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
                                            { tx },
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
                                            },
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
                                            relation.to,
                                        );
                                        const idSet = new Set(
                                            value[key] as ValidKey[],
                                        );
                                        await deleteItems(
                                            relation.to,
                                            this,
                                            {
                                                [otherModel.primaryKey]: (
                                                    value: ValidKey,
                                                ) => idSet.has(value),
                                            } as WhereObject<
                                                ExtractFields<
                                                    Models[ModelNames]
                                                >,
                                                Models
                                            >,
                                            false,
                                            { tx },
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
                                                tx,
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
                        `${model.name} with priamry key '${singleton.id}' not found`,
                    );
                }
                const updateResult = await updateDocument(getResult).catch(
                    tx.onRejection,
                );
                await store.put(updateResult);
                return [updateResult];
            } else {
                const where = generateWhereClause(item.where);
                await store.openCursor(async (cursor) => {
                    const value = cursor.value;
                    if (parseWhere(where, value)) {
                        const newValue = await updateDocument(value).catch(
                            tx.onRejection,
                        );
                        await handleRequest(
                            cursor.update(newValue) as IDBRequest<ValidKey>,
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
}

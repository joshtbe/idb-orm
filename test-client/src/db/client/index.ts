import type { Arrayable } from "type-fest";
import type { CollectionObject, CompiledDb } from "../builder";
import type { Dict, ValidKey } from "../types";
import type { PrimaryKeyType } from "../base-model";
import { getKeys, handleRequest, removeDuplicates } from "../utils";
import { Transaction, type TransactionOptions } from "../transaction";
import z from "zod";
import type {
    InterfaceMap,
    MutationQuery,
    StoreInterface,
} from "./types/index.ts";
import type { FindInput, FindOutput, SelectObject } from "./types/find.ts";
import {
    generateSelectClause,
    generateWhereClause,
    getAccessedStores,
} from "./helpers.ts";
import { CompiledQuery } from "./compiled-query.ts";

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

    createTransaction<
        Mode extends IDBTransactionMode,
        Names extends ModelNames
    >(mode: Mode, stores: Arrayable<Names>, options?: TransactionOptions) {
        return new Transaction(this.db, stores, mode, options);
    }

    async delete() {
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

    private getAccessedStores<N extends ModelNames>(
        name: N,
        item: Dict,
        type: "mutation" | "query" = "mutation"
    ): ModelNames[] {
        return removeDuplicates(getAccessedStores(name, item, type, this));
    }

    private createInterface<N extends ModelNames>(
        modelName: N
    ): StoreInterface<N, ModelNames, Models> {
        return {
            add: async (item) => await this.add(modelName, item),
            clear: async () => await this.clear(modelName),
            findFirst: async (query) =>
                (await this.find(modelName, query, true))[0],
            find: async (query) => await this.find(modelName, query, false),
            put: async () => {},
            insert: async () => 5 as any,
            updateFirst: async () => 1 as any,
            updateMany: async () => 5 as any,
            compileQuery: (query) => new CompiledQuery(this, modelName, query),
        };
    }

    private async add<N extends ModelNames>(
        name: N,
        item: MutationQuery<N, ModelNames, Models[N], Models>,
        _state: Partial<{
            tx: Transaction<"readwrite", ModelNames>;
            relation: { id: ValidKey; key: string };
        }> = {}
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
        const objectStore = tx.objectStores[name];
        const model = this.getModel(name);
        const primaryKey = model.getPrimaryKey();
        const relationAdd = relation
            ? {
                  [relation.key]: model.getRelation(relation.key)?.isArray
                      ? [relation.id]
                      : relation.id,
              }
            : {};
        const initAdd: object = primaryKey.autoIncrement
            ? {
                  ...relationAdd,
              }
            : {
                  ...relationAdd,
                  [model.primaryKey]:
                      item[model.primaryKey as keyof T] ?? primaryKey.genKey(),
              };
        const id = (await handleRequest(objectStore.add(initAdd))) as ValidKey;
        const toAdd: Dict = {};
        const visited = new Set<string>();
        for (const key of getKeys(item)) {
            visited.add(key);
            const element = item[key];
            switch (model.keyType(key)) {
                case "None":
                    throw tx.abort(
                        "INVALID_ITEM",
                        `Key '${key}' does ont exist on model '${name}'`
                    );
                case "Field": {
                    const parseResult = model.parseField(key, element);
                    if (!parseResult || !parseResult.success) {
                        throw tx.abort(
                            "INVALID_ITEM",
                            `Key '${key}' has the following validation error: ${z.prettifyError(
                                parseResult.error
                            )}`
                        );
                    }
                    toAdd[key] = parseResult.data;
                    break;
                }
                case "Relation": {
                    let value: Arrayable<typeof element> = element;
                    if (!Array.isArray(element)) {
                        value = [value];
                    }

                    const relation = model.getRelation<ModelNames>(key)!;
                    if (relation.isArray) {
                        toAdd[key] = [];
                    }
                    const otherModel = this.getModel(relation.to);
                    const otherRelation = otherModel.getRelation(
                        relation.fieldKey
                    );
                    const otherStore = tx.objectStores[relation.to];

                    // TODO: Optimize with batch editing with cursor
                    for (const item of value as Dict[]) {
                        const firstKey = getKeys(item)[0];
                        if (!firstKey)
                            throw tx.abort(
                                "INVALID_ITEM",
                                `Key '${key}' cannot be an empty connection object`
                            );

                        switch (firstKey) {
                            case "$connect": {
                                // Modify item so that it references the new item
                                const connectId: ValidKey = item[
                                    firstKey
                                ] as string;
                                const current = await handleRequest(
                                    otherStore.get(connectId)
                                );
                                if (!current)
                                    throw tx.abort(
                                        "NOT_FOUND",
                                        `Document with Primary Key '${connectId}' could not be found in model '${relation.to}'`
                                    );

                                if (!otherRelation)
                                    throw tx.abort(
                                        "INVALID_ITEM",
                                        `Could not find corresponding relation '${relation.name}'`
                                    );
                                if (otherRelation.isArray) {
                                    current[relation.fieldKey].push(id);
                                } else {
                                    if (current[relation.fieldKey]) {
                                        // TODO: Handle updating relation if it already exists
                                    }
                                    current[relation.fieldKey] = id;
                                }
                                await handleRequest(otherStore.put(current));

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
                                    item[firstKey] as any,
                                    {
                                        tx,
                                        relation: {
                                            id,
                                            key: relation.fieldKey,
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
                            default:
                                throw tx.abort(
                                    "INVALID_ITEM",
                                    `Connection Object on key '${key}' has an unknown key '${firstKey}'`
                                );
                        }
                    }
                    break;
                }
                // We already added the primary key
                case "Primary":
                default:
                    break;
            }
        }

        const unused = Array.from(new Set(model.keys()).difference(visited));
        for (const unusedField of unused) {
            switch (model.keyType(unusedField)) {
                case "Field": {
                    const parseResult = model.parseField(
                        unusedField,
                        undefined
                    );
                    if (!parseResult.success)
                        throw tx.abort(
                            "INVALID_ITEM",
                            `Key '${unusedField}' is missing`
                        );
                    toAdd[unusedField] = parseResult.data;
                    break;
                }
                case "Relation": {
                    const field = model.getRelation(unusedField)!;
                    const established = relationAdd[unusedField];
                    if (field.isArray) {
                        toAdd[unusedField] = established ?? [];
                    } else if (field.isOptional) {
                        toAdd[unusedField] = established ?? null;
                    } else if (!established)
                        throw tx.abort(
                            "INVALID_ITEM",
                            `Required relation '${unusedField}' is not defined`
                        );
                    else {
                        toAdd[unusedField] = established;
                    }

                    break;
                }
                // This should never happen
                case "None":
                case "Primary":
                default:
                    break;
            }
        }

        return (await handleRequest(
            objectStore.put({
                [model.primaryKey]: id,
                ...toAdd,
            })
        )) as PrimaryKeyType<Models[N]>;
    }

    private async clear(name: ModelNames) {
        await handleRequest(
            this.createTransaction("readwrite", [name]).objectStores[
                name
            ].clear()
        );
    }

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
        _state: Partial<{
            tx: Transaction<"readonly", ModelNames>;
            accessed: ModelNames[];
        }> = {}
    ): Promise<O[]> {
        let { tx, accessed } = _state;
        accessed =
            accessed ??
            this.getAccessedStores(name, item.select ?? {}, "query");
        tx = tx ?? this.createTransaction("readonly", accessed);
        const result: O[] = [];
        const initStore = tx.objectStores[name];
        const request = initStore.openCursor();

        const { select, where = {} } = item;
        const whereClause = generateWhereClause(where);

        const ANY = z.any();

        // Create function to select fields and recursively parse
        // const generateSelectSchema = (
        //     name: ModelNames,
        //     select: SelectObject<ModelNames, any, Models>
        // ) => {
        //     const _filterSchema: Dict<z.ZodType> = {};
        //     const model = this.getModel(name);
        //     for (const key of getKeys(select)) {
        //         switch (model.keyType(key)) {
        //             case "Relation": {
        //                 const relation = model.getRelation<ModelNames>(key)!;
        //                 const store = tx.objectStores[relation.to];
        //                 if (relation.isArray) {
        //                     _filterSchema[key] = ANY.transform(
        //                         async (ids: ValidKey[]) => {
        //                             const result: Dict[] = [];
        //                             for (const id of ids) {
        //                                 result.push(
        //                                     await handleRequest(store.get(id))
        //                                 );
        //                             }
        //                             return result;
        //                         }
        //                     );
        //                     if (typeof select[key] === "object") {
        //                         _filterSchema[key] = _filterSchema[key].pipe(
        //                             z.array(
        //                                 generateSelectSchema(
        //                                     relation.to,
        //                                     select[key] as SelectObject<
        //                                         ModelNames,
        //                                         any,
        //                                         Models
        //                                     >
        //                                 )
        //                             )
        //                         );
        //                     }
        //                 } else {
        //                     _filterSchema[key] = ANY.transform(
        //                         async (id: ValidKey) =>
        //                             (await handleRequest(store.get(id))) as Dict
        //                     );
        //                     if (typeof select[key] === "object") {
        //                         _filterSchema[key] = _filterSchema[key].pipe(
        //                             generateSelectSchema(
        //                                 relation.to,
        //                                 select[key] as SelectObject<
        //                                     ModelNames,
        //                                     any,
        //                                     Models
        //                                 >
        //                             )
        //                         );
        //                     }
        //                 }
        //                 break;
        //             }
        //             case "Primary":
        //                 _filterSchema[key] = model.getPrimaryKey().getSchema();
        //                 break;
        //             case "Field":
        //                 _filterSchema[key] = model.getModelField(key)!.schema;
        //                 break;
        //             default:
        //                 throw tx.abort(
        //                     "INVALID_ITEM",
        //                     `Key '${key}' is not found in the model '${name}'`
        //                 );
        //         }
        //     }
        //     return z.object(_filterSchema);
        // };

        // const selectSchema = generateSelectSchema(name, select ?? {});
        const selectClause = generateSelectClause<ModelNames, Models, this>(
            name,
            this,
            select ?? {}
        );

        await new Promise<void>((res) => {
            request.onsuccess = async (event) => {
                const cursor = (event.target as any)
                    .result as IDBCursorWithValue;
                if (cursor) {
                    const value = cursor.value;
                    if (!where || whereClause(value)) {
                        result.push(await selectClause(value, tx));
                    }

                    // Stop early and return if it's just finding the first one
                    if (stopOnFirst && result.length) {
                        res();
                        return;
                    }
                    cursor.continue();
                } else res();
            };
            request.onerror = () => {
                throw tx.abort("UNKNOWN", "An unknown error occurred");
            };
        });

        return result;
    }
}

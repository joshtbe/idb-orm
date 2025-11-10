import { CollectionObject } from "../builder.js";
import { ExtractFields } from "../model/model-types.js";
import { Transaction } from "../transaction.js";
import { WhereObject } from "./types/find.js";
import { MutationState } from "./types";
import { DbClient } from "./index.js";
import { DeleteError, InvalidConfigError } from "../error.js";
import { Dict, ValidKey } from "../util-types.js";
import { handleRequest, toArray } from "../utils.js";
import { generateWhereClause, parseWhere } from "./helpers.js";

function generateDocumentDelete<
    ModelNames extends string,
    Name extends ModelNames,
    Models extends CollectionObject<ModelNames>
>(
    model: Models[Name],
    client: DbClient<string, ModelNames, Models>,
    tx: Transaction<"readwrite", ModelNames>
) {
    return async (item: Dict): Promise<boolean> => {
        if (!item) return false;
        const primaryKeyValue = item[model.primaryKey] as ValidKey;

        for (const relationKey of model.links<ModelNames>()) {
            const relation = model.getRelation<ModelNames>(relationKey)!;
            const { onDelete } = relation.getActions();
            const fieldItem = item[relationKey];
            const relatedModel = client.getModel(relation.to);

            switch (onDelete) {
                // Cascade the delete to the other item
                case "Cascade": {
                    if (relation.isArray) {
                        tx.assertIsArray(fieldItem);
                        const idSet = new Set<ValidKey>(fieldItem);
                        const deleteFn = generateDocumentDelete(
                            relatedModel,
                            client,
                            tx
                        );
                        const store = tx.getStore(relation.to);
                        await store
                            .openCursor(async (cursor) => {
                                if (
                                    idSet.has(
                                        cursor.value[
                                            relatedModel.primaryKey
                                        ] as ValidKey
                                    )
                                ) {
                                    await deleteFn(cursor.value as Dict);
                                }
                                cursor.continue();
                                return true;
                            })
                            .catch(tx.onRejection);
                    }
                    // If it's optional & valid or singular
                    else if (fieldItem) {
                        await deleteItems(
                            relation.to,
                            client,
                            undefined,
                            undefined,
                            {
                                tx,
                                singleton: { id: fieldItem as ValidKey },
                            }
                        );
                    }
                    break;
                }

                // Set the corresponding relation to null (only works if it's optional or array)
                case "SetNull": {
                    // If it's an optional relation that's null, do nothing
                    if (!fieldItem) break;

                    const deletedItems = toArray(fieldItem as ValidKey);
                    const relatedStore = tx.getStore(relation.to);
                    const relatedKey = relation.getRelatedKey();
                    const relatedRelation =
                        relatedModel.getRelation(relatedKey);
                    if (!relatedRelation)
                        throw tx.abort(
                            new InvalidConfigError(
                                `Relation '${
                                    relation.name
                                }' has an invalid relation key '${relation.getRelatedKey()}'`
                            )
                        );
                    else if (!relatedRelation.isNullable()) {
                        throw tx.abort(
                            new InvalidConfigError(
                                `Key '${relatedKey}' on model '${relatedKey}': Non-optional relation cannot have the 'SetNull' action`
                            )
                        );
                    }

                    // Update corresponding relation
                    for (const id of deletedItems) {
                        const relatedItem = await relatedStore.get(id);

                        // Ignore if it doesn't exist
                        if (!relatedItem) continue;

                        const relatedField = relatedItem[relatedKey] as string;

                        // Search for the item's primaryKey
                        if (relatedRelation.isArray) {
                            tx.assertIsArray(relatedField);
                            const index = relatedField.indexOf(primaryKeyValue);
                            if (index === -1) continue;
                            relatedField.splice(index, 1);
                        } else {
                            relatedItem[relatedKey] = null;
                        }
                        await relatedStore.put(relatedItem);
                    }
                    break;
                }

                // This item cannot be deleted IF the relation is valid
                case "Restrict": {
                    if (
                        (Array.isArray(fieldItem) && fieldItem.length > 0) ||
                        fieldItem
                    ) {
                        throw tx.abort(
                            new DeleteError(
                                `Key '${relationKey}' on model '${name}' deletion is restricted while there is an active relation`
                            )
                        );
                    }
                    break;
                }

                // Do nothing on the corresponding relation
                case "None":
                default:
                    break;
            }
        }
        return true;
    };
}

/**
 * Deletes document(s) from a store
 * @param name Name of the store
 * @param client DbClient object
 * @param stopOnFirst Stop after the first deletion
 * @param _state Optional state for multi-stage actions
 * @returns Number of items removed
 */
export async function deleteItems<
    ModelNames extends string,
    Name extends ModelNames,
    Models extends CollectionObject<ModelNames>
>(
    name: Name,
    client: DbClient<string, ModelNames, Models>,
    where?: WhereObject<ExtractFields<Models[Name]>>,
    stopOnFirst: boolean = false,
    _state: MutationState<ModelNames> = {}
): Promise<number> {
    const { singleton, finalStep = true } = _state;
    const model = client.getModel(name);
    const accessed = _state.tx
        ? _state.tx.storeNames
        : Array.from(model.getDeletedStores(client));
    const tx: Transaction<"readwrite", ModelNames> =
        _state.tx ?? client.createTransaction("readwrite", accessed);

    const store = tx.getStore(name);
    let deleted = 0;

    const deleteSubItems = generateDocumentDelete(model, client, tx);

    if (singleton) {
        if (await deleteSubItems(await store.assertGet(singleton.id))) {
            await store.delete(singleton.id);
            deleted++;
        }
    } else {
        const whereClause = generateWhereClause(where);
        let promise: Promise<undefined> | undefined;
        await store.openCursor(async (cursor) => {
            const value = cursor.value as Dict;
            if (
                parseWhere(whereClause, value) &&
                (await deleteSubItems(value))
            ) {
                promise = handleRequest(cursor.delete()).catch(tx.onRejection);
            }
            if (stopOnFirst && deleted > 0) {
                return false;
            }
            cursor.continue();
            return true;
        });

        if (promise && finalStep) {
            await promise;
        }
    }

    return deleted;
}

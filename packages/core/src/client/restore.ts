import { DbClient } from ".";
import {
    DocumentNotFoundError,
    ImportError,
    InvalidItemError,
    OverwriteRelationError,
} from "../error";
import {
    BaseRelation,
    deserializeType,
    isType,
    PrimaryKey,
    Property,
    Type,
    ValidKey,
} from "../field";
import { CollectionObject } from "../model";
import { Transaction } from "../transaction";
import { Arrayable, Dict } from "../util-types";
import { tryNumberCoerce } from "../utils";

/**
 * Inserts reserved characters into a JSON pointer string
 */
function dirty(text: string): string {
    if (typeof text !== "string") {
        throw new ImportError(`Expected a string, received '${text}'`);
    }
    return text.replaceAll(/~0|~1/g, (match) => {
        return match === "~0" ? "~" : "/";
    });
}

const REF_REGEX = /^\/([^/]+)\/(.+)$/;

function extractReference<T extends string = string>(
    ref: string,
): { store: T; key: string } {
    if (typeof ref !== "string")
        throw new ImportError(`Expected reference string, received: '${ref}'`);

    const match = ref.match(REF_REGEX);
    if (!match || match.length !== 3) {
        throw new ImportError(`Expected reference string, received: '${ref}'`);
    }

    return {
        store: dirty(match[1]) as T,
        key: dirty(match[2]),
    };
}

type GenerateKeyMapParams<N extends string> =
    | {
          isDb: true;
          data: Dict;
      }
    | { isDb: false; storeName: N; data: Dict };

/**
 * Generate a key map for the primary keys of the imported file
 * @param options Options for how to parse the data key
 * @returns A mapping from stores to primary keys in the given file of that store
 */
function _generateKeyMap<Names extends string>(
    options: GenerateKeyMapParams<Names>,
) {
    if (typeof options.data !== "object") {
        throw new ImportError("Expected an object type for the initial data");
    }
    const map = new Map<Names, Set<ValidKey>>();

    if (!options.isDb) {
        options.data = {
            [options.storeName]: options.data,
        };
    }

    for (const store in options.data) {
        if (!Object.hasOwn(options.data, store)) continue;
        const keySet = new Set<ValidKey>();
        const data = options.data[store] as Dict;

        if (typeof data !== "object") {
            throw new ImportError(
                `Expected an object of documents on key '${store}'`,
            );
        }

        for (const docKey in data) {
            if (!Object.hasOwn(data, docKey)) continue;
            keySet.add(tryNumberCoerce(docKey));
        }

        map.set(store as Names, keySet);
    }
    return map;
}

async function verifyRelation<Names extends string>(
    db: DbClient<string, Names, CollectionObject<Names>>,
    path: string,
    field: BaseRelation<string, string>,
    refString: string,
    fieldKey: string,
    primaryKey: ValidKey,
    primaryKeys: Map<Names, Set<ValidKey>>,
    tx: Transaction<"readwrite", Names>,
): Promise<ValidKey> {
    const ref = extractReference<Names>(refString);
    const refModel = db.getModel(ref.store);
    const keyValue = await deserializeType(
        refModel.getPrimaryKey().type,
        tryNumberCoerce(ref.key),
    );

    if (primaryKeys.get(ref.store)?.has(keyValue)) {
        // The document exists in the file import
        // TODO: Check the referenced document and make sure it points to this one
        return keyValue;
    }

    // Check database
    // If other item exists, check the relation field:
    //      If the relation is optional and null, set it to this item
    //      If the relation is arrayable, add it if it doesn't exist
    //      If the relation is singular and already defined (to an item with a different primary key) throw an error
    // Update the related item
    const getResult = await tx.getStore(ref.store).get(keyValue);

    if (!getResult) {
        throw new DocumentNotFoundError(
            `${path}.${fieldKey}: Related document with key '${ref.key}' in store '${ref.store}' does not exist`,
        );
    }
    const relatedKey = field.getRelatedKey();
    const relatedRelation = refModel.getRelation(relatedKey)!;
    const relatedField = getResult[relatedKey] as Arrayable<ValidKey> | null;

    if (relatedRelation.isOptional && relatedField == null) {
        getResult[relatedKey] = primaryKey;
    } else if (relatedRelation.isArray) {
        if (
            !Array.isArray(relatedField) ||
            !isType(Type.array(PrimaryKey.validKeyTag), relatedField)
        )
            throw new InvalidItemError(
                `${refModel.name}.${ref.key}.${relatedKey}: Value should be an array of valid keys.`,
            );
        if (!PrimaryKey.inKeyList(relatedField, primaryKey)) {
            relatedField.push(primaryKey);
        }
    } else {
        if (!isType(PrimaryKey.validKeyTag, relatedField)) {
            throw new InvalidItemError(
                `${refModel.name}.${ref.key}.${relatedKey}: Value should be a string | number | Date.`,
            );
        }

        // If the singular relation is defined (which it is if we're here) ensure that it is pointing to this document
        if (!PrimaryKey.compareKeyValue(relatedField, primaryKey)) {
            throw new OverwriteRelationError(
                `${path}.${fieldKey}: Related document with key '${ref.key}' in store '${ref.store}' already has an existing relation with a different document.`,
            );
        }
    }
    await tx.getStore(ref.store).put(getResult);
    return keyValue;
}

/**
 * Pushes the data found in the data parameter to the given store
 * @param db Database client instance
 * @param store Name of the store to add to
 * @param data Data object, where each key-value pair is a primary key and its document
 * @param primaryKeys Map of all primary keys of other stores (and this one) that were included within the source file
 * @param tx Transaction object
 */
export async function pushStoreData<
    Current extends Names,
    Names extends string,
>(
    db: DbClient<string, Names, CollectionObject<Names>>,
    store: Current,
    data: Dict,
    primaryKeys: Map<Names, Set<ValidKey>>,
    tx?: Transaction<"readwrite", Names>,
) {
    tx = Transaction.create(db.getDb(), [store], "readwrite", tx);
    const model = db.getModel(store);

    // Type checks
    if (typeof data !== "object") {
        throw new ImportError(
            `Data object of store '${store}' is not an object`,
        );
    }

    // Loop through every document
    for (const key in data) {
        if (!Object.hasOwn(data, key)) continue;

        // Ensure every subelement is an object
        const document = data[key] as Dict;
        if (typeof document !== "object")
            throw new ImportError(
                `Document with key '${key}' on store '${store}' was not an object`,
            );

        const resultDoc: Dict = {};

        // Deserialize the primary key first (for use determining relations)
        const primaryKey = (resultDoc[model.primaryKey] = await deserializeType(
            model.getPrimaryKey().type,
            document[model.primaryKey],
        ));

        // Loop through the model's keys and parse the document
        for (const [fieldkey, field] of model.entries()) {
            if (Property.is(field)) {
                resultDoc[fieldkey] = await deserializeType(
                    field.type,
                    document[fieldkey],
                );
                continue;
            } else if (PrimaryKey.is(field)) {
                continue;
            }
            // Option 1: Field is optional the relation is null
            if (field.isOptional && document[fieldkey] == null) {
                resultDoc[fieldkey] = null;
            }
            // Option 2: Field is arrayable:
            else if (field.isArray) {
                const relations = document[fieldkey] as string[];
                if (!Array.isArray(relations)) {
                    throw new ImportError(
                        `Document with key '${key}' on store '${store}': Field '${fieldkey}' should be an array of references`,
                    );
                }

                const relationList: ValidKey[] = [];
                for (const reference of relations) {
                    relationList.push(
                        await verifyRelation(
                            db,
                            `${store}.${key}`,
                            field,
                            reference,
                            fieldkey,
                            primaryKey,
                            primaryKeys,
                            tx,
                        ),
                    );
                }

                resultDoc[fieldkey] = relationList;
            }
            // Option 3: Field is singular or Optional and defined:
            else {
                resultDoc[fieldkey] = await verifyRelation(
                    db,
                    `${store}.${key}`,
                    field,
                    document[fieldkey] as string,
                    fieldkey,
                    primaryKey,
                    primaryKeys,
                    tx,
                );
            }
        }

        // Add the document
        await tx.getStore(store).add(resultDoc);
    }
}

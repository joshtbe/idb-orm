import { generateWhereClause, parseWhere } from "../client/helpers.js";
import { WhereObject } from "../client/types/find.js";
import { Dict } from "../util-types";
import { DbClient } from "../client";
import { BaseRelation, PrimaryKey, Property, ValidValue, Type } from "../field";
import { AssertionError, ExportError } from "../error.js";
import { CollectionObject } from "../model";
import { Transaction } from "../transaction.js";
import { JsonDump } from "./class.js";

/**
 * Removes reserved characters from a JSON pointer string
 */
function clean(text: unknown): string {
    if (typeof text !== "string") return `${text}`;
    return text.replaceAll(/~/g, "~0").replaceAll(/\//g, "~1");
}

export async function dumpStoreToJson<
    Current extends Names,
    Names extends string,
    Models extends CollectionObject<Names>
>(
    db: DbClient<string, Names, CollectionObject<Names>>,
    store: Current,
    where?: WhereObject<
        Models[Current] extends Dict<ValidValue> ? Models[Current] : never
    >,
    tx?: Transaction<"readonly", Names>
): Promise<JsonDump> {
    tx = Transaction.create(db.getDb(), [store], "readonly", tx);
    const whereClause = generateWhereClause(where);
    const model = db.getModel(store);

    return new JsonDump(
        store,
        await tx.wrap(async (tx) => {
            const result: Dict = {};

            await tx.getStore(store).openCursor(async (cursor) => {
                if (parseWhere(whereClause, cursor.value)) {
                    for (const [key, field] of model.entries()) {
                        if (BaseRelation.is(field)) {
                            if (field.isArray) {
                                if (!Array.isArray(cursor.value[key])) {
                                    throw new AssertionError(
                                        "Expected array type"
                                    );
                                }
                                const paths: string[] = [];

                                for (const ref of cursor.value[key]) {
                                    paths.push(`/${field.to}/${clean(ref)}`);
                                }

                                cursor.value[key] = paths;
                            } else if (
                                (field.isOptional && cursor.value[key]) ||
                                !field.isNullable()
                            ) {
                                cursor.value[key] = `/${field.to}/${clean(
                                    cursor.value[key]
                                )}`;
                            }
                        } else if (Property.is(field) || PrimaryKey.is(field)) {
                            cursor.value[key] = await Type.serialize(
                                field.getType(),
                                cursor.value[key]
                            );
                        } else {
                            throw new ExportError(
                                `Unrecognized model field on key '${key}'`
                            );
                        }
                    }

                    if (result[cursor.value[model.primaryKey]]) {
                        throw new ExportError(
                            "Duplicate primary key detected " +
                                JSON.stringify(result)
                        );
                    }
                    result[cursor.value[model.primaryKey]] = cursor.value;
                }
                cursor.continue();
                return true;
            });

            return result;
        })
    );
}

export async function dumpDatabaseToJSON<Names extends string>(
    db: DbClient<string, Names, any>,
    stores?: Names[]
): Promise<JsonDump> {
    const result: Dict = {};
    stores = stores ? stores : db.getStoreNames();
    const tx = db.createTransaction("readonly", stores);

    for (const store of stores) {
        result[store] = (
            await dumpStoreToJson(
                db as DbClient<string, Names, CollectionObject<Names>>,
                store,
                undefined,
                tx
            )
        ).getValue();
    }

    return new JsonDump(db.name, result);
}

import { Dict } from "../util-types";
import { ExportFormat } from "./types";
import { DbClient } from ".";
import { generateWhereClause, parseWhere } from "./helpers.js";
import { WhereObject } from "./types/find.js";
import { BaseRelation, PrimaryKey, Property, ValidValue, Type } from "../field";
import { CollectionObject, Model } from "../model";
import { Transaction } from "../transaction.js";
import { AssertionError, ExportError } from "../error.js";

/**
 * Removes reserved characters from a JSON pointer string
 */
export function clean(text: unknown): string {
    if (typeof text !== "string") return `${text}`;
    return text.replaceAll(/~/g, "~0").replaceAll(/\//g, "~1");
}

export async function getStoreData<
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
): Promise<Dict> {
    tx = Transaction.create(db.getDb(), [store], "readonly", tx);
    const whereClause = generateWhereClause(where);
    const model = db.getModel(store);
    return await tx.wrap(async (tx) => {
        const result: Dict = {};
        await tx.getStore(store).openCursor(async (cursor) => {
            if (parseWhere(whereClause, cursor.value)) {
                for (const [key, field] of model.entries()) {
                    if (BaseRelation.is(field)) {
                        if (field.isArray) {
                            if (!Array.isArray(cursor.value[key])) {
                                throw new AssertionError("Expected array type");
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
                            field.type,
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
    });
}

export async function getDatabaseData<Names extends string>(
    db: DbClient<string, Names, any>,
    stores?: Names[]
): Promise<Dict<Dict>> {
    const result: Dict<Dict> = {};
    stores = stores ? stores : db.getStoreNames();
    const tx = db.createTransaction("readonly", stores);

    for (const store of stores) {
        result[store] = await getStoreData(
            db as DbClient<string, Names, CollectionObject<Names>>,
            store,
            undefined,
            tx
        );
    }
    return result;
}

export interface DumpOptions {
    pretty?: boolean;
}

function storeToCsv(model: Model<string, any, string>, data: Dict): string {
    const lines: string[] = [`## ${model.name}`];
    const fieldNames: string[] = [];
    for (const [key, field] of model.entries()) {
        if (PrimaryKey.is(field)) {
            // Ensure the primary key is the first element
            fieldNames.unshift(key);
        } else {
            fieldNames.push(key);
        }
    }
    lines.push(fieldNames.join(","));
    for (const item of Object.values(data as Dict<Dict>)) {
        const curLine: string[] = [];
        for (const field of fieldNames) {
            switch (typeof item[field]) {
                case "object":
                    curLine.push(JSON.stringify(item[field]));
                    break;
                case "undefined":
                    curLine.push("");
                    break;
                default:
                    curLine.push(String(item[field]));
                    break;
            }
        }
        lines.push(curLine.join(","));
    }

    return lines.join("\n");
}

export class Dump<F extends ExportFormat> {
    constructor(
        protected readonly name: string,
        protected readonly content: string,
        protected readonly extension: F
    ) {}

    toFile(
        filename: string = `${this.name}_dump.${this.extension}`,
        options?: FilePropertyBag
    ): File {
        return new File([this.content], filename, options);
    }

    download(
        filename: string = `${this.name}_dump.${this.extension}`,
        options?: FilePropertyBag
    ): void {
        const url = URL.createObjectURL(this.toFile(filename, options));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static toJson(name: string, content: Dict, options?: DumpOptions) {
        return new this(
            name,
            JSON.stringify(
                content,
                undefined,
                options?.pretty ?? true ? 4 : undefined
            ),
            "json"
        );
    }

    static toCsvStore(model: Model<string, any, string>, content: Dict) {
        return new this(model.name, storeToCsv(model, content), "csv");
    }

    static toCsvDb(
        db: DbClient<string, string, CollectionObject<string>>,
        stores: string[],
        content: Dict<Dict>
    ) {
        const lines: string[] = [`# ${db.name}`];
        for (const model of stores) {
            lines.push(storeToCsv(db.getModel(model), content[model]));
        }

        return new this(db.name, lines.join("\n"), "csv");
    }
}

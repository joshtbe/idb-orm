import z from "zod";
import type { CollectionObject } from "../builder.ts";
import { getKeys, handleRequest, removeDuplicates } from "../utils.ts";
import { generateWhereClause, getAccessedStores } from "./helpers.ts";
import type { DbClient } from "./index.ts";
import type { FindInput, FindOutput, SelectObject } from "./types/find.ts";
import type { Dict, ValidKey } from "../types.ts";

export class CompiledQuery<
    Stores extends string,
    Models extends CollectionObject<string>,
    Db extends DbClient<string, Stores, Models>,
    Input extends FindInput<Stores, Models[Stores], Models> = FindInput<
        Stores,
        Models[Stores],
        Models
    >,
    Output = FindOutput<Stores, Models[Stores], Models, Input>
> {
    public static readonly ANY = z.any();

    private readonly accessedStores: Stores[];
    private readonly whereClause?: (value: unknown) => boolean;
    private readonly select?: SelectObject<Stores, any, Models>;
    constructor(
        private readonly client: Db,
        private readonly name: Stores,
        input: FindInput<Stores, Models[Stores], Models>
    ) {
        this.accessedStores = removeDuplicates(
            getAccessedStores(name, input, "query", this.client)
        );
        this.whereClause = input.where
            ? generateWhereClause(input.where)
            : undefined;
        this.select = input.select;
    }

    async find(): Promise<Output[]> {
        return await this._find(false);
    }

    async findFirst() {
        return (await this._find(true))[0];
    }

    private async _find(stopOnFirst: boolean): Promise<Output[]> {
        const tx = this.client.createTransaction(
            "readonly",
            this.accessedStores
        );
        const result: Output[] = [];
        const initStore = tx.objectStores[this.name];
        const request = initStore.openCursor();

        const generateSelectSchema = (
            name: Stores,
            select: SelectObject<Stores, any, Models>
        ) => {
            const _filterSchema: Dict<z.ZodType> = {};
            const model = this.client.getModel(name);
            for (const key of getKeys(select)) {
                switch (model.keyType(key)) {
                    case "Relation": {
                        const relation = model.getRelation<Stores>(key)!;
                        const store = tx.objectStores[relation.to];
                        if (relation.isArray) {
                            _filterSchema[key] = CompiledQuery.ANY.transform(
                                async (ids: ValidKey[]) => {
                                    const result: Dict[] = [];
                                    for (const id of ids) {
                                        result.push(
                                            await handleRequest(store.get(id))
                                        );
                                    }
                                    return result;
                                }
                            );
                            if (typeof select[key] === "object") {
                                _filterSchema[key] = _filterSchema[key].pipe(
                                    z.array(
                                        generateSelectSchema(
                                            relation.to,
                                            select[key] as SelectObject<
                                                Stores,
                                                any,
                                                Models
                                            >
                                        )
                                    )
                                );
                            }
                        } else {
                            _filterSchema[key] = CompiledQuery.ANY.transform(
                                async (id: ValidKey) =>
                                    (await handleRequest(store.get(id))) as Dict
                            );
                            if (typeof select[key] === "object") {
                                _filterSchema[key] = _filterSchema[key].pipe(
                                    generateSelectSchema(
                                        relation.to,
                                        select[key] as SelectObject<
                                            Stores,
                                            any,
                                            Models
                                        >
                                    )
                                );
                            }
                        }
                        break;
                    }
                    case "Primary":
                        _filterSchema[key] = model.getPrimaryKey().getSchema();
                        break;
                    case "Field":
                        _filterSchema[key] = model.getModelField(key)!.schema;
                        break;
                    default:
                        throw tx.abort(
                            "INVALID_ITEM",
                            `Key '${key}' is not found in the model '${name}'`
                        );
                }
            }
            return z.object(_filterSchema);
        };

        const selectSchema = this.select
            ? generateSelectSchema(this.name, this.select)
            : undefined;

        await new Promise<void>((res) => {
            request.onsuccess = async (event) => {
                const cursor = (event.target as any)
                    .result as IDBCursorWithValue;
                if (cursor) {
                    const value = cursor.value;
                    if (!this.whereClause || this.whereClause(value)) {
                        if (selectSchema) {
                            const selection = await selectSchema.safeParseAsync(
                                value
                            );
                            if (!selection.success)
                                throw tx.abort(
                                    "INVALID_CONFIG",
                                    z.prettifyError(selection.error)
                                );
                            result.push(selection.data as Output);
                        } else {
                            result.push(value);
                        }
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

import type { Arrayable, Dict, Keyof, Promisable } from "../util-types.js";
import { identity, toArray, unionSets } from "../utils.js";
import type { DbClient } from "./index.ts";
import type {
    AddMutation,
    MutationAction,
    UpdateMutation,
} from "./types/mutation.ts";
import type { QueryInput } from "./types/find";
import type { Transaction } from "../transaction.js";
import { InvalidItemError } from "../error.js";
import { FieldTypes, ValidKey } from "../field/field-types.js";
import { CollectionObject } from "../model";

type WhereClauseElement =
    | [key: string, isFun: true, fn: (value: unknown) => boolean]
    | [key: string, isFun: false, value: unknown];

export function generateWhereClause(where?: Dict): WhereClauseElement[] {
    if (!where) return [];
    const checks: WhereClauseElement[] = [];
    for (const whereKey in where) {
        if (!Object.hasOwn(where, whereKey)) continue;

        switch (typeof where[whereKey]) {
            case "function":
                checks.push([whereKey, true, where[whereKey] as () => boolean]);
                break;
            case "object":
                // Just skip checking them (unless they are dates)
                if (where[whereKey] instanceof Date) {
                    const date: Date = where[whereKey];
                    checks.push([
                        whereKey,
                        true,
                        (value) =>
                            value instanceof Date &&
                            value.getTime() === date.getTime(),
                    ]);
                }
                break;
            default:
                checks.push([whereKey, false, where[whereKey]]);
        }
    }

    return checks;
}

/**
 * Parses a WhereClause array and returns if the item passes the checks or not
 * @param whereArray Result of `generateWhereClause()`
 * @param obj Object to check
 * @returns If the object satisfies the where clause or not
 */
export function parseWhere(
    whereArray: WhereClauseElement[],
    obj: unknown,
): boolean {
    if (!obj || typeof obj !== "object") return false;
    for (const item of whereArray) {
        if (item[1]) {
            if (!item[2]((obj as Dict)[item[0]])) {
                return false;
            }
        } else if (item[2] !== (obj as Dict)[item[0]]) {
            return false;
        }
    }
    return true;
}

export function generateSelector<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>,
    Db extends DbClient<string, ModelNames, Models>,
    Q extends QueryInput<ModelNames, any, Models> = QueryInput<
        ModelNames,
        any,
        Models
    >,
>(
    name: ModelNames,
    client: Db,
    query: Q = {} as Q,
    initTx?: Transaction<IDBTransactionMode, ModelNames>,
): (
    item: Dict,
    tx: Transaction<IDBTransactionMode, ModelNames>,
) => Promisable<Dict | undefined> {
    type Tx = Transaction<IDBTransactionMode, ModelNames>;
    const model = client.getModel(name);

    if (query.include && query.select) {
        throw new InvalidItemError("include and select cannot both be defined");
    }

    const whereClause = generateWhereClause(query.where);
    const qKey = query.select ? "select" : query.include ? "include" : "";

    if (qKey) {
        type I = NonNullable<Q[typeof qKey]>;
        const item = query[qKey]!;
        const isSelect = !!query.select;
        const getters: {
            key: Keyof<I>;
            getValue?: (value: Arrayable<ValidKey>, tx: Tx) => Promise<unknown>;
        }[] = [];

        for (const key in item) {
            if (!Object.hasOwn(item, key)) continue;
            if (!item[key]) continue;

            switch (model.keyType(key)) {
                case FieldTypes.Relation: {
                    const relation = model.getRelation<ModelNames>(key)!;
                    const subSelectFn =
                        typeof item[key] === "object"
                            ? generateSelector(
                                  relation.to,
                                  client as any,
                                  item[key],
                                  initTx,
                              )
                            : identity;
                    if (relation.isArray) {
                        const fn = async (ids: ValidKey[], tx: Tx) => {
                            const result: Dict[] = [];
                            const store = tx.getStore(relation.to);
                            for (const id of ids) {
                                const res = await subSelectFn(
                                    await store.assertGet(id),
                                    tx,
                                );
                                if (res) {
                                    if (relation.isBidirectional) {
                                        delete res[relation.getRelatedKey()];
                                    }
                                    result.push(res);
                                }
                            }
                            return result;
                        };
                        getters.push({
                            key: key as Keyof<I>,
                            getValue: fn as (
                                value: Arrayable<ValidKey>,
                                tx: Tx,
                            ) => Promise<unknown>,
                        });
                    } else {
                        const fn = async (id: ValidKey, tx: Tx) => {
                            return await subSelectFn(
                                await tx.getStore(relation.to).assertGet(id),
                                tx,
                            );
                        };

                        getters.push({
                            key: key as Keyof<I>,
                            getValue: fn as (
                                value: Arrayable<ValidKey>,
                                tx: Tx,
                            ) => Promise<unknown>,
                        });
                    }
                    break;
                }
                case FieldTypes.Property:
                case FieldTypes.PrimaryKey:
                    if (isSelect) getters.push({ key: key as Keyof<I> });
                    break;
                default:
                    break;
            }
        }

        if (isSelect) {
            return async (item: Dict, tx: Tx) => {
                if (!parseWhere(whereClause, item)) return undefined;
                const temp: Dict = {};
                for (const { key, getValue } of getters) {
                    temp[key] = getValue
                        ? await getValue(item[key] as ValidKey, tx)
                        : item[key];
                }
                return temp;
            };
        } else {
            return async (item: Dict, tx: Tx) => {
                if (!parseWhere(whereClause, item)) return undefined;
                for (const { key, getValue } of getters) {
                    item[key] = await getValue!(item[key] as ValidKey, tx);
                }
                return item;
            };
        }
    } else return (item) => (parseWhere(whereClause, item) ? item : undefined);
}

export function getAccessedStores<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>,
>(
    name: ModelNames,
    query: Dict,
    isMutation: boolean,
    client: DbClient<string, ModelNames, Models>,
): Set<ModelNames> {
    let stores: Set<ModelNames> = new Set([name]);
    if (isMutation) {
        const model = client.getModel(name);
        for (const key in query) {
            const relation = model.getRelation<ModelNames>(key);
            const item = toArray(query[key]);

            if (!relation) continue;

            for (const subItem of item as Dict[]) {
                if (subItem && typeof subItem === "object") {
                    for (const conKey in subItem) {
                        if (!Object.hasOwn(subItem, conKey)) continue;

                        switch (conKey as MutationAction) {
                            case "$connect":
                            case "$connectMany":
                            case "$disconnect":
                            case "$disconnectMany":
                            case "$disconnectAll":
                                stores.add(relation.to);
                                break;
                            case "$delete":
                            case "$deleteMany":
                            case "$deleteAll":
                                unionSets(
                                    stores,
                                    model.getDeletedStores(client),
                                );
                                break;
                            case "$create":
                                unionSets(
                                    stores,
                                    getAccessedStores(
                                        relation.to,
                                        subItem[conKey] as Dict,
                                        isMutation,
                                        client,
                                    ),
                                );
                                break;
                            case "$createMany": {
                                (
                                    subItem[conKey] as AddMutation<
                                        ModelNames,
                                        ModelNames,
                                        Models[ModelNames],
                                        Models
                                    >[]
                                ).forEach((value) =>
                                    unionSets(
                                        stores,
                                        getAccessedStores(
                                            relation.to,
                                            value,
                                            isMutation,
                                            client,
                                        ),
                                    ),
                                );
                                break;
                            }
                            case "$update":
                                unionSets(
                                    stores,
                                    getAccessedStores(
                                        relation.to,
                                        (
                                            subItem[conKey] as UpdateMutation<
                                                ModelNames,
                                                ModelNames,
                                                Models[ModelNames],
                                                Models
                                            >
                                        ).data,
                                        isMutation,
                                        client,
                                    ),
                                );
                                break;
                            case "$updateMany": {
                                (
                                    subItem[conKey] as UpdateMutation<
                                        ModelNames,
                                        ModelNames,
                                        Models[ModelNames],
                                        Models
                                    >[]
                                ).forEach((value) =>
                                    unionSets(
                                        stores,
                                        getAccessedStores(
                                            relation.to,
                                            value.data,
                                            isMutation,
                                            client,
                                        ),
                                    ),
                                );
                                break;
                            }
                        }
                    }
                }
            }
        }
    } else {
        const model = client.getModel(name);
        for (const key in query) {
            const relation = model.getRelation<ModelNames>(key);
            if (relation) {
                switch (typeof query[key]) {
                    case "object":
                        unionSets(
                            stores,
                            getAccessedStores(
                                relation.to,
                                getSearchableQuery(
                                    query[key] as QueryInput<string, any, any>,
                                ),
                                false,
                                client,
                            ),
                        );
                        break;
                    case "boolean":
                        stores.add(relation.to);
                        break;
                    default:
                        break;
                }
            }
        }
    }
    return stores;
}

export function getSearchableQuery(q: QueryInput<string, any, any>) {
    return q.select ? q.select : q.include ? q.include : {};
}

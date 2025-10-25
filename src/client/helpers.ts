import type { Dict, Keyof, ValidKey } from "../types/common.js";
import { getKeys, identity, toArray, unionSets } from "../utils.js";
import equal from "@gilbarbara/deep-equal";
import type { DbClient } from "./index.ts";
import type { CollectionObject } from "../builder.ts";
import type { AddMutation } from "./types/mutation.ts";
import type { QueryInput } from "./types/find.ts";
import type { Transaction } from "../transaction.js";
import type { Arrayable, Promisable } from "type-fest";
import { InvalidItemError } from "../error.js";
import { FieldTypes } from "../field/field-types.js";

export function generateWhereClause(where?: Dict): (obj: unknown) => boolean {
    if (!where) return () => true;
    const checkFns: [key: string, fn: (value: unknown) => boolean][] = [];
    for (const whereKey in where) {
        if (!Object.hasOwn(where, whereKey)) continue;

        switch (typeof where[whereKey]) {
            case "function":
                checkFns.push([whereKey, where[whereKey] as () => boolean]);
                break;
            case "boolean":
            case "string":
            case "number":
                checkFns.push([whereKey, (value) => value === where[whereKey]]);
                break;
            default:
                checkFns.push([
                    whereKey,
                    (value) => equal(value, where[whereKey]),
                ]);
        }
    }

    return (obj: unknown) => {
        if (!obj || typeof obj !== "object") return false;
        for (const item of checkFns) {
            if (!item[1]((obj as Dict)[item[0]])) return false;
        }
        return true;
    };
}

export function generateSelector<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>,
    Db extends DbClient<string, ModelNames, Models>,
    Q extends QueryInput<ModelNames, any, Models> = QueryInput<
        ModelNames,
        any,
        Models
    >
>(
    name: ModelNames,
    client: Db,
    query: Q = {} as Q,
    initTx?: Transaction<IDBTransactionMode, ModelNames>
): (
    item: Dict,
    tx: Transaction<IDBTransactionMode, ModelNames>
) => Promisable<Dict | undefined> {
    type Tx = Transaction<IDBTransactionMode, ModelNames>;
    const model = client.getModel(name);

    if (query.include && query.select) {
        throw initTx
            ? initTx.abort(
                  new InvalidItemError(
                      "include and select cannot both be defined"
                  )
              )
            : new InvalidItemError("include and select cannot both be defined");
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
                                  initTx
                              )
                            : identity;
                    if (relation.isArray) {
                        const fn = async (ids: ValidKey[], tx: Tx) => {
                            const result: Dict[] = [];
                            const store = tx.getStore(relation.to);
                            for (const id of ids) {
                                const res = await subSelectFn(
                                    await store.get(id),
                                    tx
                                );
                                if (res) {
                                    result.push(res);
                                }
                            }
                            return result;
                        };
                        getters.push({
                            key: key as Keyof<I>,
                            getValue: fn as (
                                value: Arrayable<ValidKey>,
                                tx: Tx
                            ) => Promise<unknown>,
                        });
                    } else {
                        const fn = async (id: ValidKey, tx: Tx) =>
                            await subSelectFn(
                                await tx.getStore(relation.to).get(id),
                                tx
                            );

                        getters.push({
                            key: key as Keyof<I>,
                            getValue: fn as (
                                value: Arrayable<ValidKey>,
                                tx: Tx
                            ) => Promise<unknown>,
                        });
                    }
                    break;
                }
                case FieldTypes.Field:
                case FieldTypes.PrimaryKey:
                    if (isSelect) getters.push({ key: key as Keyof<I> });
                    break;
                default:
                    break;
            }
        }

        if (isSelect) {
            return async (item: Dict, tx: Tx) => {
                if (!whereClause(item)) return undefined;
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
                if (!whereClause(item)) return undefined;
                for (const { key, getValue } of getters) {
                    item[key] = await getValue!(item[key] as ValidKey, tx);
                }
                return item;
            };
        }
    } else return identity;
}

export function getAccessedStores<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>
>(
    name: ModelNames,
    query: Dict,
    type: "mutation" | "query",
    client: DbClient<string, ModelNames, Models>
): Set<ModelNames> {
    const stores: Set<ModelNames> = new Set([name]);
    if (type === "mutation") {
        const keys = getKeys(query);
        const model = client.getModel(name);
        for (const key of keys) {
            const relation = model.getRelation<ModelNames>(key);
            const item = toArray(query[key]);

            if (!relation) continue;

            for (const subItem of item as Dict[]) {
                if (subItem && typeof subItem === "object") {
                    for (const conKey in subItem) {
                        if (!Object.hasOwn(subItem, conKey)) continue;

                        switch (conKey) {
                            case "$connect":
                            case "$connectMany":
                            case "$disconnect":
                            case "$disconnectMany":
                                stores.add(relation.to);
                                break;
                            case "$delete":
                            case "$deleteMany":
                                unionSets(
                                    stores,
                                    model.getDeletedStores(client)
                                );
                                break;
                            case "$create":
                                unionSets(
                                    stores,
                                    getAccessedStores(
                                        relation.to,
                                        subItem[conKey] as Dict,
                                        type,
                                        client
                                    )
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
                                            type,
                                            client
                                        )
                                    )
                                );
                                break;
                            }
                            // TODO: Complete these
                            case "$update":
                            case "$updateMany": {
                                break;
                            }
                            default:
                                break;
                        }
                    }
                }
            }
        }
    } else {
        const model = client.getModel(name);
        for (const key of getKeys(query)) {
            const relation = model.getRelation<ModelNames>(key);
            if (relation) {
                switch (typeof query[key]) {
                    case "object":
                        unionSets(
                            stores,
                            getAccessedStores(
                                relation.to,
                                getSearchableQuery(
                                    query[key] as QueryInput<any, any, any>
                                ),
                                "query",
                                client
                            )
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

export function getSearchableQuery(q: QueryInput<any, any, any>) {
    return q.include ? q.include : q.select ? q.select : {};
}

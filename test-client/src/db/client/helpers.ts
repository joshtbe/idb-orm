import z from "zod";
import type { Dict, Key, ValidKey } from "../types.ts";
import { getKeys, handleRequest, identity, toArray } from "../utils.ts";
import equal from "@gilbarbara/deep-equal";
import type { DbClient } from "./index.ts";
import type { CollectionObject } from "../builder.ts";
import type { MutationQuery } from "./types/mutation.ts";
import type { SelectObject } from "./types/find.ts";
import type { Transaction } from "../transaction.ts";
import type { Arrayable } from "type-fest";

export function generateWhereClause(where: Dict) {
    const checkFns: { key: string; fn: (value: unknown) => boolean }[] = [];
    for (const whereKey of getKeys(where)) {
        switch (typeof where[whereKey]) {
            case "function":
                checkFns.push({
                    key: whereKey,
                    fn: where[whereKey] as () => boolean,
                });
                break;
            case "boolean":
            case "string":
            case "number":
                checkFns.push({
                    key: whereKey,
                    fn: (value) => value === where[whereKey],
                });
                break;
            default:
                checkFns.push({
                    key: whereKey,
                    fn: (value) => equal(value, where[whereKey]),
                });
        }
    }
    return (obj: unknown) => {
        if (!obj || typeof obj !== "object") return false;
        for (const { key, fn } of checkFns) {
            if (!fn((obj as Dict)[key])) return false;
        }
        return true;
    };
}

export function generateSelectClause<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>,
    Db extends DbClient<string, ModelNames, Models>,
    S extends SelectObject<ModelNames, any, Models> = SelectObject<
        ModelNames,
        any,
        Models
    >
>(name: ModelNames, client: Db, select: S) {
    type Tx = Transaction<any, ModelNames>;
    const model = client.getModel(name);
    const includedKeys: {
        key: Key<S>;
        getValue?: (value: Arrayable<ValidKey>, tx: Tx) => Promise<unknown>;
    }[] = [];
    const keys = getKeys(select);
    if (keys.length === 0) return identity;

    for (const key of keys) {
        // If for whatever reason they put 'false'
        if (!select[key]) continue;

        switch (model.keyType(key)) {
            case "Relation": {
                const relation = model.getRelation<ModelNames>(key)!;
                const hasSelectObject = typeof select[key] === "object";

                // Create sub function
                const subSelectFn = hasSelectObject
                    ? generateSelectClause(
                          relation.to,
                          client as any,
                          select[key]
                      )
                    : identity;
                if (relation.isArray) {
                    const fn = async (ids: ValidKey[], tx: Tx) => {
                        const result: Dict[] = [];
                        const store = tx.objectStores[relation.to];
                        for (const id of ids) {
                            result.push(
                                await subSelectFn(
                                    await handleRequest(store.get(id)),
                                    tx
                                )
                            );
                        }
                        return result;
                    };
                    includedKeys.push({ key, getValue: fn as any });
                } else {
                    const fn = async (id: ValidKey, tx: Tx) =>
                        await subSelectFn(
                            await handleRequest(
                                tx.objectStores[relation.to].get(id)
                            ),
                            tx
                        );

                    includedKeys.push({ key, getValue: fn as any });
                }
                break;
            }
            case "Field":
            case "Primary":
                includedKeys.push({ key });
                break;
            default:
                break;
        }
    }

    return async (item: Dict, tx: Tx) => {
        const result: Dict = {};
        for (const { key, getValue } of includedKeys) {
            result[key] = getValue
                ? await getValue(item[key] as ValidKey, tx)
                : item[key];
        }
        return result;
    };
}

export function getAccessedStores<
    ModelNames extends string,
    Models extends CollectionObject<ModelNames>
>(
    name: ModelNames,
    query: Dict,
    type: "mutation" | "query",
    client: DbClient<string, ModelNames, Models>
): ModelNames[] {
    const stores: ModelNames[] = [name];
    if (type === "mutation") {
        const keys = getKeys(query);
        for (const key of keys) {
            const relation = client.getModel(name).getRelation<ModelNames>(key);
            const item = toArray(query[key]);

            for (const subItem of item as object[]) {
                if (relation && subItem && typeof subItem === "object") {
                    for (const conKeys of getKeys(subItem)) {
                        switch (conKeys) {
                            case "$connect":
                            case "$connectMany":
                                stores.push(relation.to);
                                break;
                            case "$create":
                                stores.push(
                                    ...getAccessedStores(
                                        relation.to,
                                        subItem[conKeys],
                                        type,
                                        client
                                    )
                                );
                                break;
                            case "$createMany": {
                                const items = (
                                    subItem[conKeys] as MutationQuery<
                                        ModelNames,
                                        ModelNames,
                                        Models[ModelNames],
                                        Models
                                    >[]
                                ).reduce((prev, i) => {
                                    prev.push(
                                        ...getAccessedStores(
                                            relation.to,
                                            i,
                                            type,
                                            client
                                        )
                                    );
                                    return prev;
                                }, [] as ModelNames[]);
                                stores.push(...items);
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
            if (model.keyType(key) === "Relation") {
                switch (typeof query[key]) {
                    case "object":
                        stores.push(
                            ...getAccessedStores(
                                model.getRelation(key)!.to as ModelNames,
                                query[key] as Dict,
                                "query",
                                client
                            )
                        );
                        break;
                    case "boolean":
                        stores.push(model.getRelation(key)!.to as ModelNames);
                        break;
                    default:
                        break;
                }
            }
        }
    }
    return stores;
}

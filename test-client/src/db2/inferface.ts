import { z } from "zod";
import {
    BaseRelation,
    PrimaryKey,
    type Field,
    type GetPrimaryKeyType,
    type OptionalRelation,
    type Relation,
    type RelationArray,
} from "./field.ts";
import type {
    CollectionGeneric,
    GetPrimaryKey,
    Keys,
    Model,
    ModelCollection,
    ModelFields,
    RelationValue,
    ResolvedModel,
    ResolvedModelSchema,
} from "./model.ts";
import type {
    ConnectionObject,
    Dict,
    If,
    MakeOptional,
    OnlyString,
    RemoveNeverValues,
} from "./types.ts";
import type { DbClient } from "./client.ts";
import type { PartialOnUndefinedDeep, RequireExactlyOne } from "type-fest";
import { addToSet, getKeys, handleRequest } from "./utils.ts";
import type { Transaction } from "./transaction.ts";
import { ErrorType } from "./error.ts";

export type InterfaceMap<C extends CollectionGeneric> = {
    [K in Keys<C>[number]]: StoreInterface<
        K,
        C,
        ResolvedModel<C["models"][K]["fields"], C["models"]>,
        GetPrimaryKey<C["models"][K]["fields"]>
    >;
};

// TODO: Allow for relations within the same model to have deeper references
type FindRelationKey<
    From extends string,
    F extends ModelFields<any>,
    N extends string
> = {
    [K in keyof F]: F[K] extends BaseRelation<From, infer Name>
        ? Name extends N
            ? K
            : never
        : never;
}[keyof F];

type AddItem<
    T extends object,
    Models extends CollectionGeneric,
    This extends string
> = PartialOnUndefinedDeep<
    RemoveNeverValues<
        T extends Model<infer Fields, any, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends BaseRelation<
                      infer Place,
                      infer Name
                  >
                      ? Place extends keyof Models["models"]
                          ? MakeOptional<
                                Fields[K] extends OptionalRelation<any, any>
                                    ? true
                                    : Fields[K] extends RelationArray<any, any>
                                    ? true
                                    : false,
                                | {
                                      $connect: RelationValue<
                                          Place,
                                          Models["models"]
                                      >;
                                  }
                                | {
                                      $create: Omit<
                                          AddItem<
                                              Models["models"][Place],
                                              Models,
                                              Place
                                          >,
                                          FindRelationKey<
                                              This,
                                              Models["models"][Place]["fields"],
                                              Name
                                          >
                                      >;
                                  }
                                | If<
                                      Fields[K] extends RelationArray<any, any>
                                          ? true
                                          : false,
                                      | {
                                            $connectMany: RelationValue<
                                                Place,
                                                Models["models"]
                                            >[];
                                        }
                                      | {
                                            $createMany: Omit<
                                                AddItem<
                                                    Models["models"][Place],
                                                    Models,
                                                    Place
                                                >,
                                                FindRelationKey<
                                                    This,
                                                    Models["models"][Place]["fields"],
                                                    Name
                                                >
                                            >[];
                                        },
                                      never
                                  >
                            >
                          : never
                      : Fields[K] extends Field<infer Type>
                      ? Type
                      : Fields[K] extends PrimaryKey<infer IsAuto, infer Type>
                      ? IsAuto extends true
                          ? never
                          : Type | undefined
                      : never;
              }
            : never
    >
>;

export default class StoreInterface<
    Name extends string,
    Collection extends CollectionGeneric,
    Struct extends ResolvedModel<
        Collection["models"][Name]["fields"],
        Collection["models"]
    >,
    Primary extends keyof Struct = GetPrimaryKey<Collection["models"][Name]>,
    KeyObj extends PrimaryKey<
        any,
        any
    > = Collection["models"][Name]["fields"][Primary]
> {
    private primaryKey: KeyObj;
    private readonly linkKeys: Map<string, keyof Collection["models"]>;

    constructor(
        public readonly name: Name,
        private readonly client: DbClient<Collection, InterfaceMap<Collection>>,
        public readonly model: Collection["models"][Name],
        public readonly schema: ResolvedModelSchema<
            Collection["models"][Name]["fields"],
            Collection["models"]
        >
    ) {
        this.primaryKey = this.model.fields[this.model.primaryKey];
        this.linkKeys = new Map();
        for (const key in model.fields) {
            if (!Object.hasOwn(model.fields, key)) continue;
            const element = model.fields[key];
            if (element instanceof BaseRelation) {
                this.linkKeys.set(key, element.to);
            }
        }
    }

    async add(
        mutation: AddItem<Collection["models"][Name], Collection, Name>,
        _state: {
            tx?: Transaction<"readwrite">;
            accessed?: Keys<Collection>;
        } = {}
    ) {
        let { tx, accessed } = _state;
        const stores =
            accessed ??
            StoreInterface.getAccessedStores<
                Collection["models"][Name],
                Collection
            >(
                this.name,
                this.client.collection,
                this.client,
                mutation as AddItem<
                    Collection["models"][Name],
                    Collection,
                    string
                >
            );

        if (tx && !tx.contains(stores)) {
            throw tx.abort(
                ErrorType.INVALID_TX,
                `Transaction does not have permission to access store '${this.name}'`
            );
        } else if (!tx) {
            tx = this.client.transaction("readwrite", stores);
        }

        const toAdd: Record<string, unknown> = {};
        const keys = getKeys(mutation);
        const objectStore = tx.objectstore(this.name);
        for (const key of keys) {
            const element = mutation[key];
            // If it's the primary key
            if (
                this.model.primaryKey === key &&
                typeof element === typeof this.primaryKey.type
            ) {
                toAdd[key] = element;
            }
            // If it's a relation
            else if (this.linkKeys.has(key)) {
                if (StoreInterface.isConnectionObj(element)) {
                    const keys = getKeys(element);
                    for (const key of keys) {
                    }
                } else {
                    throw tx.abort(
                        ErrorType.INVALID_ITEM,
                        "Connection object not found"
                    );
                }
            }
            // If it's a regular field
            else {
                const parse = this.schema[key].safeParse(element);
                if (!parse.success) {
                    throw tx.abort(
                        ErrorType.INVALID_ITEM,
                        `Key '${key}' is an invalid for the expected field: ${z.prettifyError(
                            parse.error
                        )}`
                    );
                }
                toAdd[key] = parse.data;
            }
        }

        // If the primary key is not autoincremented and there's a generator
        if (!toAdd[this.model.primaryKey] && !this.primaryKey.autoIncrement) {
            toAdd[this.model.primaryKey] = this.primaryKey.genKey();
        }

        const result = await handleRequest(objectStore.add(toAdd));
        return result as Struct[Primary];
    }

    generateKey(): GetPrimaryKeyType<KeyObj> {
        if (this.primaryKey.autoIncrement) {
            return Number.MAX_SAFE_INTEGER as any;
        } else {
            return this.primaryKey.genKey();
        }
    }

    private static isConnectionObj(value: unknown): value is ConnectionObject {
        return typeof value === "object";
    }

    private static getAccessedStores<
        M extends object,
        C extends CollectionGeneric
    >(
        model: keyof C["models"],
        collection: C,
        client: DbClient<C>,
        query: AddItem<M, C, string>
    ): Keys<C> {
        const result = new Set([model]);
        const modelFields = collection.models[model as Keys<C>[number]]
            .fields as ModelFields;

        const links = client.stores[model as any].linkKeys;

        for (const subKey in query) {
            if (!Object.hasOwn(query, subKey)) continue;
            const element = query[subKey];
            if (
                element &&
                typeof element === "object" &&
                links.has(subKey) &&
                modelFields[subKey] instanceof BaseRelation
            ) {
                const rec = element as Record<string, unknown>;
                if (rec["$create"]) {
                    addToSet(
                        result,
                        StoreInterface.getAccessedStores(
                            modelFields[subKey].to,
                            collection,
                            client,
                            rec["$create"] as never
                        )
                    );
                } else if (
                    rec["$createMany"] &&
                    Array.isArray(rec["$createMany"])
                ) {
                    for (const creation of rec["$createMany"]) {
                        addToSet(
                            result,
                            StoreInterface.getAccessedStores(
                                modelFields[subKey].to,
                                collection,
                                client,
                                creation as never
                            )
                        );
                    }
                } else {
                    result.add(modelFields[subKey].to);
                }
            }
        }

        return Array.from(result) as Keys<C>;
    }
}

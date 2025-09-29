import type { PartialOnUndefinedDeep } from "type-fest";
import type { CollectionObject, CompiledDb } from "./builder";
import type {
    Dict,
    DoesExtend,
    If,
    MakeOptional,
    RemoveNeverValues,
    ValidKey,
} from "./types";
import type {
    FindRelationKey,
    Model,
    ModelStructure,
    PrimaryKeyType,
    RelationValue,
} from "./base-model";
import type {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    RelationArray,
} from "./field";
import { getKeys, handleRequest } from "./utils";
import { Transaction } from "./transaction";
import z from "zod";

type MutationQuery<
    This extends All,
    All extends string,
    Struct extends object,
    C extends CollectionObject<All>
> = PartialOnUndefinedDeep<
    RemoveNeverValues<
        Struct extends Model<any, infer Fields, any>
            ? {
                  [K in keyof Fields]: Fields[K] extends Field<any, infer Input>
                      ? Input
                      : Fields[K] extends PrimaryKey<infer IsAuto, infer Type>
                      ? IsAuto extends true
                          ? never
                          : Type | undefined
                      : Fields[K] extends BaseRelation<infer To, infer Name>
                      ? To extends All
                          ? MakeOptional<
                                If<
                                    DoesExtend<
                                        Fields[K],
                                        OptionalRelation<any, any>
                                    >,
                                    true,
                                    DoesExtend<
                                        Fields[K],
                                        RelationArray<any, any>
                                    >
                                >,
                                | {
                                      $connect: RelationValue<To, C>;
                                  }
                                | {
                                      $create: Omit<
                                          MutationQuery<To, All, C[To], C>,
                                          FindRelationKey<This, Name, C[To]>
                                      >;
                                  }
                                | If<
                                      DoesExtend<
                                          Fields[K],
                                          RelationArray<any, any>
                                      >,
                                      | {
                                            $connectMany: RelationValue<
                                                To,
                                                C
                                            >[];
                                        }
                                      | {
                                            $createMany: Omit<
                                                MutationQuery<
                                                    To,
                                                    All,
                                                    C[To],
                                                    C
                                                >,
                                                FindRelationKey<
                                                    This,
                                                    Name,
                                                    C[To]
                                                >
                                            >[];
                                        },
                                      never
                                  >
                            >
                          : never
                      : never;
              }
            : never
    >
>;

type InsertMutation<N extends string, C extends Dict> = C[N] extends Model<
    N,
    infer F,
    any
>
    ? ModelStructure<F, C>
    : never;

interface StoreInterface<
    Name extends Names,
    Names extends string,
    C extends CollectionObject<Names>
> {
    add(
        mutation: MutationQuery<Name, Names, C[Name], C>
    ): Promise<PrimaryKeyType<C[Name]>>;
    get(): Promise<void>;
    getAll(): Promise<void>;
    update(mutation: MutationQuery<Name, Names, C[Name], C>): Promise<void>;
    put(): Promise<void>;
    insert(item: InsertMutation<Name, C>): Promise<PrimaryKeyType<C[Name]>>;
}

type InterfaceMap<Names extends string, C extends CollectionObject<Names>> = {
    [K in Names]: StoreInterface<K, Names, C>;
};

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

    private getSchema(modelName: ModelNames) {
        return this.models.schemas[modelName];
    }

    private getModel<N extends ModelNames>(name: N) {
        return this.models.getModel(name);
    }

    private getAccessedStores<N extends ModelNames>(
        name: N,
        query: MutationQuery<N, ModelNames, Models[N], Models>
    ): ModelNames[] {
        const stores: ModelNames[] = [name];
        const keys = getKeys(query);
        for (const key of keys) {
            const relation = this.getModel(name).getRelation(key);
            const item = query[key];
            if (relation && item && typeof item === "object") {
                for (const conKeys of getKeys(item)) {
                    switch (conKeys) {
                        case "$create":
                            stores.push(
                                ...this.getAccessedStores(
                                    relation.to,
                                    item[conKeys] as any
                                )
                            );
                            break;
                        case "$createMany":
                            const items = (
                                item[conKeys] as MutationQuery<
                                    N,
                                    ModelNames,
                                    Models[N],
                                    Models
                                >[]
                            ).reduce((prev, i) => {
                                prev.push(
                                    ...this.getAccessedStores(relation.to, i)
                                );
                                return prev;
                            }, [] as ModelNames[]);
                            stores.push(...items);
                            break;
                        case "$connectMany":
                        case "$connect":
                            stores.push(relation.to);
                            break;
                        default:
                            break;
                    }
                }
            }
        }

        return stores;
    }

    private createInterface<N extends ModelNames>(
        modelName: N
    ): StoreInterface<N, ModelNames, Models> {
        return {
            add: async (item) => await this.add(modelName, item),
            get: async () => {},
            getAll: async () => {},
            update: async () => {},
            put: async () => {},
            insert: async () => 5 as any,
        };
    }

    private async add<N extends ModelNames>(
        name: N,
        item: MutationQuery<N, ModelNames, Models[N], Models>,
        _state: Partial<{
            tx: Transaction<"readwrite", string>;
            accessed: ModelNames[];
            relation: { id: ValidKey; key: string };
        }> = {}
    ) {
        // Local type declaration for ease of use
        type T = typeof item;
        let { tx, accessed, relation } = _state;
        accessed = accessed ?? this.getAccessedStores(name, item);
        tx = tx ?? new Transaction(this.db, accessed, "readwrite");

        // Quickly create the item just to get the id
        const objectStore = tx.objectstore(name);
        const model = this.getModel(name);
        const primaryKey = model.getPrimaryKey();
        const relationAdd = relation ? { [relation.key]: relation.id } : {};
        const initAdd: object = primaryKey.autoIncrement
            ? {
                  ...relationAdd,
              }
            : {
                  ...relationAdd,
                  [model.primaryKey]:
                      item[model.primaryKey as keyof T] ?? primaryKey.genKey(),
              };
        const id = await handleRequest(objectStore.add(initAdd));

        const toAdd: Dict = {};
        for (const key of getKeys(item)) {
            const element = item[key];
            switch (model.keyType(key)) {
                case "None":
                    throw tx.abort(
                        "INVALID_ITEM",
                        `Key '${key}' does ont exist on model '${name}'`
                    );
                case "Field":
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
                case "Relation": {
                    const firstKey = getKeys(element as Dict)[0];
                    if (!firstKey)
                        throw tx.abort(
                            "INVALID_ITEM",
                            `Key '${key}' cannot be an empty connection object`
                        );
                    const relation = model.getRelation(key)!;
                    const otherModel = this.getModel(relation.to);
                    switch (firstKey) {
                        case "$connect": {
                            // Modify item so that it references the new item
                            break;
                        }
                        case "$connectMany": {
                            break;
                        }
                        case "$create": {
                            // Create the new item and have it reference this one
                            break;
                        }
                        case "$createMany": {
                            break;
                        }
                        default:
                            throw tx.abort(
                                "INVALID_ITEM",
                                `Connection Object on key '${key}' has an unknown key '${firstKey}'`
                            );
                            break;
                    }
                    break;
                }
                // We already added the primary key
                case "Primary":
                default:
                    break;
            }
        }
        return (await handleRequest(
            objectStore.put({ [model.primaryKey]: id, ...toAdd })
        )) as PrimaryKeyType<Models[N]>;
    }
}

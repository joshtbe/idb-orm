import z, { ZodAny, ZodObject, ZodType } from "zod";
import { Field, Link, type FieldOutput } from "./field.js";
import {
    getKeys,
    handleRequest,
    makeFieldOptional,
    removeDuplicates,
} from "./utils.js";
import type {
    Arrayable,
    PartialOnUndefinedDeep,
    Primitive,
    SetOptional,
} from "type-fest";
import { Transaction } from "./transaction";
import { ErrorType } from "./error.js";
import type { MakeOptional, OnlyString } from "./types.js";

type FieldItem<T extends string = string> =
    | Link<T, boolean>
    | Field<unknown, boolean>;
type FieldList<Names extends string> = Record<string, FieldItem<Names>>;

type ToSchema<M, C> = C extends CollectionList<any, infer Models>
    ? M extends Model<any, infer Fields, any>
        ? {
              [K in keyof Fields]: Fields[K] extends Field<any>
                  ? FieldOutput<Fields[K]>
                  : false;
          }
        : never
    : never;

type GetPrimaryKey<T extends object> = T extends Model<any, infer Fields, any>
    ? GetPrimaryKey<Fields>
    : {
          [K in keyof T]: T[K] extends Field<string | number, infer IsPrimary>
              ? IsPrimary extends true
                  ? IsPrimary extends false
                      ? never
                      : Extract<K, string>
                  : never
              : never;
      }[keyof T];

type FieldType<T, K, C> = T extends Model<any, infer Fields, any>
    ? FieldType<Fields, K, C>
    : C extends Record<string, Model<any, any, any>>
    ? T extends FieldList<any>
        ? K extends keyof T
            ? T[K] extends Link<infer To, infer Opt>
                ? C[To] extends Model<any, infer LinkFields, infer PrimaryKey>
                    ? LinkFields[PrimaryKey] extends Field<infer LinkType, true>
                        ? MakeOptional<Opt, LinkType>
                        : never
                    : never
                : T[K] extends Field<infer Type, any>
                ? Type
                : never
            : never
        : never
    : never;

type GetModelStructure<M, C> = M extends Model<any, infer Fields, infer Primary>
    ? C extends Record<string, Model<any, any, any>>
        ? {
              [K in keyof Fields]: Fields[K] extends Link<
                  infer To,
                  infer Optional
              >
                  ? C[To] extends Model<any, infer LinkFields, infer PrimaryKey>
                      ? LinkFields[PrimaryKey] extends Field<
                            infer LinkType,
                            true
                        >
                          ? MakeOptional<Optional, LinkType>
                          : never
                      : never
                  : Fields[K] extends Field<infer Type, any>
                  ? Type
                  : never;
          }
        : never
    : never;

type GetModelSchema<F, C> = F extends FieldList<any>
    ? C extends Record<string, Model<any, any, any>>
        ? {
              [K in keyof F]: F[K] extends Field<infer Type, any>
                  ? z.ZodType<Type>
                  : F[K] extends Link<infer To, infer Optional>
                  ? To extends keyof C
                      ? C[To] extends Model<
                            any,
                            infer LinkFields,
                            infer PrimaryKey
                        >
                          ? LinkFields[PrimaryKey] extends Field<
                                infer LinkType,
                                true
                            >
                              ? z.ZodType<MakeOptional<Optional, LinkType>>
                              : never
                          : never
                      : never
                  : never;
          }
        : never
    : never;
type ModelSchemas<List> = List extends Record<infer Keys, Model<any, any, any>>
    ? {
          [K in Keys]: List[K] extends Model<any, infer Fields, any>
              ? GetModelSchema<Fields, List>
              : never;
      }
    : never;

export class Model<
    OtherNames extends string,
    Fields extends FieldList<OtherNames>,
    PrimaryKey extends GetPrimaryKey<Fields>
> {
    public readonly fields: Fields;
    public readonly primaryKey: PrimaryKey;
    constructor(fields: Fields) {
        this.fields = fields;
        this.primaryKey = "" as PrimaryKey;
        for (const key in fields) {
            if (
                Object.prototype.hasOwnProperty.call(fields, key) &&
                fields[key] instanceof Field &&
                fields[key].isPrimary
            ) {
                this.primaryKey = key as string as PrimaryKey;
                break;
            }
        }
        if (!this.primaryKey) throw "Primary Key not found";
    }
}

type QueryObj<T, Stores extends Record<string, unknown>> = T extends
    | Field<any>
    | z.ZodType
    ? boolean
    : T extends Link<infer Name>
    ? QueryObj<Stores[Name], Stores> | boolean
    : {
          [K in keyof T]?: QueryObj<T[K], Stores>;
      };

type NameMap<
    T extends Record<string, Model<Extract<keyof T, string>, any, any>>
> = {
    [K in keyof T]: Model<
        Extract<Exclude<keyof T, K>, string>,
        T[K]["fields"],
        T[K] extends Model<any, infer _F, infer PrimaryKey> ? PrimaryKey : never
        // T[K]["fields"],
        // never,
    >;
};

type GetConnectionObject<T> = T extends Model<any, any, infer PrimaryKey>
    ? { [K in PrimaryKey]: FieldOutput<T["fields"][K]> }
    : never;

type AddItem<
    T extends object,
    Models extends NameMap<Models>
> = PartialOnUndefinedDeep<
    T extends Model<any, infer Fields, any>
        ? {
              [K in keyof Fields]: Fields[K] extends Link<
                  infer Place,
                  infer Optional
              >
                  ? Place extends keyof Models
                      ? MakeOptional<
                            Optional,
                            | {
                                  $connect: GetConnectionObject<Models[Place]>;
                              }
                            | { $create: AddItem<Models[Place], Models> }
                        >
                      : never
                  : Fields[K] extends Field<infer Type, infer IsPrimary>
                  ? MakeOptional<IsPrimary, Type>
                  : never;
          }
        : never
>;

class StoreInterface<
    Name extends Extract<keyof Models, string>,
    Struct extends GetModelStructure<Models[Name], Models>,
    Models extends NameMap<Models>,
    Primary extends keyof Struct = GetPrimaryKey<Models[Name]>
> {
    public readonly name: Name;
    public readonly client: DbClient<Models>;
    private readonly linkKeys: Map<string, keyof Models>;
    public readonly model: Models[Name];
    public readonly modelSchema: Record<string, ZodType>;
    constructor(store: Name, client: DbClient<Models>, model: Models[Name]) {
        this.name = store;
        this.client = client;
        this.model = model;
        this.modelSchema = this.client.getModelSchema(store);
        this.linkKeys = new Map();
        for (const key in model.fields) {
            if (Object.prototype.hasOwnProperty.call(model.fields, key)) {
                const field = model.fields[key];
                if (field instanceof Link) {
                    this.linkKeys.set(key, field.to);
                }
            }
        }
    }

    isValidField(key: string, tx: Transaction<any>, value: unknown): boolean {
        const f = this.modelSchema[key];
        if (f) {
            const result = f.safeParse(value);
            return result.success;
        } else
            throw tx.abort(
                ErrorType.CUSTOM,
                `Schema for field '${key}' not found`
            );
    }

    async add(
        item: AddItem<Models[Name], Models>,
        _state: {
            tx?: Transaction<"readwrite">;
            accessed?: OnlyString<keyof Models>[];
        } = {}
    ): Promise<Struct[Primary]> {
        let { tx, accessed } = _state;
        const stores =
            accessed ?? removeDuplicates(this.getAddAccessedStores(item));
        if (tx && !this.client.checkTransaction(tx.getInternal(), stores)) {
            throw tx.abort(
                ErrorType.INVALID_TX,
                `Transaction does not have permission to access store '${this.name}'`
            );
        } else if (!tx) {
            // Collect all the transaction types you need
            tx = this.client.transaction("readwrite", stores);
        }

        const toAdd: Record<string, unknown> = {};
        const keys = getKeys(item);
        const objectStore = tx.objectstore(this.name);
        for (const key of keys) {
            const element = item[key];
            if (this.model.primaryKey === key) {
                toAdd[key] = element as Struct[keyof Struct];
            } else if (this.linkKeys.has(key)) {
                // It's a link to another store
                if (typeof element === "object") {
                    const keys = new Set(Object.keys(element));
                    const hasCreate = keys.has("$create");
                    const hasConnect = keys.has("$connect");
                    if (hasCreate && hasConnect) {
                        throw tx.abort(
                            ErrorType.INVALID_ITEM,
                            "You cannot specifify a connection and a create on the same key"
                        );
                    } else if (hasCreate) {
                        const otherStore = this.linkKeys.get(key);
                        if (!otherStore)
                            throw tx.abort(
                                ErrorType.UNKNOWN,
                                `Store for link '${key}' not found`
                            );
                        const result = await this.client.stores[otherStore].add(
                            element["$create"],
                            { tx, accessed: stores }
                        );
                        if (!result) {
                            throw tx.abort(
                                ErrorType.ADD_FAILED,
                                `Item in store '${
                                    otherStore as string
                                }' could not be added`
                            );
                        }
                        toAdd[key] = result;
                    } else if (hasConnect) {
                        // TODO
                    }
                } else
                    throw tx.abort(
                        ErrorType.INVALID_ITEM,
                        "Connection object not found"
                    );
            } else {
                // It's a regular field
                const parse = this.modelSchema[key].safeParse(element);
                if (!parse.success)
                    throw tx.abort(
                        ErrorType.INVALID_ITEM,
                        `Key '${key}' is an invalid for the expected field: ${z.prettifyError(
                            parse.error
                        )}`
                    );
                toAdd[key] = parse.data;
            }
        }
        const result = await handleRequest(objectStore.add(toAdd));
        return result as Struct[Primary];
    }

    public getAddAccessedStores(
        item: AddItem<Models[Name], Models>
    ): Extract<keyof Models, string>[] {
        const result: Extract<keyof Models, string>[] = [this.name];
        const modelFields = this.model.fields as Record<string, FieldItem>;

        for (const subKey in item) {
            const subElement = item[subKey];
            if (
                subElement &&
                typeof subElement === "object" &&
                this.linkKeys.has(subKey) &&
                modelFields[subKey] instanceof Link
            ) {
                const linked =
                    this.client.stores[modelFields[subKey].to as keyof Models];

                if (linked && subElement["$create"]) {
                    // If it's a link
                    result.push(
                        ...linked.getAddAccessedStores(subElement["$create"])
                    );
                } else {
                    result.push(linked.name);
                }
            }
        }

        return result;
    }
}

type StoreInterfaceMap<T extends NameMap<T>> = {
    [K in keyof T]: StoreInterface<
        OnlyString<K>,
        GetModelStructure<T[K], T>,
        T
    >;
};

export class DbClient<Models extends NameMap<Models>> {
    private _db: IDBDatabase;
    private collection: Collection<Models>;
    public stores: StoreInterfaceMap<Models>;
    constructor(db: IDBDatabase, collection: Collection<Models>) {
        this._db = db;
        this.collection = collection;
        const keys = getKeys(collection.models);
        const interfaces = {} as StoreInterfaceMap<Models>;

        for (const key of keys) {
            interfaces[key] = this.createInterface(key);
        }
        this.stores = interfaces;
    }

    // Getters
    get name() {
        return this._db.name;
    }
    get version() {
        return this._db.version;
    }
    get storeNames() {
        return Array.from(this._db.objectStoreNames);
    }

    getModelSchema(key: keyof Models) {
        return this.collection.schemas[key];
    }

    public close() {
        this._db.close();
    }

    private createInterface(store: OnlyString<keyof Models>) {
        return new StoreInterface(store, this, this.collection.models[store]);
    }
    public transaction(
        mode: IDBTransactionMode,
        stores: Arrayable<Extract<keyof Models, string>>
    ) {
        return new Transaction(this._db, stores, mode);
    }

    public checkTransaction(tx: IDBTransaction, stores: Arrayable<string>) {
        if (!Array.isArray(stores)) {
            stores = [stores];
        }
        for (const store of stores) {
            if (!tx.objectStoreNames.contains(store)) {
                return false;
            }
        }
        return true;
    }

    static create<Models extends NameMap<Models>>(
        db: IDBDatabase,
        collection: Collection<Models>
    ): DbClient<Models> {
        return new DbClient(db, collection);
    }
}

type CollectionList<Keys extends string, T extends NameMap<T>> = {
    [K in keyof T]: T[K]["fields"] extends FieldList<any>
        ? Model<
              Extract<Keys, string>,
              T[K]["fields"],
              GetPrimaryKey<T[K]["fields"]>
          >
        : T[K];
};

export class Collection<
    Models extends Record<string, Model<any, any, string>>
> {
    public models: Models;
    public readonly schemas: ModelSchemas<Models>;
    constructor(models: Models) {
        this.models = models;
        this.schemas = {} as any;
        const modelKeys = this.keys();

        // Create the Zod Schema for every model
        for (const key of modelKeys) {
            const fields = this.models[key].fields as FieldList<
                OnlyString<keyof Models>
            >;
            const fieldKeys = getKeys(fields);
            const schema: Record<string, ZodType> = {} as any;
            for (const f of fieldKeys) {
                const field = fields[f];
                if (field instanceof Field) {
                    schema[f] = field.schema;
                } else if (field instanceof Link) {
                    const isOptional = field.isOptional;
                    const otherModel = this.models[field.to];
                    const otherPrimary = otherModel.fields[
                        otherModel.primaryKey
                    ] as Field<number | string>;
                    if (otherPrimary instanceof Field) {
                        schema[f] = otherPrimary.schema;
                        if (isOptional) {
                            schema[f] = schema[f].optional();
                        }
                    } else
                        throw `Primary key '${otherModel.primaryKey}' is not a valid field`;
                } else {
                    throw `Unknown Field value detected: ${JSON.stringify(
                        field
                    )}`;
                }
            }
            (this.schemas as any)[key] = schema;
        }
    }

    async createClient(name: string, version?: number) {
        const openRequest = window.indexedDB.open(name, version);
        openRequest.onupgradeneeded = (event: any) => {
            const db: IDBDatabase = event.target.result;
            const keys = getKeys(this.models);
            for (const key of keys) {
                const model = this.models[key].fields;
                const fields = getKeys(model);
                let primaryKey: { auto: boolean; path: string } | undefined =
                    undefined;
                for (const fieldKey of fields) {
                    const field = model[fieldKey] as FieldItem;
                    if (field instanceof Field && field.isPrimary) {
                        primaryKey = {
                            auto: field.schema.type === "number",
                            path: fieldKey,
                        };
                    }
                }
                if (!primaryKey) {
                    throw `Primary key for model '${key as string}' not found!`;
                }
                db.createObjectStore(key as string, {
                    autoIncrement: primaryKey.auto,
                    keyPath: primaryKey.path,
                });
            }
        };
        const db = await handleRequest(openRequest);
        return DbClient.create(db, this);
    }

    keys(): (keyof Models)[] {
        return Object.keys(this.models);
    }

    static createBuilder<Keys extends string>(stores: readonly Keys[]) {
        return function <T extends NameMap<T>>(
            models: CollectionList<Keys, T>
        ): Collection<CollectionList<Keys, T>> {
            return new Collection(models);
        };
    }
}

type ModelToObject<T extends object, Models extends NameMap<Models>> = {
    [K in keyof T]: T[K] extends Link<infer Place>
        ? Place extends keyof Models
            ? ModelToObject<Models[Place], Models>
            : never
        : T[K] extends Field<infer Type>
        ? Type
        : never;
};

type ExtractModels<CollectionObj extends Collection<any>> = {
    [K in keyof CollectionObj["models"]]: ModelToObject<
        CollectionObj["models"][K],
        CollectionObj["models"]
    >;
};

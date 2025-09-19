import z, { ZodAny, ZodType } from "zod";
import { Field, Link } from "./field.js";
import { handleRequest } from "./utils.js";

interface Model<OtherNames extends string>
    extends Record<string, Link<OtherNames> | Field<any>> {}

type QueryObj<T, Stores extends Record<string, unknown>> = T extends
    | Field<any>
    | z.ZodType
    ? boolean
    : T extends Link<infer Name>
    ? QueryObj<Stores[Name], Stores> | boolean
    : {
          [K in keyof T]?: QueryObj<T[K], Stores>;
      };

type NameMap<T> = {
    [K in keyof T]: Model<Extract<Exclude<keyof T, K>, string>>;
};

class StoreInterface<
    Name extends keyof Models,
    Models extends NameMap<Models>
> {
    private _name: Name;
    private parent: DbClient<Models>;
    constructor(store: Name, client: DbClient<Models>) {
        this._name = store;
        this.parent = client;
    }

    async query(query: QueryObj<Models[Name], Models>) {
        return await this.parent.query(this._name, query);
    }

    getClient() {
        return this.parent;
    }
}

type StoreInterfaceMap<T extends NameMap<T>> = {
    [K in keyof T]: StoreInterface<K, T>;
};

class DbClient<Models extends NameMap<Models>> {
    private _db: IDBDatabase;
    private collection: ModelCollection<Models>;
    public stores: StoreInterfaceMap<Models>;
    constructor(db: IDBDatabase, collection: ModelCollection<Models>) {
        this._db = db;
        this.collection = collection;
        const keys = Object.keys(collection) as (keyof Models)[];
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

    public close() {
        this._db.close();
    }

    private createInterface(store: keyof Models) {
        return new StoreInterface(store, this);
    }

    public async query<P extends keyof Models>(
        path: P,
        query: QueryObj<Models[P], Models>
    ) {}

    static create<Models extends NameMap<Models>>(
        db: IDBDatabase,
        collection: ModelCollection<Models>
    ): DbClient<Models> {
        return new DbClient(db, collection);
    }
}

class ModelCollection<Models extends NameMap<Models>> {
    public models: Models;
    constructor(models: Models) {
        this.models = models;
    }

    async createClient(name: string, version?: number) {
        const openRequest = window.indexedDB.open(name, version);
        const db = await handleRequest(openRequest);
        return DbClient.create(db, this);
    }
}

const x = new ModelCollection({
    hello: {
        id: Field.primaryKey(true),
        other: Field.foreignKey("why_not"),
        sad: Field.number(),
        who: Field.foreignKey("yolo"),
    },
    yolo: {
        test: Field.optional(Field.string()),
        test34234: Field.number(),
    },
    why_not: {
        excuse: Field.optional(Field.array(Field.number())),
        forest: Field.optional(
            Field.object({
                hello: z.string(),
                plz: z.number(),
            })
        ),
    },
    getVersion: {
        test: Field.number(),
    },
});

type ModelToObject<T extends object> = {
    [K in keyof T]: T[K] extends Link<infer Place>
        ? Place
        : T[K] extends Field<infer Type>
        ? Type
        : never;
};

type ExtractModels<Collection extends ModelCollection<any>> = {
    [K in keyof Collection["models"]]: ModelToObject<Collection["models"][K]>;
};

const client = await x.createClient("test_db");
client.stores.hello.query({
    other: {
        excuse: true,
    },
    sad: false,
    who: true,
});

console.log(client)
import { DbClient } from "../client";
import {
    BaseRelation,
    Property,
    FieldTypes,
    PrimaryKey,
    ValidValue,
    ParseResult,
    ValidKey,
    parseType,
} from "../field";
import { Dict, Keyof } from "../util-types";
import { unionSets } from "../utils";
import { AssertionError, InvalidConfigError, InvalidItemError } from "../error";
import { FindPrimaryKey, ModelCache, CollectionObject } from "./model-types";
import { Transaction } from "../transaction";

export abstract class BaseModel<
    Name extends string,
    Fields extends Dict<ValidValue>,
    Primary extends Keyof<Fields>,
> {
    protected static readonly BASE_SYMBOL = Symbol.for("base_model");
    protected readonly baseSymbol = BaseModel.BASE_SYMBOL;

    public abstract readonly primaryKey: Primary;
    /**
     * Set of other models this model links to
     */
    protected abstract readonly relationLinks: ReadonlySet<string>;

    public abstract readonly name: Name;
    /**
     * Array of all the model's fields
     */
    protected abstract readonly fieldKeys: readonly Keyof<Fields>[];

    protected cache: ModelCache = {};

    abstract get<K extends (typeof this.fieldKeys)[number]>(key: K): Fields[K];

    abstract getPrimaryKey(): PrimaryKey<boolean, ValidKey>;

    getRelation<Models extends string>(
        key: (typeof this.fieldKeys)[number],
    ): BaseRelation<Models, string> | undefined {
        const item = this.get(key);
        if (!key || !item || !BaseRelation.is<Models>(item)) return undefined;
        return item;
    }

    keyType(key: (typeof this.fieldKeys)[number]): FieldTypes {
        const f = this.get(key);
        if (!f) return FieldTypes.Invalid;
        else if (Property.is(f)) return FieldTypes.Property;
        else if (BaseRelation.is(f)) return FieldTypes.Relation;
        else if (PrimaryKey.is(f)) return FieldTypes.PrimaryKey;
        else return FieldTypes.Invalid;
    }

    /**
     * Generator for all of the relations present on the model
     */
    *relations<K extends string = string>(): Generator<
        [key: string, relation: BaseRelation<K, string>]
    > {
        for (const key of this.fieldKeys) {
            const item = this.get(key);
            if (BaseRelation.is<K>(item)) {
                yield [key, item];
            }
        }
    }

    /**
     * Generator for all of the entries present on the model
     */
    *entries(): Generator<[key: string, value: ValidValue]> {
        for (const key of this.fieldKeys) {
            yield [key, this.get(key)];
        }
    }

    keys() {
        return this.fieldKeys;
    }

    parseField<K extends (typeof this.fieldKeys)[number]>(
        field: K,
        value: unknown,
    ): ParseResult<any> {
        const item = this.get(field);
        if (Property.is(item)) {
            return parseType(item.type, value);
        } else {
            throw new InvalidConfigError(
                `Key '${field}' on model '${this.name}' is not a property but is being used as a static property.`,
            );
        }
    }

    /**
     * Loads the value for the autoIncrement counter
     *
     * Calling this is only valid if the primary key of this model has the "autoIncrement" property
     * @param client Database client object
     * @param tx Optional transaction to attach
     */
    async loadIncrementCounter<
        ModelNames extends string,
        Models extends CollectionObject<ModelNames>,
    >(
        client: DbClient<string, ModelNames, Models>,
        tx?: Transaction<IDBTransactionMode, ModelNames>,
    ): Promise<void> {
        if (this.cache.autoIncrement) {
            return;
        }

        tx = Transaction.create(
            client.getDb(),
            [this.name as unknown as ModelNames],
            "readonly",
            tx,
        );

        let max = 0;
        await tx
            .getStore(this.name as unknown as ModelNames)
            .openCursor((cursor) => {
                const id = cursor.key as number;
                if (typeof id !== "number") {
                    throw new InvalidItemError(
                        `Document with primary key ${JSON.stringify(cursor.key)} is invalid, expected a number.`,
                    );
                }
                if (id > max) {
                    max = id;
                }

                cursor.continue();
                return true;
            });

        this.cache.autoIncrement = max + 1;
        return;
    }

    /**
     * Get the value for the next autoIncrement counter
     *
     * Calling this is only valid if the primary key of this model has the "autoIncrement" property.
     * @returns Primary key for the next document
     */
    getIncrementCounter(): number {
        if (!this.cache.autoIncrement) {
            throw new AssertionError(
                "AutoIncrement property not found in the cache.",
            );
        }
        return this.cache.autoIncrement++;
    }

    genPrimaryKey(): ValidKey {
        const primaryKey = this.getPrimaryKey();
        if (primaryKey.isAutoIncremented()) {
            return this.getIncrementCounter();
        }
        return primaryKey.genKey();
    }

    getDeletedStores<
        ModelNames extends string,
        Models extends CollectionObject<ModelNames>,
    >(client: DbClient<string, ModelNames, Models>): Set<ModelNames> {
        if (this.cache.delete) return this.cache.delete as Set<ModelNames>;

        const visited = new Set<string>();
        const queue: string[] = [this.name];
        let curModel: Models[ModelNames];
        while (queue.length > 0) {
            const item = queue.shift()!;
            if (visited.has(item)) continue;
            curModel = client.getModel(item as ModelNames);
            const cache = curModel.cache.delete;
            if (cache) {
                unionSets(visited, cache);
            } else {
                visited.add(item);
                // Add to the queue
                for (const link of curModel.relationLinks) {
                    if (!visited.has(link)) {
                        queue.push(link);
                    }
                }
            }
        }

        this.cache.delete = visited;
        return visited as Set<ModelNames>;
    }

    static is<
        Name extends string,
        Fields extends Dict<ValidValue>,
        Primary extends FindPrimaryKey<Fields> = FindPrimaryKey<Fields>,
    >(value: object): value is BaseModel<Name, Fields, Primary> {
        return (
            typeof value === "object" &&
            (value as any)?.baseSymbol === this.BASE_SYMBOL
        );
    }
}

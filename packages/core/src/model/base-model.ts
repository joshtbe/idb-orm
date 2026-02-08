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
    isType,
    TypeTag,
} from "../field";
import { Dict, Keyof } from "../util-types";
import { unionSets } from "../utils";
import { AssertionError, InvalidConfigError, InvalidItemError } from "../error";
import {
    FindPrimaryKey,
    ModelCache,
    CollectionObject,
    ValidDocumentTag,
} from "./model-types";
import { Transaction } from "../transaction";

export abstract class BaseModel<
    Name extends string,
    Fields extends Dict<ValidValue>,
    Primary extends Keyof<Fields>,
> {
    protected static readonly BASE_SYMBOL = Symbol.for("base_model");
    protected readonly baseSymbol = BaseModel.BASE_SYMBOL;

    public abstract readonly primaryKey: Primary;
    public abstract readonly name: Name;

    private built: boolean = false;
    /**
     * Schema validating the document type NOT including any relations
     */
    protected abstract readonly baseSchema: ValidDocumentTag;
    /**
     * Schema validating the document type inclduing any relations
     */
    protected relationSchema?: ValidDocumentTag;
    protected readonly cache: ModelCache = {};

    abstract build(relationMap: Map<BaseRelation<string, any>, TypeTag>): void;
    /**
     * Generator for all of the entries present on the model
     */
    abstract entries(): Generator<[key: string, value: ValidValue]>;
    protected abstract get(key: string): ValidValue;
    abstract getPrimaryKey(): PrimaryKey<boolean, ValidKey>;

    protected buildModel(relationSchema: ValidDocumentTag) {
        if (this.built) {
            throw new InvalidConfigError(
                `Model '${this.name}' cannot be built more than once.`,
            );
        }
        this.relationSchema = relationSchema;
        this.built = true;
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
                for (const [, { to }] of curModel.relations()) {
                    if (!visited.has(to)) {
                        queue.push(to);
                    }
                }
            }
        }

        this.cache.delete = visited;
        return visited as Set<ModelNames>;
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

    getRelation<Models extends string>(
        key: Keyof<Fields>,
    ): BaseRelation<Models, string> | undefined {
        const item = this.get(key);
        if (!key || !item || !BaseRelation.is<Models>(item)) return undefined;
        return item;
    }

    isValid<T = Dict>(test: unknown, includeRelations = true): test is T {
        if (!this.built) return false;
        if (includeRelations) {
            return (
                !!this.relationSchema &&
                isType(this.baseSchema, test) &&
                isType(this.relationSchema, test)
            );
        }
        return isType(this.baseSchema, test);
    }

    keyType(key: Keyof<Fields>): FieldTypes {
        const item = this.get(key);
        if (!item) return FieldTypes.Invalid;
        else if (Property.is(item)) return FieldTypes.Property;
        else if (BaseRelation.is(item)) return FieldTypes.Relation;
        else if (PrimaryKey.is(item)) return FieldTypes.PrimaryKey;
        else return FieldTypes.Invalid;
    }

    *keys() {
        for (const [key] of this.entries()) {
            yield key;
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

    parseField<K extends Keyof<Fields>>(
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
     * Generator for all of the relations present on the model
     */
    *relations<K extends string = string>(): Generator<
        [key: string, relation: BaseRelation<K, string>]
    > {
        for (const [key, item] of this.entries()) {
            if (BaseRelation.is<K>(item)) {
                yield [key, item];
            }
        }
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

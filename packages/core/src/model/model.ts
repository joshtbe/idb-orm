import { CollectionObject } from "../builder.js";
import { DbClient } from "../client/index.js";
import {
    BaseRelation,
    AbstractProperty,
    FieldTypes,
    PrimaryKey,
    ValidValue,
    ParseResult,
} from "../field";
import { Keyof, ValidKey } from "../types/common.js";
import { getKeys, unionSets } from "../utils.js";
import { StoreError } from "../error.js";
import { FindPrimaryKey, ModelCache } from "./model-types.js";

export default class Model<
    Name extends string,
    F extends Record<string, ValidValue>,
    Primary extends FindPrimaryKey<F> = FindPrimaryKey<F>
> {
    private readonly fieldKeys: readonly Keyof<F>[];
    private readonly relationLinks = new Set<string>();
    private cache: ModelCache = {};
    public readonly primaryKey: Primary;
    constructor(public readonly name: Name, private readonly fields: F) {
        this.fieldKeys = getKeys(fields);

        // Generate a set of all models this one is linked to
        for (const key of this.fieldKeys) {
            const item = this.fields[key];
            if (item instanceof BaseRelation) {
                if (item.to !== this.name) {
                    this.relationLinks.add(item.to);
                }
            }
        }

        const primaryKey = this.fieldKeys.find(
            (k) => this.fields[k] instanceof PrimaryKey
        );
        if (!primaryKey)
            throw new StoreError(
                "INVALID_CONFIG",
                `Model ${this.name} has no primary key`
            );
        this.primaryKey = primaryKey as Primary;
    }

    get<K extends Keyof<F>>(key: K): F[K] {
        return this.fields[key];
    }

    getModelField(key: string) {
        const item = this.fields[key];
        if (!item || !(item instanceof AbstractProperty)) return undefined;
        return item;
    }

    getPrimaryKey() {
        return this.fields[this.primaryKey] as PrimaryKey<boolean, ValidKey>;
    }

    getRelation<Models extends string>(
        key: string
    ): BaseRelation<Models, string> | undefined {
        const item = this.fields[key];
        if (!item || !(item instanceof BaseRelation)) return undefined;
        return item as BaseRelation<Models, string>;
    }

    keyType(key: Keyof<F>): FieldTypes {
        const f = this.fields[key];
        if (!f) return FieldTypes.Invalid;
        else if (f instanceof AbstractProperty) return FieldTypes.Field;
        else if (f instanceof BaseRelation) return FieldTypes.Relation;
        else if (f instanceof PrimaryKey) return FieldTypes.PrimaryKey;
        else return FieldTypes.Invalid;
    }

    links<Names extends string = string>() {
        // Shallow-copy the set so it can't be modified accidentally
        return this.relationLinks.keys() as SetIterator<Names>;
    }

    keys() {
        return [...this.fieldKeys];
    }

    parseField<K extends Keyof<F>>(field: K, value: unknown): ParseResult<any> {
        if (this.fields[field] instanceof AbstractProperty) {
            return this.fields[field].validate(value);
        }
        return null as never;
    }

    getDeletedStores<
        ModelNames extends string,
        Models extends CollectionObject<ModelNames>
    >(client: DbClient<string, ModelNames, Models>): Set<ModelNames> {
        if (this.cache.delete) return this.cache.delete as Set<ModelNames>;

        const visited = new Set<ModelNames>();
        const queue: ModelNames[] = [this.name as unknown as ModelNames];
        let curModel: Models[ModelNames];
        while (queue.length > 0) {
            const item = queue.shift()!;
            if (visited.has(item)) continue;
            curModel = client.getModel(item);
            const cache = curModel.cache.delete;
            if (cache) {
                unionSets(visited, cache);
            } else {
                visited.add(item);
                // Add to the queue
                for (const link of curModel.links<ModelNames>()) {
                    if (!visited.has(link)) {
                        queue.push(link);
                    }
                }
            }
        }

        this.cache.delete = visited;
        return visited;
    }
}

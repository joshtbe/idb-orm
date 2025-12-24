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
    GetPrimaryKeyType,
    GenFunction,
} from "../field";
import { Dict, Keyof } from "../util-types";
import { getKeys, unionSets } from "../utils.js";
import { StoreError } from "../error.js";
import {
    FindPrimaryKey,
    ModelCache,
    CollectionObject,
    RelationlessModelStructure,
} from "./model-types";

const MODEL_SYMBOL = Symbol.for("model");

export default class Model<
    Name extends string,
    F extends Record<string, ValidValue>,
    Primary extends FindPrimaryKey<F> = FindPrimaryKey<F>
> {
    readonly symbol = MODEL_SYMBOL;

    /**
     * Array of all the model's fields
     */
    private readonly fieldKeys: readonly Keyof<F>[];
    /**
     * Set of other models this model links to
     */
    private readonly relationLinks = new Set<string>();
    private cache: ModelCache = {};
    public readonly primaryKey: Primary;
    constructor(public readonly name: Name, private readonly fields: F) {
        this.fieldKeys = getKeys(fields);

        // Generate a set of all models this one is linked to
        for (const key of this.fieldKeys) {
            const item = this.fields[key];
            if (BaseRelation.is(item)) {
                if (item.to !== this.name) {
                    this.relationLinks.add(item.to);
                }
            }
        }

        const primaryKey = this.fieldKeys.find((k) =>
            PrimaryKey.is(this.fields[k])
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

    getPrimaryKey() {
        return this.fields[this.primaryKey] as PrimaryKey<boolean, ValidKey>;
    }

    defineKeyGen(
        genFn: (
            model: Omit<RelationlessModelStructure<this>, Primary>
        ) => GetPrimaryKeyType<F[Primary]>
    ) {
        this.getPrimaryKey().generator(genFn as GenFunction<ValidKey>);
        return this;
    }

    getRelation<Models extends string>(
        key: string
    ): BaseRelation<Models, string> | undefined {
        const item = this.fields[key];
        if (!item || !BaseRelation.is(item)) return undefined;
        return item as BaseRelation<Models, string>;
    }

    keyType(key: Keyof<F>): FieldTypes {
        const f = this.fields[key];
        if (!f) return FieldTypes.Invalid;
        else if (Property.is(f)) return FieldTypes.Property;
        else if (BaseRelation.is(f)) return FieldTypes.Relation;
        else if (PrimaryKey.is(f)) return FieldTypes.PrimaryKey;
        else return FieldTypes.Invalid;
    }

    links<Names extends string = string>() {
        // Shallow-copy the set so it can't be modified accidentally
        return this.relationLinks.keys() as SetIterator<Names>;
    }

    /**
     * Generator for all of the relations present on the model
     */
    *relations<K extends string = string>(): Generator<
        [key: string, relation: BaseRelation<K, string>]
    > {
        for (const key of this.fieldKeys) {
            if (BaseRelation.is(this.fields[key])) {
                yield [key, this.fields[key] as BaseRelation<K, string>];
            }
        }
    }

    /**
     * Generator for all of the entries present on the model
     */
    *entries(): Generator<[key: string, value: ValidValue]> {
        for (const key of this.fieldKeys) {
            yield [key, this.fields[key]];
        }
    }

    keys() {
        return this.fieldKeys;
    }

    parseField<K extends Keyof<F>>(field: K, value: unknown): ParseResult<any> {
        if (Property.is(this.fields[field])) {
            return parseType(this.fields[field].type, value);
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

    static is<
        Name extends string,
        Fields extends Dict<ValidValue>,
        Primary extends FindPrimaryKey<Fields> = FindPrimaryKey<Fields>
    >(value: object): value is Model<Name, Fields, Primary> {
        return (value as any)?.symbol === MODEL_SYMBOL;
    }
}

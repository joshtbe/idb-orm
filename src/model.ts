import z from "zod";
import { CollectionObject, CompiledDb } from "./builder.js";
import { StoreError } from "./error";
import {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    Relation,
    RelationArray,
    type RelationOutput,
    type ValidValue,
} from "./field";
import type { Dict, Keyof, ValidKey, ZodWrap } from "./types/common.js";
import { getKeys, unionSets } from "./utils.js";
import { DbClient } from "./client/index.js";

type FindPrimaryKey<F extends Record<string, ValidValue>> = Extract<
    {
        [K in keyof F]: F[K] extends PrimaryKey<any, any> ? K : never;
    }[keyof F],
    string
>;

export type PrimaryKeyType<M extends Model<any, any, any>> = M extends Model<
    any,
    infer F,
    any
>
    ? {
          [K in keyof F]: F[K] extends PrimaryKey<any, infer Type>
              ? Type
              : never;
      }[keyof F]
    : never;

interface ModelCache {
    delete?: Set<string>;
}

export class Model<
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
        if (!item || !(item instanceof Field)) return undefined;
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

    keyType(key: Keyof<F>): "Relation" | "Primary" | "Field" | "None" {
        const f = this.fields[key];
        if (!f) return "None";
        else if (f instanceof Field) return "Field";
        else if (f instanceof BaseRelation) return "Relation";
        else return "Primary";
    }

    links<Names extends string = string>() {
        // Shallow-copy the set so it can't be modified accidentally
        return this.relationLinks.keys() as SetIterator<Names>;
    }

    keys() {
        return [...this.fieldKeys];
    }

    parseField<K extends Keyof<F>>(
        field: K,
        value: unknown
    ): z.ZodSafeParseResult<any> {
        if (this.fields[field] instanceof Field) {
            return this.fields[field].parse(value);
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

export type RelationValue<Name extends string, C> = Name extends keyof C
    ? C[Name] extends Model<any, infer Fields, infer PrimaryKey>
        ? RelationOutput<Fields[PrimaryKey]>
        : never
    : never;

export type GetRelationField<F, C> = F extends Relation<infer To, any>
    ? RelationValue<To, C>
    : F extends OptionalRelation<infer To, any>
    ? RelationValue<To, C> | undefined
    : F extends RelationArray<infer To, any>
    ? RelationValue<To, C>[]
    : never;

export type ModelStructure<F extends Dict<ValidValue>, C> = {
    [K in keyof F]: F[K] extends Field<infer Output, any>
        ? Output
        : F[K] extends PrimaryKey<any, infer Type>
        ? Type
        : GetRelationField<F[K], C>;
};

export type ModelType<
    M extends Model<any, any, any>,
    C extends CompiledDb<any, any, any>
> = M extends Model<any, infer Fields, any>
    ? C extends CompiledDb<any, any, infer Collection>
        ? ModelStructure<Fields, Collection>
        : never
    : never;

export type ExtractFields<M extends Model<any, any, any>> = M extends Model<
    any,
    infer Fields,
    any
>
    ? Fields
    : never;

export type AllRelationKeys<M extends Model<any, any, any>> = M extends Model<
    any,
    infer Fields,
    any
>
    ? {
          [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
              ? K
              : never;
      }[Keyof<Fields>]
    : never;

export type RelationlessModelStructure<M extends Model<any, any, any>> =
    M extends Model<any, infer Fields, any>
        ? Omit<
              {
                  [K in Keyof<Fields>]: Fields[K] extends BaseRelation<any, any>
                      ? unknown
                      : Fields[K] extends Field<infer Type, any>
                      ? Type
                      : Fields[K] extends PrimaryKey<any, infer Type>
                      ? Type
                      : never;
              },
              AllRelationKeys<M>
          >
        : never;

export type CollectionZodSchema<C> = C extends Record<
    infer Keys,
    Model<any, any, any>
>
    ? {
          [K in Keys]: C[K] extends Model<any, infer Fields, any>
              ? ZodWrap<ModelStructure<Fields, C>>
              : never;
      }
    : never;

export type FindRelationKey<
    From extends string,
    RelationName extends string,
    M extends Model<any, any, any>
> = M extends Model<any, infer Fields, any>
    ? {
          [K in Keyof<Fields>]: Fields[K] extends BaseRelation<
              From,
              infer CurName
          >
              ? CurName extends RelationName
                  ? K
                  : never
              : never;
      }[Keyof<Fields>]
    : never;

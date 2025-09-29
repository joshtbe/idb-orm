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
import type { Dict, Key, ValidKey, ZodWrap } from "./types";

export type FindPrimaryKey<F extends Record<string, ValidValue>> = Extract<
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

export class Model<
    Name extends string,
    F extends Record<string, ValidValue>,
    Primary extends FindPrimaryKey<F> = FindPrimaryKey<F>
> {
    private readonly fieldKeys: readonly Key<F>[];
    public readonly primaryKey: Primary;
    constructor(public readonly name: Name, private readonly fields: F) {
        this.fieldKeys = Object.keys(fields) as Key<F>[];
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

    getField<K extends Key<F>>(key: K): F[K] {
        return this.fields[key];
    }

    getPrimaryKey() {
        return this.fields[this.primaryKey] as PrimaryKey<boolean, ValidKey>;
    }

    getRelation(key: string): BaseRelation<any, any> | undefined {
        const item = this.fields[key];
        if (!item || !(item instanceof BaseRelation)) return undefined;
        return item;
    }

    keyType(key: Key<F>): "Relation" | "Primary" | "Field" | "None" {
        const f = this.fields[key];
        if (!f) return "None";
        else if (f instanceof Field) return "Field";
        else if (f instanceof BaseRelation) return "Relation";
        else return "Primary";
    }

    keys() {
        return [...this.fieldKeys];
    }

    parseField<K extends Key<F>>(field: K, value: unknown) {
        if (this.fields[field] instanceof Field) {
            return this.fields[field].parse(value);
        }
        return null as never;
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
          [K in Key<Fields>]: Fields[K] extends BaseRelation<
              From,
              infer CurName
          >
              ? CurName extends RelationName
                  ? K
                  : never
              : never;
      }[Key<Fields>]
    : never;

import type z from "zod";
import {
    BaseRelation,
    Field,
    OptionalRelation,
    PrimaryKey,
    Relation,
    RelationArray,
    type FieldOutput,
    type RelationOutput,
} from "./field.ts";
import type { OnlyString, ValidKey } from "./types.ts";
import { getKeys, handleRequest } from "./utils.ts";
import { DbClient } from "./client.ts";

// Utility type to denote a record of strings to fields of a model
export type ModelFields<T extends string = string> = Record<
    string,
    Field<unknown> | BaseRelation<T, string> | PrimaryKey<boolean, ValidKey>
>;

// Utility type to extract the primary key from the type
export type GetPrimaryKey<T extends object> = T extends Model<
    infer Fields,
    any,
    any
>
    ? GetPrimaryKey<Fields>
    : Extract<
          {
              [K in keyof T]: T[K] extends PrimaryKey<any, any>
                  ? OnlyString<K>
                  : never;
          }[keyof T],
          string
      >;

export class Model<
    Fields extends ModelFields<Relations>,
    PrimaryKey extends GetPrimaryKey<Fields>,
    Relations extends string
> {
    public readonly primaryKey: PrimaryKey;
    public readonly keys: Extract<keyof Fields, string>[];
    constructor(public readonly fields: Fields) {
        this.primaryKey = "" as PrimaryKey;
        this.keys = getKeys(fields);
        // Get primary key
        for (const key of this.keys) {
            if (fields[key] instanceof PrimaryKey) {
                this.primaryKey = key as PrimaryKey;
                break;
            }
        }
        if (!this.primaryKey) throw "Primary Key not found";
    }
}

type ModelMap<
    T extends Record<string, Model<any, any, Extract<keyof T, string>>>
> = {
    [K in keyof T]: Model<
        T[K]["fields"],
        GetPrimaryKey<T[K]>,
        Extract<keyof T, string>
    >;
};

type Collection<Keys extends string, T extends ModelMap<T>> = {
    [K in keyof T]: T[K]["fields"] extends ModelFields<any>
        ? Model<
              T[K]["fields"],
              GetPrimaryKey<T[K]["fields"]>,
              Extract<Keys, string>
          >
        : T[K];
};

export type RelationValue<Name extends string, C> = Name extends keyof C
    ? C[Name] extends Model<infer Fields, infer PrimaryKey, any>
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

export type ResolvedModel<F extends ModelFields<string>, C> = {
    [K in keyof F]: F[K] extends Field<infer Type>
        ? Type
        : F[K] extends PrimaryKey<any, infer Type>
        ? Type
        : // Handle getting relation values
          GetRelationField<F[K], C>;
};
export type ResolvedModelSchema<F extends ModelFields<string>, C> = {
    [K in keyof F]: z.ZodType<
        F[K] extends Field<infer Type>
            ? Type
            : F[K] extends PrimaryKey<any, infer Type>
            ? Type
            : // Handle getting relation values
              GetRelationField<F[K], C>
    >;
};

export type ModelSchemaRecord<List> = List extends Record<
    infer Keys,
    Model<any, any, any>
>
    ? {
          [K in Keys]: List[K] extends Model<infer Fields, any, any>
              ? ResolvedModelSchema<Fields, List>
              : never;
      }
    : never;

export type ZodModelSchemaRecord<List> = ModelSchemaRecord<List>;

export type CollectionRecordGeneric = Record<
    string,
    Model<ModelFields<string>, never, string>
>;

export class ModelCollection<
    Models extends Record<string, Model<any, any, any>>
> {
    public readonly schemas: ZodModelSchemaRecord<Models>;
    constructor(public readonly models: Models) {
        const modelKeys = getKeys(this.models);
        this.models = models;
        this.schemas = {} as ZodModelSchemaRecord<Models>;
        for (const key of modelKeys) {
            const fields = this.models[key].fields;
            const fieldKeys = this.models[key].keys;
            const schema: Record<string, z.ZodType> = {};
            for (const f of fieldKeys) {
                const field = fields[f];
                if (field instanceof Field) {
                    schema[f] = field.schema;
                } else if (field instanceof BaseRelation) {
                    const otherModel = this.models[field.to];
                    const otherPrimary =
                        otherModel.fields[otherModel.primaryKey];
                    if (otherPrimary instanceof PrimaryKey) {
                        schema[f] = Field.schemas[otherPrimary.type];
                        if (field.isOptional) {
                            schema[f] = schema[f].optional();
                        } else if (field.isArray) {
                            schema[f] = schema[f].array();
                        }
                    } else
                        throw `Key '${otherModel.primaryKey}' in model '${field.to}' is not a valid Primary Key`;

                    // Verify that a relation exists on the other model
                    let hasRelation = false;
                    for (const otherKey of otherModel.keys) {
                        const element = otherModel.fields[otherKey];
                        if (
                            element instanceof BaseRelation &&
                            element.to === key &&
                            element.name === field.name &&
                            f !== otherKey
                        ) {
                            hasRelation = true;
                        }
                    }
                    if (!hasRelation) {
                        throw `Relation '${field.name}' of model '${key}' does not have an equivalent relation on model '${field.to}'`;
                    }
                } else if (field instanceof PrimaryKey) {
                    schema[f] = Field.schemas[field.type];
                } else
                    throw `Unknown Field value detected: ${JSON.stringify(
                        field
                    )}`;
            }
            (this.schemas as Record<string, unknown>)[key] = schema;
        }
    }

    async createClient(name: string, version?: number) {
        const openRequest = window.indexedDB.open(name, version);

        const db = await handleRequest(openRequest);
        return new DbClient<ModelCollection<Models>>(db, this);
    }

    static createBuilder<Keys extends string>(stores: readonly Keys[]) {
        return function <T extends ModelMap<T>>(
            models: Collection<Keys, T>
        ): ModelCollection<Collection<Keys, T>> {
            return new ModelCollection(models);
        };
    }
}

export type Keys<C extends ModelCollection<any>> = OnlyString<
    keyof C["models"]
>[];

export type CollectionGeneric = ModelCollection<
    Record<string, Model<any, any, any>>
>;

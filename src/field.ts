import z from "zod";
import type { ValidKey, ValidKeyType } from "./types.js";
import { v4 as uuid } from "uuid";
import type { Primitive, Tagged } from "type-fest";

const DEFAULT_SCHEMA_MAP = {
    string: z.string(),
    boolean: z.boolean(),
    number: z.number(),
    array: z.array(z.any()),
    object: z.looseObject({}),
    date: z.date(),
};

export class BaseRelation<To extends string, Name extends string = never> {
    private toKey: string;
    constructor(
        public readonly to: To,
        public readonly name: Name = "" as never,
        public readonly isOptional: boolean = false,
        public readonly isArray: boolean = false
    ) {
        this.toKey = "";
    }

    get fieldKey() {
        return this.toKey;
    }

    setFieldKey(key: string) {
        this.toKey = key;
    }
}

export class Relation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "relation">;

    array() {
        return new RelationArray(this.to, this.name);
    }

    optional() {
        return new OptionalRelation(this.to, this.name);
    }
}
export class RelationArray<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "relationArray">;

    constructor(to: To, name?: Name) {
        super(to, name, false, true);
    }
}
export class OptionalRelation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "optionalRelation">;

    constructor(to: To, name?: Name) {
        super(to, name, true, false);
    }
}

type FunctionMatch<E> = E extends "string"
    ? string
    : E extends "number"
    ? number
    : E extends "date"
    ? Date
    : never;

export class PrimaryKey<AutoIncrement extends boolean, Type extends ValidKey> {
    private readonly genFn?: () => Type;
    public readonly autoIncrement: AutoIncrement;
    public readonly type: ValidKeyType;
    constructor(
        incrementOrGen: boolean | (() => Type),
        type: ValidKeyType = "number"
    ) {
        this.autoIncrement = false as AutoIncrement;
        this.type = type;
        if (typeof incrementOrGen === "function") {
            this.genFn = incrementOrGen;
        } else if (incrementOrGen) {
            this.autoIncrement = true as AutoIncrement;
        }
    }

    generator<V extends ValidKeyType>(type: V, genFn: () => FunctionMatch<V>) {
        return new PrimaryKey<false, FunctionMatch<V>>(genFn, type);
    }

    stringGenerator(genFn: () => string) {
        return this.generator("string", genFn);
    }

    numberGenerator(genFn: () => number) {
        return this.generator("number", genFn);
    }

    dateGenerator(genFn: () => Date) {
        return this.generator("date", genFn);
    }

    uuid() {
        return this.generator("string", uuid);
    }

    genKey() {
        if (this.genFn) return this.genFn();
        throw new Error("Generator function not defined");
    }

    getSchema() {
        return DEFAULT_SCHEMA_MAP[this.type];
    }
}

export type GetPrimaryKeyType<T> = T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

type FieldOptions = {
    unique: boolean;
};

export class Field<OutputType, InputType = OutputType> {
    public schema: z.ZodType<OutputType>;
    public static readonly schemas = DEFAULT_SCHEMA_MAP;
    private options: FieldOptions;
    constructor(
        schema: z.ZodType<OutputType>,
        options?: Partial<FieldOptions>
    ) {
        this.schema = schema;
        this.options = {
            unique: options?.unique ?? false,
        };
    }

    array() {
        return new Field(this.schema.array());
    }

    optional() {
        return new Field<OutputType | undefined>(this.schema.optional());
    }

    default(defaultValue: NonNullable<OutputType>) {
        return new Field<NonNullable<OutputType>, InputType | undefined>(
            this.schema.default(defaultValue as any) as any
        );
    }

    refine(refineFn: (val: OutputType) => boolean) {
        this.schema = this.schema.refine(refineFn);
    }

    parse(value: unknown): z.ZodSafeParseResult<OutputType> {
        return this.schema.safeParse(value);
    }

    // TODO: Implement unique fields using indexes and {unique: true}

    /**
     * Indicates that a field must be unique across all documents
     *
     * **NOTE**: The field type must be a primitive. If this is applied to a non-primitive, it returns `null`
     */
    unique(): OutputType extends Primitive ? this : null {
        switch (this.schema.type) {
            case "boolean":
            case "string":
            case "number":
            case "symbol":
                this.options.unique = true;
                return this as any;
            default:
                console.error("A non-primitive cannot be a unique value");
                return null as any;
        }
    }

    // Static Functions
    static array<T>(item: z.ZodType<T> | Field<T>, options?: FieldOptions) {
        if (item instanceof Field) {
            return new Field(item.schema.array(), options);
        }
        return new Field(item.array());
    }

    static boolean(schema?: z.ZodType<boolean>, options?: FieldOptions) {
        return new Field<boolean>(
            schema ?? DEFAULT_SCHEMA_MAP.boolean,
            options
        );
    }

    static custom<T>(schema: z.ZodType<T>, options?: FieldOptions) {
        return new Field<T>(schema, options);
    }

    static object<T extends Record<string, z.ZodType>>(
        item: T,
        options?: FieldOptions
    ) {
        return new Field(z.object(item), options);
    }

    static primaryKey(): PrimaryKey<true, number> {
        return new PrimaryKey(true);
    }

    static literal<V extends string | number | boolean>(value: V) {
        return new Field(z.literal(value));
    }

    static number(schema?: z.ZodType<number>, options?: FieldOptions) {
        return new Field<number>(schema ?? DEFAULT_SCHEMA_MAP.number, options);
    }

    static string(schema?: z.ZodType<string>, options?: FieldOptions) {
        return new Field<string>(schema ?? DEFAULT_SCHEMA_MAP.string, options);
    }

    static relation<To extends string, Name extends string = never>(
        to: To,
        name?: Name
    ) {
        return new Relation<To, Name>(to, name);
    }
}

export type RelationOutput<T> = T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export type RelationOutputStructure<
    R extends BaseRelation<any, any>,
    Output
> = R extends RelationArray<any, any>
    ? Output[]
    : R extends OptionalRelation<any, any>
    ? Output | undefined
    : Output;

export type NonRelationOutput<T> = T extends Field<infer Out, any>
    ? Out
    : T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

export type ValidValue<N extends string = string> =
    | BaseRelation<N, string>
    | Field<any, any>
    | PrimaryKey<boolean, ValidKey>;

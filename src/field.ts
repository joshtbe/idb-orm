import z from "zod";
import type { ValidKey, ValidKeyType } from "./types/common.js";
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

export type ReferenceActions = "Cascade" | "None" | "Restrict";
export type OptionalActions = "SetNull" | ReferenceActions;
interface RelationOptions<Name extends string, OnDelete> {
    name?: Name;
    onDelete?: OnDelete;
}

interface RelationActions {
    onDelete: OptionalActions;
}

export class BaseRelation<To extends string, Name extends string = never> {
    /**
     * Actions to be performed under certain conditions
     */
    protected actions: RelationActions;

    /**
     * The corresponding relation key on the model this relation points to
     */
    private relatedKey: string;

    constructor(
        /**
         * The name of the model this relation is pointing to
         */
        public readonly to: To,
        /**
         * An optional label to give to the relation. This helps distinguish it from others
         */
        public readonly name: Name = "" as never,
        /**
         * If the relation is optional or not
         */
        public readonly isOptional: boolean = false,
        /**
         * If the relation is an array or not
         */
        public readonly isArray: boolean = false,
        onDelete?: OptionalActions
    ) {
        this.relatedKey = "";
        this.actions = {
            onDelete: onDelete || "Restrict",
        };
    }

    getActions() {
        return { ...this.actions };
    }

    setRelatedKey(key: string) {
        this.relatedKey = key;
    }

    /**
     * Gets the key on the corresponding model this relation points to
     */
    getRelatedKey() {
        return this.relatedKey;
    }
}

export class Relation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "relation">;

    constructor(to: To, options: RelationOptions<Name, ReferenceActions> = {}) {
        super(to, options.name, false, false, options.onDelete);
    }

    /**
     * Creates an array relation to the specified model
     *
     * **Note: Calling this function will reset any relation actions to the default**
     */
    array({
        onDelete,
    }: Omit<RelationOptions<Name, OptionalActions>, "name"> = {}) {
        return new RelationArray(this.to, this.name, onDelete);
    }

    /**
     * Creates an optional relation to the specified model
     *
     * **Note: Calling this function will reset any relation actions to the default**
     */
    optional({
        onDelete,
    }: Omit<RelationOptions<Name, OptionalActions>, "name"> = {}) {
        return new OptionalRelation(this.to, this.name, onDelete);
    }

    onDelete(action: ReferenceActions) {
        this.actions.onDelete = action;
        return this;
    }
}
export class RelationArray<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "relationArray">;

    constructor(to: To, name?: Name, action: OptionalActions = "SetNull") {
        super(to, name, false, true, action);
    }
}
export class OptionalRelation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: Tagged<unknown, "optionalRelation">;

    constructor(to: To, name?: Name, action: OptionalActions = "SetNull") {
        super(to, name, true, false, action);
    }
}

type FunctionMatch<E> = E extends "string"
    ? string
    : E extends "number"
    ? number
    : E extends "date"
    ? Date
    : never;

type KeyToPrimitive<T> = T extends number
    ? "number"
    : T extends Date
    ? "date"
    : "string";

type GenFunction<T extends ValidKey> = () => T;

export class PrimaryKey<AutoGenerate extends boolean, Type extends ValidKey> {
    private genFn?: GenFunction<Type>;
    private autoGenerate: AutoGenerate;
    public readonly type: ValidKeyType;

    constructor();
    constructor(type: ValidKeyType);
    constructor(type: ValidKeyType, generator: GenFunction<Type>);

    constructor(
        type?: ValidKeyType | void,
        generator?: GenFunction<Type> | void
    ) {
        if (!type) {
            this.autoGenerate = false as AutoGenerate;
            this.type = "number";
        } else {
            this.type = type;
            if (generator) {
                this.autoGenerate = true as AutoGenerate;
                this.genFn = generator;
            } else {
                this.autoGenerate = false as AutoGenerate;
            }
        }
    }

    autoIncrement() {
        if (this.type === "number") {
            this.genFn = undefined;
            this.autoGenerate = true as AutoGenerate;
            return this as PrimaryKey<true, number>;
        }
        const obj = new PrimaryKey<true, number>();
        obj.genFn = undefined;
        obj.autoGenerate = true as (typeof obj)["autoGenerate"];
        return obj;
    }

    generator(genFn: GenFunction<Type>) {
        this.genFn = genFn;
        this.autoGenerate = true as AutoGenerate;
        return this as PrimaryKey<true, Type>;
    }

    uuid() {
        return new PrimaryKey<true, string>("string", uuid);
    }

    genKey() {
        if (this.genFn) return this.genFn();
        throw new Error("Generator function not defined");
    }

    getSchema() {
        return DEFAULT_SCHEMA_MAP[this.type];
    }

    /**
     * If the internal objectStore "autoIncrement" utility is being used
     * @returns
     */
    isAutoIncremented() {
        return this.autoGenerate && !this.genFn;
    }
}

export type GetPrimaryKeyType<T> = T extends PrimaryKey<any, infer Type>
    ? Type
    : never;

interface FieldOptions {
    unique: boolean;
}

export class Field<OutputType, HasDefault extends boolean = false> {
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
        return new Field<NonNullable<OutputType>, true>(
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

    static primaryKey<V extends ValidKeyType = "number">(
        type: V = "number" as V
    ): PrimaryKey<false, FunctionMatch<V>> {
        return new PrimaryKey<false, FunctionMatch<V>>(type);
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
        options?: RelationOptions<Name, ReferenceActions>
    ) {
        return new Relation<To, Name>(to, options);
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

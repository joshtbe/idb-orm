import type {
    OptionalActions,
    ReferenceActions,
    RelationActions,
    RelationOptions,
} from "./field-types";
import { InvalidConfigError } from "../error";

export abstract class BaseRelation<
    To extends string,
    Name extends string = never,
> {
    private static readonly BASE_SYMBOL = Symbol.for("base_relation");
    protected readonly baseSymbol = BaseRelation.BASE_SYMBOL;

    /**
     * Actions to be performed under certain conditions
     */
    protected readonly actions: RelationActions;

    /**
     * The corresponding relation key on the model this relation points to
     */
    readonly relatedKey: string;

    /**
     * An optional label to give to the relation. This helps distinguish it from others
     */
    public readonly name: Name;

    private built: boolean = false;

    /**
     * If the relation is an array or not
     */
    readonly isArray: boolean;
    /**
     * If the relation is optional or not
     */
    readonly isOptional: boolean;

    /**
     * If the relation is bidirectional or not
     * @default true
     */
    readonly isBidirectional: boolean;

    constructor(
        /**
         * The name of the model this relation is pointing to
         */
        public readonly to: To,
        protected readonly options: RelationOptions<Name, OptionalActions> = {},
    ) {
        this.relatedKey = "";
        this.name = options.name ?? ("" as never);
        this.isArray = options.array ?? false;
        this.isOptional = options.optional ?? false;
        this.isBidirectional = options.bidirectional ?? true;
        this.actions = {
            onDelete: options.onDelete ?? "Restrict",
        };

        // We don't need to wait for the relatedKey to be set
        if (!this.isBidirectional) {
            this.built = true;
        }
    }

    /**
     * Builds the relation, providing the relation object with needed information about what it's related to.
     *
     * This function is called during database build time. Subsequent calls will throw an error.
     * @param relatedKey Key of the corresponding relation on the model designated by `to`.
     */
    build(relatedKey: string) {
        if (this.built) {
            throw new InvalidConfigError(
                `Relation '${this.name}' cannot be built twice.`,
            );
        }
        (this.relatedKey as any) = relatedKey;
        this.built = true;
    }

    getActions() {
        return { ...this.actions };
    }

    /**
     * Returns a flag indicating if this object has had the `build()` function called.
     */
    isBuilt() {
        return this.built;
    }

    /**
     * Whether or not this relation can have the "SetNull" onDelete action used against it.
     *
     * This returns true if it's an arrayable or optional relation.
     * @returns `true` if this relation can have the `SetNull` action. `false` otherwise.
     */
    isNullable() {
        return this.isArray || this.isOptional;
    }

    toString() {
        return `${
            this.isArray ? "Array" : this.isOptional ? "Optional" : "Standard"
        } relation from this model to model '${this.to}' on key '${
            this.relatedKey
        }'`;
    }

    static is<K extends string = string>(
        value: object,
    ): value is BaseRelation<K, any> {
        return (
            typeof value === "object" &&
            (value as any)?.baseSymbol === BaseRelation.BASE_SYMBOL
        );
    }
}

export class Relation<
    To extends string,
    const Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly R_SYMBOL = Symbol.for("relation");
    private readonly symbol = Relation.R_SYMBOL;
    declare private readonly _brand: "relation";

    constructor(
        to: To,
        options: Omit<
            RelationOptions<Name, ReferenceActions>,
            "array" | "optional"
        > = {},
    ) {
        super(to, options);
    }

    /**
     * Creates an array relation to the specified model
     *
     * **Note: Calling this function will reset any relation actions to the default**
     */
    array(
        options: Omit<
            RelationOptions<Name, OptionalActions>,
            "name" | "array" | "optional"
        > = {},
    ) {
        return new ArrayRelation(this.to, {
            ...this.options,
            ...options,
            name: this.name,
        });
    }

    /**
     * Creates an optional relation to the specified model
     *
     * **Note: Calling this function will reset any relation actions to the default**
     */
    optional(
        options: Omit<
            RelationOptions<Name, OptionalActions>,
            "name" | "optional" | "array"
        > = {},
    ) {
        return new OptionalRelation(this.to, {
            ...this.options,
            ...options,
            name: this.name,
        });
    }

    onDelete(action: ReferenceActions) {
        this.actions.onDelete = action;
        return this;
    }

    static is(value: object): value is Relation<any, any> {
        return super.is(value) && (value as any)?.symbol === this.R_SYMBOL;
    }
}

export class ArrayRelation<
    To extends string,
    Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly A_SYMBOL = Symbol.for("array_relation");
    private readonly symbol = ArrayRelation.A_SYMBOL;
    declare private readonly _brand: "ArrayRelation";

    constructor(
        to: To,
        options: Omit<
            RelationOptions<Name, OptionalActions>,
            "array" | "optional"
        > = {},
    ) {
        super(to, { onDelete: "None", ...options, array: true });
    }

    static is(value: object): value is ArrayRelation<any, any> {
        return super.is(value) && (value as any)?.symbol === this.A_SYMBOL;
    }
}
export class OptionalRelation<
    To extends string,
    Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly O_SYMBOL = Symbol.for("optional_relation");
    private readonly symbol = OptionalRelation.O_SYMBOL;
    declare private readonly _brand: "optionalRelation";

    constructor(
        to: To,
        options: Omit<
            RelationOptions<Name, OptionalActions>,
            "array" | "optional"
        > = {},
    ) {
        super(to, {
            onDelete: "None",
            ...options,
            optional: true,
        });
    }

    static is(value: object): value is OptionalRelation<any, any> {
        return super.is(value) && (value as any)?.symbol === this.O_SYMBOL;
    }
}

import type {
    OptionalActions,
    ReferenceActions,
    RelationActions,
    RelationOptions,
} from "./field-types.js";

export class BaseRelation<To extends string, Name extends string = never> {
    private static readonly SYMBOL = Symbol.for("baseRelation");
    protected readonly BASE_SYMBOL = BaseRelation.SYMBOL;

    /**
     * Actions to be performed under certain conditions
     */
    protected actions: RelationActions;

    /**
     * The corresponding relation key on the model this relation points to
     */
    private relatedKey: string;

    /**
     * An optional label to give to the relation. This helps distinguish it from others
     */
    public readonly name: Name;

    /**
     * If the relation is an array or not
     */
    readonly isArray: boolean;
    /**
     * If the relation is optional or not
     */
    readonly isOptional: boolean;
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
    }

    getActions() {
        return { ...this.actions };
    }

    /**
     * Whether or not this relation can have the "SetNull" onDelete action used against it
     * @returns
     */
    isNullable() {
        return this.isArray || this.isOptional;
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

    tostring() {
        return `${
            this.isArray ? "Array" : this.isOptional ? "Optional" : "Standard"
        } relation from this model to model '${this.to}' on key '${
            this.relatedKey
        }'`;
    }

    getBaseSymbol() {
        return this.BASE_SYMBOL;
    }

    static is(value: object): value is BaseRelation<any, any> {
        return (
            "getBaseSymbol" in value &&
            (value as { getBaseSymbol(): symbol }).getBaseSymbol() ===
                BaseRelation.SYMBOL
        );
    }
}

export class Relation<
    To extends string,
    const Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly R_SYMBOL = Symbol.for("relation");
    readonly symbol = Relation.R_SYMBOL;
    declare private readonly _brand: "relation";

    constructor(to: To, options: RelationOptions<Name, ReferenceActions> = {}) {
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
            "name" | "array"
        > = {},
    ) {
        return new ArrayRelation(this.to, {
            ...this.options,
            ...options,
            name: this.name,
            array: true,
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
            "name" | "optional"
        > = {},
    ) {
        return new OptionalRelation(this.to, {
            ...this.options,
            ...options,
            optional: true,
            name: this.name,
        });
    }

    onDelete(action: ReferenceActions) {
        this.actions.onDelete = action;
        return this;
    }

    static is(value: object): value is Relation<any, any> {
        return (value as any)?.symbol === this.R_SYMBOL;
    }
}

export class ArrayRelation<
    To extends string,
    Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly A_SYMBOL = Symbol.for("arrayRelation");
    readonly symbol = ArrayRelation.A_SYMBOL;
    declare private readonly _brand: "ArrayRelation";

    constructor(to: To, options: RelationOptions<Name, OptionalActions> = {}) {
        super(to, { onDelete: "None", ...options });
    }

    static is(value: object): value is ArrayRelation<any, any> {
        return (value as any)?.symbol === this.A_SYMBOL;
    }
}
export class OptionalRelation<
    To extends string,
    Name extends string,
> extends BaseRelation<To, Name> {
    private static readonly O_SYMBOL = Symbol.for("optionalRelation");
    readonly symbol = OptionalRelation.O_SYMBOL;
    declare private readonly _brand: "optionalRelation";

    constructor(to: To, options: RelationOptions<Name, OptionalActions> = {}) {
        super(to, {
            onDelete: "None",
            ...options,
        });
    }

    static is(value: object): value is OptionalRelation<any, any> {
        return (value as any)?.symbol === this.O_SYMBOL;
    }
}

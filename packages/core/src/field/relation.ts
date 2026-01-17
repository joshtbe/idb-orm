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
        onDelete?: OptionalActions,
    ) {
        this.relatedKey = "";
        this.actions = {
            onDelete: onDelete || "Restrict",
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
        return new ArrayRelation(this.to, this.name, onDelete);
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

    constructor(to: To, name?: Name, action: OptionalActions = "None") {
        super(to, name, false, true, action);
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

    constructor(to: To, name?: Name, action: OptionalActions = "None") {
        super(to, name, true, false, action);
    }

    static is(value: object): value is OptionalRelation<any, any> {
        return (value as any)?.symbol === this.O_SYMBOL;
    }
}

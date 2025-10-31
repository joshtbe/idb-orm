import type {
    OptionalActions,
    ReferenceActions,
    RelationActions,
    RelationOptions,
} from "./field-types.js";

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
    private declare readonly _brand: "relation";

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
}
export class ArrayRelation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: "ArrayRelation";

    constructor(to: To, name?: Name, action: OptionalActions = "SetNull") {
        super(to, name, false, true, action);
    }
}
export class OptionalRelation<
    To extends string,
    Name extends string
> extends BaseRelation<To, Name> {
    private declare readonly _brand: "optionalRelation";

    constructor(to: To, name?: Name, action: OptionalActions = "SetNull") {
        super(to, name, true, false, action);
    }
}

import { InvalidConfigError } from "../error.js";
import { getDate, uuid } from "../utils.js";
import { GenFunction, ValidKey, ValidKeyType } from "./field-types.js";
import { Type } from "./type-wrapper.js";
import { VALIDATORS } from "./validators.js";

const PRIMARY_KEY_SYMBOL = Symbol.for("primaryKey");
export default class PrimaryKey<
    AutoGenerate extends boolean,
    KeyType extends ValidKey
> {
    readonly symbol = PRIMARY_KEY_SYMBOL;
    private genFn?: GenFunction<KeyType>;
    private autoGenerate: AutoGenerate;
    public readonly type: ValidKeyType;

    constructor();
    constructor(type: ValidKeyType);
    constructor(type: ValidKeyType, generator: GenFunction<KeyType>);

    constructor(
        type?: ValidKeyType | void,
        generator?: GenFunction<KeyType> | void
    ) {
        if (!type) {
            this.autoGenerate = false as AutoGenerate;
            this.type = Type.Number;
        } else {
            if (type > Type.Date) {
                throw new InvalidConfigError("Invalid Primary Key Type");
            }
            this.type = type;
            if (generator) {
                this.autoGenerate = true as AutoGenerate;
                this.genFn = generator;
            } else {
                this.autoGenerate = false as AutoGenerate;
            }
        }
    }

    getType() {
        return this.type;
    }

    generator(genFn: GenFunction<KeyType>) {
        this.genFn = genFn;
        this.autoGenerate = true as AutoGenerate;
        return this as PrimaryKey<true, KeyType>;
    }

    autoIncrement() {
        if (this.type === Type.Number) {
            this.genFn = undefined;
            this.autoGenerate = true as AutoGenerate;
            return this as PrimaryKey<true, number>;
        }
        throw new InvalidConfigError(
            "Primary key must be a number to use autoIncrement()"
        );
    }

    uuid() {
        if (!window.isSecureContext) {
            throw new Error("Window is not in a secure context");
        }
        return new PrimaryKey<true, string>(Type.String, uuid);
    }

    date() {
        return new PrimaryKey<true, Date>(Type.Date, getDate);
    }

    genKey() {
        if (this.genFn) return this.genFn();
        throw new Error("Generator function not defined");
    }

    getSchema() {
        return VALIDATORS[this.type.tag];
    }

    /**
     * If the internal objectStore "autoIncrement" utility is being used
     * @returns
     */
    isAutoIncremented() {
        return this.autoGenerate && !this.genFn;
    }

    static is(value: object): value is PrimaryKey<any, any> {
        return (value as any)?.symbol === PRIMARY_KEY_SYMBOL;
    }
}

import { InvalidConfigError } from "../error.js";
import { getDate, uuid } from "../utils.js";
import { GenFunction, ValidKey, ValidKeyType } from "./field-types.js";
import { isType, Tag, Type } from "../typing";

const PRIMARY_KEY_SYMBOL = Symbol.for("primaryKey");
export default class PrimaryKey<
    AutoGenerate extends boolean,
    KeyType extends ValidKey,
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
        generator?: GenFunction<KeyType> | void,
    ) {
        if (!type) {
            this.autoGenerate = false as AutoGenerate;
            this.type = Type.number();
        } else {
            if (type.tag > Tag.date) {
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
        if (this.type.tag === Tag.number) {
            this.genFn = undefined;
            this.autoGenerate = true as AutoGenerate;
            return this as PrimaryKey<true, number>;
        }
        throw new InvalidConfigError(
            "Primary key must be a number to use autoIncrement()",
        );
    }

    uuid() {
        if (!window.isSecureContext) {
            throw new Error("Window is not in a secure context");
        }
        return new PrimaryKey<true, string>(Type.string(), uuid);
    }

    date() {
        return new PrimaryKey<true, Date>(Type.date(), getDate);
    }

    genKey(...args: unknown[]) {
        if (this.genFn) return this.genFn(...args);
        throw new Error("Generator function not defined");
    }

    /**
     * If the objectStore "autoIncrement" utility is being used
     */
    isAutoIncremented(): boolean {
        return this.autoGenerate && !this.genFn;
    }

    static is(value: object): value is PrimaryKey<any, any> {
        return (value as any)?.symbol === PRIMARY_KEY_SYMBOL;
    }

    static isValidKey(value: unknown): value is ValidKey {
        return isType(this.validKeyTag, value);
    }

    /**
     * Compares primary key values to see if they are the same
     * @param key1 First key
     * @param key2 Second key
     * @returns true if the keys share the same value AND type, false otherwise
     */
    static compareKeyValue(key1: ValidKey, key2: ValidKey): boolean {
        if (typeof key1 !== typeof key2) return false;
        switch (typeof key1) {
            case "string":
            case "number":
                return key1 === key2;
            case "object":
                return key1.getTime() === (key2 as Date).getTime();
            default:
                return false;
        }
    }

    static readonly validKeyTag = Type.union([
        Type.string(),
        Type.number(),
        Type.date(),
    ]);
}

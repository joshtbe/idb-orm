import { InvalidConfigError } from "../error";
import { areDatesEqual, getDate, uuid } from "../utils";
import { GenFunction, ValidKey, ValidKeyType } from "./field-types";
import { isType, Tag, Type } from "../typing";

export default class PrimaryKey<
    AutoGenerate extends boolean,
    KeyType extends ValidKey,
> {
    private static readonly SYMBOL = Symbol.for("primary_key");
    readonly symbol = PrimaryKey.SYMBOL;
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

    date() {
        return new PrimaryKey<true, Date>(Type.date(), getDate);
    }

    getType() {
        return this.type;
    }

    generator(genFn: GenFunction<KeyType>) {
        this.genFn = genFn;
        this.autoGenerate = true as AutoGenerate;
        return this as PrimaryKey<true, KeyType>;
    }

    genKey(...args: unknown[]) {
        if (this.genFn) return this.genFn(...args);
        throw new Error("Generator function not defined");
    }

    /**
     * If the "autoIncrement" utility is being used
     */
    isAutoIncremented(): boolean {
        return this.autoGenerate && !this.genFn;
    }

    isGenerated(): boolean {
        return this.autoGenerate;
    }

    uuid() {
        if (!window.isSecureContext) {
            throw new Error("Window is not in a secure context");
        }
        return new PrimaryKey<true, string>(Type.string(), uuid);
    }

    static is(value: object): value is PrimaryKey<any, any> {
        return (
            typeof value === "object" && (value as any)?.symbol === this.SYMBOL
        );
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
                return areDatesEqual(key1, key2 as Date);
            default:
                return false;
        }
    }

    /**
     * Performs the array "includes" functionality, but works for Date objects
     * @param arr Array of validkeys
     * @param item Item to see if it's in the array
     */
    static inKeyList(arr: Iterable<ValidKey>, item: ValidKey): boolean {
        for (const key of arr) {
            if (this.compareKeyValue(key, item)) {
                return true;
            }
        }
        return false;
    }

    static readonly validKeyTag = Type.union([
        Type.string(),
        Type.number(),
        Type.date(),
    ]);
}

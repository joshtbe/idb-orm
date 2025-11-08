import { InvalidConfigError } from "../error.js";
import { Type, ValidKey, ValidKeyType } from "../util-types.js";
import { getDate, uuid } from "../utils.js";
import { GenFunction } from "./field-types.js";
import { VALIDATORS } from "./validators.js";

export default class PrimaryKey<
    AutoGenerate extends boolean,
    KeyType extends ValidKey
> {
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
        return VALIDATORS[this.type];
    }

    /**
     * If the internal objectStore "autoIncrement" utility is being used
     * @returns
     */
    isAutoIncremented() {
        return this.autoGenerate && !this.genFn;
    }
}

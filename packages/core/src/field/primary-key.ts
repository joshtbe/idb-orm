import { ValidKey, ValidKeyType } from "../types/common.js";
import { DEFAULT_SCHEMA_MAP } from "./constants.js";
import { GenFunction } from "./field-types.js";
import { v4 as uuid } from "uuid";

export default class PrimaryKey<
    AutoGenerate extends boolean,
    Type extends ValidKey
> {
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

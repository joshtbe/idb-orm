import { Dict, Literable, RequiredKey, Writeable } from "../util-types";
import {
    ArrayTag,
    BigIntTag,
    BooleanTag,
    CustomTag,
    DateTag,
    DiscriminatedUnionTag,
    FileTag,
    FloatTag,
    IntTag,
    LiteralTag,
    NullTag,
    NumberTag,
    ObjectTag,
    OptionalTag,
    RecordKeyable,
    RecordTag,
    SetTag,
    StringTag,
    Tag,
    TupleTag,
    TypeTag,
    UndefinedTag,
    UnionTag,
    UnknownTag,
} from "./tag";
import { ParseResult } from "../field";

interface TypeCache {
    [Tag.string]: StringTag;
    [Tag.number]: NumberTag;
    [Tag.boolean]: BooleanTag;
    [Tag.bigint]: BigIntTag;
    [Tag.undefined]: UndefinedTag;
    [Tag.null]: NullTag;
    [Tag.file]: FileTag;
    [Tag.date]: DateTag;
    [Tag.int]: IntTag;
    [Tag.float]: FloatTag;
    [Tag.unknown]: UnknownTag;
}

export abstract class Type<T> {
    // For future plans...
    abstract parse(value: unknown): ParseResult<T>;
    abstract toString(): string;
    abstract serialize(value: T): Promise<unknown>;
    abstract deserialize(value: unknown): Promise<T>;
    abstract isType(other: Type<any>): boolean;
    abstract isSubtype(other: Type<any>): boolean;
    abstract is(value: unknown): value is T;

    private static readonly cache: TypeCache = {} as TypeCache;

    /**
     * Gets a type from the primitive type cache, creating it if it doesn't exist
     * @param tag Primitive tag to acquire a type for
     * @returns Proper typetag
     */
    static getType<K extends keyof TypeCache>(tag: K): TypeCache[K] {
        const v = this.cache[tag];
        if (!v) {
            return (this.cache[tag] = { tag } as TypeCache[K]);
        }
        return v;
    }

    static string() {
        return this.getType(Tag.string);
    }
    static number() {
        return this.getType(Tag.number);
    }
    static boolean() {
        return this.getType(Tag.boolean);
    }
    static bigint() {
        return this.getType(Tag.bigint);
    }
    static undefined() {
        return this.getType(Tag.undefined);
    }
    static int() {
        return this.getType(Tag.int);
    }
    static float() {
        return this.getType(Tag.float);
    }

    static null() {
        return this.getType(Tag.null);
    }
    static file() {
        return this.getType(Tag.file);
    }
    static date() {
        return this.getType(Tag.date);
    }
    static unknown() {
        return this.getType(Tag.unknown);
    }

    static literal<const V extends Literable>(value: V): LiteralTag<V> {
        return {
            tag: Tag.literal,
            value,
        };
    }

    static array<V extends TypeTag>(element: V): ArrayTag<V> {
        return {
            tag: Tag.array,
            of: element,
        };
    }

    static discriminatedUnion<
        Base extends Dict<TypeTag> = Dict<TypeTag>,
        const Key extends string = string,
        const Options extends readonly RequiredKey<Key, TypeTag>[] = [],
    >(
        base: Base,
        key: Key,
        options: Options,
    ): DiscriminatedUnionTag<Base, Key, Writeable<Options>> {
        const keys = new Set();
        for (const opt of options) {
            const disc = opt[key];
            if (disc.tag !== Tag.literal) {
                throw new TypeError(
                    `Discriminator key '${key}' is not a literal.`,
                );
            }
            // Make sure the discriminator value is not repeated
            if (keys.has(disc.value)) {
                throw new TypeError(
                    `Value '${disc.value}' is repeated for discriminator '${key}'`,
                );
            }
            keys.add(disc.value);
        }

        return {
            tag: Tag.discriminatedUnion,
            base,
            key,
            options,
        };
    }

    static enum<const V extends readonly Literable[]>(items: V) {
        return Type.union(items.map((i) => Type.literal(i))) as UnionTag<{
            -readonly [K in keyof V]: LiteralTag<V[K]>;
        }>;
    }

    static set<V extends TypeTag>(element: V): SetTag<V> {
        return {
            tag: Tag.set,
            of: element,
        };
    }

    static union<const V extends TypeTag[]>(types: V): UnionTag<V> {
        return {
            tag: Tag.union,
            options: types,
        };
    }

    static optional<V extends TypeTag>(type: V): OptionalTag<V> {
        return {
            tag: Tag.optional,
            of: type,
        };
    }

    static object<R extends Dict<TypeTag>>(props: R): ObjectTag<R> {
        return {
            tag: Tag.object,
            props,
        };
    }

    static tuple<const V extends TypeTag[]>(types: V): TupleTag<V> {
        return {
            tag: Tag.tuple,
            elements: types,
        };
    }
    static custom<V>(opts: Omit<CustomTag<V>, "tag">): CustomTag<V> {
        return {
            tag: Tag.custom,
            ...opts,
        };
    }

    static record<K extends RecordKeyable, V extends TypeTag>(
        key: K,
        value: V,
    ): RecordTag<K, V> {
        return {
            tag: Tag.record,
            key,
            value,
        };
    }
}

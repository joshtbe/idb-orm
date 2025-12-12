import { Literable } from "../util-types";
import {
    ArrayTag,
    BigIntTag,
    BooleanTag,
    CustomTag,
    DateTag,
    DefaultTag,
    FileTag,
    LiteralTag,
    NumberTag,
    ObjectTag,
    OptionalTag,
    SetTag,
    StringTag,
    SymbolTag,
    Tag,
    TagToType,
    TupleTag,
    TypeTag,
    UnionTag,
    UnknownTag,
    VoidTag,
} from "./tag";

interface TypeCache {
    [Tag.string]: StringTag;
    [Tag.number]: NumberTag;
    [Tag.boolean]: BooleanTag;
    [Tag.bigint]: BigIntTag;
    [Tag.symbol]: SymbolTag;
    [Tag.void]: VoidTag;
    [Tag.file]: FileTag;
    [Tag.date]: DateTag;
    [Tag.unknown]: UnknownTag;
}

const cache: TypeCache = {} as TypeCache;

/**
 * Gets a type from the primitive type cache, creating it if it doesn't exist
 * @param tag Primitive tag to acquire a type for
 * @returns Proper typetag
 */
export function getType<K extends keyof TypeCache>(tag: K): TypeCache[K] {
    const v = cache[tag];
    if (!v) {
        return (cache[tag] = { tag } as TypeCache[K]);
    }
    return v;
}

export function String() {
    return getType(Tag.string);
}
export function Number() {
    return getType(Tag.number);
}
export function Boolean() {
    return getType(Tag.boolean);
}
export function BigInt() {
    return getType(Tag.bigint);
}
export function Symbol() {
    return getType(Tag.symbol);
}

export function Void() {
    return getType(Tag.void);
}
export function File() {
    return getType(Tag.file);
}
export function Date() {
    return getType(Tag.date);
}
export function Unknown() {
    return getType(Tag.unknown);
}

export function Literal<const V extends Literable>(value: V): LiteralTag<V> {
    return {
        tag: Tag.literal,
        value,
    };
}

export function Array<V extends TypeTag>(element: V): ArrayTag<V> {
    return {
        tag: Tag.array,
        of: element,
    };
}

export function Default<V extends TypeTag>(
    of: V,
    value: TagToType<V>
): DefaultTag<V> {
    return {
        tag: Tag.default,
        of,
        value: value,
    };
}

export function Set<V extends TypeTag>(element: V): SetTag<V> {
    return {
        tag: Tag.set,
        of: element,
    };
}

export function Union<const V extends TypeTag[]>(types: V): UnionTag<V> {
    return {
        tag: Tag.union,
        options: types,
    };
}

export function Optional<V extends TypeTag>(type: V): OptionalTag<V> {
    return {
        tag: Tag.optional,
        of: type,
    };
}

export function Object<R extends Record<string, TypeTag>>(
    props: R
): ObjectTag<R> {
    return {
        tag: Tag.object,
        props,
    };
}

export function Tuple<const V extends TypeTag[]>(types: V): TupleTag<V> {
    return {
        tag: Tag.tuple,
        elements: types,
    };
}
export function Custom<V>(opts: Omit<CustomTag<V>, "tag">): CustomTag<V> {
    return {
        tag: Tag.custom,
        ...opts,
    };
}

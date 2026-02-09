import {
    Dict,
    Promisable,
    RequiredKey,
    Simplify,
    Writeable,
} from "../util-types";

export const enum Tag {
    /* Valid primary keys */
    string,
    number,
    date,

    /* Primitive/unknown values */
    boolean,
    bigint,
    file,
    float,
    int,
    unknown,
    undefined,
    null,

    /* "Complex" values */
    literal,
    array,
    set,
    union,
    optional,
    object,
    discriminatedUnion,
    record,
    tuple,
    class,
    custom,
}

export interface UndefinedTag {
    tag: Tag.undefined;
}
export interface NullTag {
    tag: Tag.null;
}
export interface StringTag {
    tag: Tag.string;
}
export interface NumberTag {
    tag: Tag.number;
}
export interface IntTag {
    tag: Tag.int;
}
export interface FloatTag {
    tag: Tag.float;
}
export interface DateTag {
    tag: Tag.date;
}
export interface BooleanTag {
    tag: Tag.boolean;
}
export interface BigIntTag {
    tag: Tag.bigint;
}

export interface UnknownTag {
    tag: Tag.unknown;
}

export interface FileTag {
    tag: Tag.file;
}
export interface LiteralTag<V = unknown> {
    tag: Tag.literal;
    value: V;
}

export interface ArrayTag<V extends TypeTag = TypeTag> {
    tag: Tag.array;
    of: V;
}

export interface SetTag<V extends TypeTag = TypeTag> {
    tag: Tag.set;
    of: V;
}

export interface OptionalTag<V extends TypeTag = TypeTag> {
    tag: Tag.optional;
    of: V;
}

export interface UnionTag<V extends TypeTag[] = TypeTag[]> {
    tag: Tag.union;
    options: V;
}

export interface DiscriminatedUnionTag<
    Base extends Dict<TypeTag> = Dict<TypeTag>,
    Key extends string = string,
    Options extends readonly RequiredKey<Key, TypeTag>[] = readonly RequiredKey<
        Key,
        TypeTag
    >[],
> {
    tag: Tag.discriminatedUnion;
    key: Key;
    base: Base;
    options: Options;
}

export interface TupleTag<V extends TypeTag[] = TypeTag[]> {
    tag: Tag.tuple;
    elements: V;
}

export interface ObjectTag<P extends Dict<TypeTag> = Dict<TypeTag>> {
    tag: Tag.object;
    props: P;
}

/**
 * Types that can be the key of a record type
 */
export type RecordKeyable =
    | NumberTag
    | StringTag
    | LiteralTag<string>
    | LiteralTag<number>
    | UnionTag<RecordKeyable[]>;

export interface RecordTag<
    Key extends RecordKeyable = RecordKeyable,
    Value extends TypeTag = TypeTag,
> {
    tag: Tag.record;
    key: Key;
    value: Value;
}

export interface CustomTag<V = any, PR = any> {
    tag: Tag.custom;
    isType: (test: unknown) => boolean;
    parse?: (test: unknown) => PR;
    serialize?: ((value: V) => Promisable<unknown>) | TypeTag;
    deserialize?: ((value: unknown) => Promisable<V>) | TypeTag;
}

type Dec = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type TypeTag =
    | LiteralTag
    | StringTag
    | IntTag
    | FloatTag
    | NumberTag
    | DateTag
    | BooleanTag
    | UnknownTag
    | FileTag
    | BigIntTag
    | SetTag
    | OptionalTag
    | UnionTag
    | RecordTag
    | ArrayTag
    | ObjectTag
    | TupleTag
    | CustomTag
    | NullTag
    | UndefinedTag
    | DiscriminatedUnionTag;

interface SimpleTagMap {
    [Tag.null]: null;
    [Tag.number]: number;
    [Tag.boolean]: boolean;
    [Tag.bigint]: bigint;
    [Tag.float]: number;
    [Tag.int]: number;
    [Tag.string]: string;
    [Tag.undefined]: undefined;
    [Tag.unknown]: unknown;
    [Tag.date]: Date;
    [Tag.file]: File;
}

type ObjectTagToType<T extends Dict<TypeTag>, Depth extends number> = {
    [K in keyof T]: TagToType<T[K], Dec[Depth]>;
};

export type TagToType<
    T extends TypeTag,
    Depth extends number = 10,
> = Depth extends 0
    ? any
    : T["tag"] extends keyof SimpleTagMap
      ? SimpleTagMap[T["tag"]]
      : T extends TupleTag<infer TEls>
        ? {
              [K in keyof TEls]: TagToType<TEls[K], Dec[Depth]>;
          }
        : T extends SetTag<infer T>
          ? Set<TagToType<T, Dec[Depth]>>
          : T extends UnionTag<infer TOpts>
            ? TagToType<TOpts[number], Dec[Depth]>
            : T extends ArrayTag<infer T>
              ? TagToType<T, Dec[Depth]>[]
              : T extends ObjectTag<infer P>
                ? ObjectTagToType<P, Dec[Depth]>
                : T extends CustomTag<infer V>
                  ? V
                  : T extends DiscriminatedUnionTag<
                          infer Base,
                          string,
                          infer Options
                      >
                    ? Simplify<
                          ObjectTagToType<Base, Dec[Depth]> &
                              ObjectTagToType<
                                  Writeable<Options[number]>,
                                  Dec[Depth]
                              >
                      >
                    : T extends LiteralTag<infer V>
                      ? V
                      : T extends RecordTag<infer K, infer V>
                        ? Record<
                              TagToType<K, Dec[Depth]>,
                              TagToType<V, Dec[Depth]>
                          >
                        : never;

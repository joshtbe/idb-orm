import { MaybeGenerator, Promisable } from "../util-types";

export const enum Tag {
    /* Valid primary keys */
    string,
    number,
    date,

    /* Primitive/unknown values */
    boolean,
    symbol,
    bigint,
    file,
    void,
    unknown,

    /* "Complex" values */
    literal,
    array,
    set,
    union,
    optional,
    default,
    object,
    tuple,
    custom,
}

export interface VoidTag {
    tag: Tag.void;
}
export interface StringTag {
    tag: Tag.string;
}
export interface NumberTag {
    tag: Tag.number;
}
export interface DateTag {
    tag: Tag.date;
}
export interface BooleanTag {
    tag: Tag.boolean;
}
export interface SymbolTag {
    tag: Tag.symbol;
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

export interface TupleTag<V extends TypeTag[] = TypeTag[]> {
    tag: Tag.tuple;
    elements: V;
}

export interface ObjectTag<
    P extends Record<string, TypeTag> = Record<string, TypeTag>
> {
    tag: Tag.object;
    props: P;
}

export interface DefaultTag<T extends TypeTag = TypeTag> {
    tag: Tag.default;
    of: T;
    value: MaybeGenerator<unknown>;
}

export interface CustomTag<V = any, PR = any> {
    tag: Tag.custom;
    isType: (test: unknown) => boolean;
    parse?: (test: unknown) => PR;
    serialize?: (value: V) => Promisable<unknown>;
    deserialize?: (value: unknown) => Promisable<V>;
}

export type TypeTag =
    | VoidTag
    | LiteralTag
    | StringTag
    | NumberTag
    | DateTag
    | BooleanTag
    | SymbolTag
    | UnknownTag
    | FileTag
    | BigIntTag
    | SetTag
    | OptionalTag
    | UnionTag
    | ArrayTag
    | ObjectTag
    | TupleTag
    | CustomTag
    | DefaultTag;

type Dec = [0, 0, 1, 2, 3, 4, 5];

export type TagToType<
    T extends TypeTag,
    Depth extends number = 5
> = Depth extends 0
    ? any
    : T extends StringTag
    ? string
    : T extends NumberTag
    ? number
    : T extends BooleanTag
    ? boolean
    : T extends LiteralTag<infer V>
    ? V
    : T extends DateTag
    ? Date
    : T extends SymbolTag
    ? symbol
    : T extends UnknownTag
    ? unknown
    : T extends FileTag
    ? File
    : T extends BigIntTag
    ? bigint
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
    ? {
          [K in keyof P]: TagToType<P[K], Dec[Depth]>;
      }
    : T extends DefaultTag<infer T> | OptionalTag<infer T>
    ? TagToType<T, Dec[Depth]> | undefined
    : T extends CustomTag<infer V>
    ? V
    : never;

/* eslint-disable @typescript-eslint/no-wrapper-object-types */
export type JavaScriptPrimitive =
    | number
    | string
    | null
    | undefined
    | boolean
    | bigint;

/**'
 * Error Types supported by `structuredClone()`
 */
export type ErrorTypes =
    | Error
    | EvalError
    | RangeError
    | ReferenceError
    | SyntaxError
    | TypeError
    | URIError;

/**
 * Types that correspond to a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray|Typed Array} structure.
 */
export type TypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float16Array
    | Float32Array
    | Float64Array
    | BigInt64Array
    | BigUint64Array;

/**
 * All base JS types storable by `structuredClone()`
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types
 */
export type JavaScriptStorable =
    | Array<IndexedDbStorable>
    | ArrayBuffer
    | Boolean
    | DataView
    | Date
    | ErrorTypes
    | Map<IndexedDbStorable, IndexedDbStorable>
    | Number
    | { [key: string | number]: IndexedDbStorable }
    | RegExp
    | Set<IndexedDbStorable>
    | String
    | TypedArray
    | JavaScriptPrimitive;

/**
 * All WebAPI types storable by `structuredClone()`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#webapi_types
 *
 * Some classes are omitted due to lack of browser support.
 */
export type WebAPIStorable =
    | AudioData
    | Blob
    | CryptoKey
    | DOMException
    | DOMMatrix
    | DOMMatrixReadOnly
    | DOMPoint
    | DOMPointReadOnly
    | DOMQuad
    | DOMRect
    | DOMRectReadOnly
    | EncodedAudioChunk
    | EncodedVideoChunk
    | File
    | FileList
    | FileSystemDirectoryHandle
    | FileSystemHandle
    | ImageBitmap
    | RTCCertificate
    | RTCEncodedAudioFrame
    | RTCEncodedVideoFrame
    | VideoFrame
    | WebTransportError;

/**
 * All of the types that are supported by the `structuredClone()` deep copy algorithm.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm|Structured Clone Algorithm}
 * Some WebAPI types from the list are omitted as they are not widely supported.
 */
export type IndexedDbStorable = JavaScriptStorable | WebAPIStorable;
import { type MessageShape, toJsonString } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import { functionDecl, overload } from "../common/decls.js";
import { Bytes } from "../common/types/bytes.js";
import { err } from "../common/types/err.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import { BytesType, DynType, StringType } from "../common/types/types.js";

/**
 * EncodersOptions configures the encoder extension library.
 */
export interface EncodersOptions {
  /**
   * version limits the library to functions introduced at or below the selected version.
   *
   * When omitted, all available functions are included.
   */
  readonly version?: number;
}

/**
 * EncodersLibrary describes the singleton encoder extension and its serialization metadata.
 */
export type EncodersLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * encoders configures extended functions for string, byte, and object encodings.
 *
 * `base64.decode` decodes a base64-encoded string to bytes and accepts padded or
 * unpadded standard base64. `base64.encode` encodes bytes as padded standard
 * base64. Version 1 additionally provides `json.encode`, which serializes a CEL
 * value as protobuf-compatible JSON.
 */
export function encoders(options: EncodersOptions = {}): EncodersLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const functions = [
    functionDecl("base64.decode", {
      overloads: [
        overload("base64_decode_string", [StringType], BytesType, {
          unaryBinding: (value) => base64Decode(value),
        }),
      ],
    }),
    functionDecl("base64.encode", {
      overloads: [
        overload("base64_encode_bytes", [BytesType], StringType, {
          unaryBinding: (value) => base64Encode(value),
        }),
      ],
    }),
  ];
  if (version >= 1) {
    functions.push(
      functionDecl("json.encode", {
        overloads: [
          overload("json_encode_dyn", [DynType], StringType, {
            unaryBinding: (value) => jsonEncode(value),
          }),
        ],
      }),
    );
  }
  return {
    libraryAlias: "encoders",
    libraryName: "cel.lib.ext.encoders",
    libraryVersion: version,
    compileOptions: { functions },
    programOptions: {},
  };
}

/**
 * base64Decode converts a CEL string containing standard base64 into CEL bytes.
 */
function base64Decode(value: Val): Val {
  try {
    const source = value.value() as string;
    const padded = source.padEnd(source.length + ((4 - (source.length % 4)) % 4), "=");
    if (
      padded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(padded)
    ) {
      return err("illegal base64 data");
    }
    const binary = globalThis.atob(padded);
    return new Bytes(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * base64Encode converts CEL bytes into a padded standard base64 CEL string.
 */
function base64Encode(value: Val): Val {
  try {
    const bytes = value.value() as Uint8Array;
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return new CelString(globalThis.btoa(binary));
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}

/**
 * jsonEncode converts a CEL value to protobuf `Value` and serializes its canonical JSON form.
 */
function jsonEncode(value: Val): Val {
  try {
    const jsonValue = value.convertToNative(ValueSchema) as MessageShape<typeof ValueSchema>;
    return new CelString(toJsonString(ValueSchema, jsonValue));
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause));
  }
}

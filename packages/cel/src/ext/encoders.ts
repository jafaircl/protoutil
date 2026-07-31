import { type MessageShape, toJsonString } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimator,
  type FunctionEstimator,
  fixedCostEstimate,
  type SizeEstimate,
  sizeEstimate,
  unknownCostEstimate,
  unknownSizeEstimate,
} from "../checker/cost.js";
import { StringTraversalCostFactor } from "../common/cost.js";
import { functionDecl, overload } from "../common/decls.js";
import { Bytes } from "../common/types/bytes.js";
import { err } from "../common/types/err.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import { BytesType, DynType, StringType } from "../common/types/types.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";

/** uint64Max is the upper bound used for unknown CEL sizes. */
const uint64Max = (1n << 64n) - 1n;

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
    compileOptions: {
      functions,
      cost:
        version >= 1
          ? {
              overloadCostEstimates: {
                base64_decode_string: estimateDecode,
                base64_encode_bytes: estimateEncode,
                json_encode_dyn: estimateJSONEncode,
              },
            }
          : undefined,
    },
    programOptions:
      version >= 1
        ? {
            costTracking: {
              overloadTrackers: {
                base64_decode_string: trackBase64,
                base64_encode_bytes: trackBase64,
                json_encode_dyn: trackJSONEncode,
              },
            },
          }
        : {},
  };
}

/** estimateEncode computes base64 encoding cost and encoded result size. */
const estimateEncode: FunctionEstimator = (estimator, _target, args) => {
  if (args.length !== 1) {
    return undefined;
  }
  const size = estimateNodeSize(estimator, args[0]!);
  const cost = size.multiplyByCostFactor(StringTraversalCostFactor).add(fixedCostEstimate(1));
  const resultSize = sizeEstimate(
    (size.Min * 4n + 2n) / 3n,
    size.Max > uint64Max / 4n ? uint64Max : (size.Max * 4n + 2n) / 3n,
  );
  return new CallEstimate(cost.Min, cost.Max, resultSize);
};

/** estimateDecode computes base64 decoding cost and decoded result size. */
const estimateDecode: FunctionEstimator = (estimator, _target, args) => {
  if (args.length !== 1) {
    return undefined;
  }
  const size = estimateNodeSize(estimator, args[0]!);
  const cost = size.multiplyByCostFactor(StringTraversalCostFactor).add(fixedCostEstimate(1));
  return new CallEstimate(
    cost.Min,
    cost.Max,
    sizeEstimate((size.Min * 3n) / 4n, (size.Max * 3n) / 4n),
  );
};

/** estimateJSONEncode reports an unbounded structural JSON encoding cost and result size. */
const estimateJSONEncode: FunctionEstimator = (_estimator, _target, args) => {
  if (args.length !== 1) {
    return undefined;
  }
  const cost = unknownCostEstimate();
  return new CallEstimate(cost.Min, cost.Max, unknownSizeEstimate());
};

/** trackBase64 computes the runtime traversal and call cost for base64 conversion. */
const trackBase64: FunctionTracker = {
  cost: ({ args }) => Math.ceil(valueSize(args[0]!) * StringTraversalCostFactor) + 1,
};

/** trackJSONEncode reports the largest safely representable TypeScript runtime cost. */
const trackJSONEncode: FunctionTracker = {
  cost: () => Number.MAX_SAFE_INTEGER,
};

/** estimateNodeSize returns a computed, caller-hinted, or unknown argument size. */
function estimateNodeSize(estimator: CostEstimator, node: AstNode): SizeEstimate {
  return node.computedSize() ?? estimator.estimateSize(node) ?? unknownSizeEstimate();
}

/** valueSize returns the byte or UTF-16 string length used by encoder runtime costs. */
function valueSize(value: Val): number {
  const native = value.value();
  return typeof native === "string" || native instanceof Uint8Array ? native.length : 1;
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

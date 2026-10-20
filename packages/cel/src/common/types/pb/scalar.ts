import { ScalarType } from "@bufbuild/protobuf";
import { Bool } from "../bool.js";
import { Bytes } from "../bytes.js";
import { Double } from "../double.js";
import { Int } from "../int.js";
import type { Val } from "../ref/index.js";
import { String as CelString } from "../string.js";
import { Uint } from "../uint.js";

/** Preserve the protobuf numeric family, which JavaScript primitives cannot distinguish. */
export function scalarFieldToValue(value: unknown, scalar: ScalarType): Val {
  switch (scalar) {
    case ScalarType.BOOL:
      return new Bool(value as boolean);
    case ScalarType.STRING:
      return new CelString(value as string);
    case ScalarType.BYTES:
      return new Bytes(value as Uint8Array);
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return new Double(Number(value ?? 0));
    case ScalarType.UINT32:
    case ScalarType.UINT64:
    case ScalarType.FIXED32:
    case ScalarType.FIXED64:
      return new Uint(BigInt((value as number | bigint) ?? 0));
    default:
      return new Int(BigInt((value as number | bigint) ?? 0));
  }
}

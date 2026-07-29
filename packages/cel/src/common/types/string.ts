import { AnySchema, StringValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { RE2JS } from "@bufbuild/re2";
import { timestampFromString } from "@protoutil/core/wkt";
import * as overloads from "../overloads.js";
import { anyValueType } from "./any-value.js";
import { Bool, False, True } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { durationOf } from "./duration.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import { nativeTypeName, packAnyString } from "./native.js";
import { durationNanosChecked, maxUnixTime, minUnixTime } from "./overflow.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { timestampOf } from "./timestamp.js";
import type { Adder, Comparer, Matcher, Receiver, Sizer } from "./traits/index.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  IntType,
  StringType,
  TimestampType,
  TypeType,
  UintType,
} from "./types.js";
import { Uint } from "./uint.js";

const stringOneArgOverloads = new Map<string, (lhs: Val, rhs: Val) => Val>([
  [overloads.Contains, stringContains],
  [overloads.EndsWith, stringEndsWith],
  [overloads.StartsWith, stringStartsWith],
]);

/**
 * String supports addition, comparison, matching, and size functions.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: cel-go defines this runtime value type as String and the port preserves that seam.
export class String implements Val, Adder, Comparer, Matcher, Receiver, Sizer {
  constructor(private readonly inner: string) {}
  public add(other: Val): Val {
    if (!(other instanceof String)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new String(this.inner + other.inner);
  }
  public compare(other: Val): Val {
    if (!(other instanceof String)) {
      return maybeNoSuchOverloadErr(other);
    }
    if (this.inner < other.inner) {
      return new Int(-1n);
    }
    if (this.inner > other.inner) {
      return new Int(1n);
    }
    return new Int(0n);
  }
  public convertToNative(typeDesc?: unknown): unknown {
    if (typeDesc === globalThis.String || typeDesc === undefined) {
      return this.inner;
    }
    if (typeDesc === anyValueType || typeDesc === AnySchema) {
      return packAnyString(StringValueSchema, this.inner);
    }
    if (typeDesc === StringValueSchema) {
      return { $typeName: StringValueSchema.typeName, value: this.inner };
    }
    if (typeDesc === ValueSchema) {
      return { $typeName: ValueSchema.typeName, kind: { case: "stringValue", value: this.inner } };
    }
    if (
      typeDesc instanceof Function &&
      typeDesc !== globalThis.Number &&
      typeDesc !== globalThis.Boolean &&
      typeDesc !== globalThis.String
    ) {
      try {
        return new (typeDesc as { new (value: string): unknown })(this.inner);
      } catch {
        // Fall through to the conversion error below when the constructor is not a string-like target.
      }
    }
    throw new globalThis.Error(
      `unsupported native conversion from string to '${nativeTypeName(typeDesc)}'`,
    );
  }
  public convertToType(typeValue: RefType): Val {
    switch (typeValue) {
      case IntType: {
        if (!/^[+-]?\d+$/.test(this.inner)) {
          break;
        }
        const n = BigInt(this.inner);
        if (n >= -(1n << 63n) && n <= (1n << 63n) - 1n) {
          return new Int(n);
        }
        break;
      }
      case UintType: {
        if (!/^(?:\+?\d+)$/.test(this.inner)) {
          break;
        }
        const n = BigInt(this.inner.startsWith("+") ? this.inner.slice(1) : this.inner);
        if (n <= (1n << 64n) - 1n) {
          return new Uint(n);
        }
        break;
      }
      case DoubleType: {
        if (this.inner === "NaN") {
          return new Double(Number.NaN);
        }
        if (
          this.inner === "Infinity" ||
          this.inner === "+Infinity" ||
          this.inner === "Inf" ||
          this.inner === "+Inf"
        ) {
          return new Double(Infinity);
        }
        if (this.inner === "-Infinity" || this.inner === "-Inf") {
          return new Double(-Infinity);
        }
        const n = globalThis.Number(this.inner);
        if (!globalThis.Number.isNaN(n)) {
          return new Double(n);
        }
        break;
      }
      case BoolType:
        if (/^(?:1|t|T|TRUE|true|True)$/.test(this.inner)) {
          return new Bool(true);
        }
        if (/^(?:0|f|F|FALSE|false|False)$/.test(this.inner)) {
          return new Bool(false);
        }
        break;
      case BytesType:
        return new Bytes(new TextEncoder().encode(this.inner));
      case DurationType: {
        const match = /^(-)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ns)?$/.exec(
          this.inner,
        );
        if (!match) {
          break;
        }
        let nanos = 0n;
        if (match[2]) {
          nanos += BigInt(match[2]) * 3_600_000_000_000n;
        }
        if (match[3]) {
          nanos += BigInt(match[3]) * 60_000_000_000n;
        }
        if (match[4]) {
          const [whole, frac = ""] = match[4].split(".");
          nanos += BigInt(whole) * 1_000_000_000n;
          nanos += BigInt(frac.padEnd(9, "0").slice(0, 9));
        }
        if (match[5]) {
          nanos += BigInt(match[5]);
        }
        try {
          return durationOf(durationNanosChecked(match[1] ? -nanos : nanos));
        } catch (error) {
          return wrapErr(error);
        }
      }
      case TimestampType: {
        try {
          const ts = timestampFromString(this.inner);
          if (ts.seconds < minUnixTime || ts.seconds > maxUnixTime) {
            throw new Error("timestamp overflow");
          }
          return timestampOf(ts.seconds, ts.nanos);
        } catch (error) {
          return wrapErr(error);
        }
      }
      case StringType:
        return this;
      case TypeType:
        return StringType;
    }
    return err(`type conversion error from '${StringType}' to '${typeValue.typeName()}'`);
  }
  public equal(other: Val): Val {
    return other instanceof String && this.inner === other.inner ? True : False;
  }

  /** IsZeroValue returns true if the string is empty. */
  public isZeroValue(): boolean {
    return this.inner.length === 0;
  }
  public match(pattern: Val): Val {
    if (!(pattern instanceof String)) {
      return maybeNoSuchOverloadErr(pattern);
    }
    try {
      return new Bool(compileRegexPattern(pattern.inner).test(this.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }
  public receive(functionName: string, _overload: string, args: Val[]): Val {
    switch (args.length) {
      case 1: {
        const overload = stringOneArgOverloads.get(functionName);
        if (overload) {
          return overload(this, args[0]!);
        }
      }
    }
    return maybeNoSuchOverloadErr(this);
  }
  public size(): Val {
    return new Int(BigInt([...this.inner].length));
  }
  public type(): RefType {
    return StringType;
  }
  public value(): string {
    return this.inner;
  }
}

/**
 * compileRegexPattern compiles a CEL regular expression with RE2 syntax and execution semantics.
 */
export function compileRegexPattern(pattern: string): RE2JS {
  return RE2JS.compile(pattern);
}

/**
 * StringContains returns whether the string contains a substring.
 */
export function stringContains(s: Val, sub: Val): Val {
  if (!(s instanceof String) || !(sub instanceof String)) {
    return maybeNoSuchOverloadErr(s instanceof String ? sub : s);
  }
  return new Bool(s.value().includes(sub.value()));
}

/**
 * StringEndsWith returns whether the target string contains the input suffix.
 */
export function stringEndsWith(s: Val, suffix: Val): Val {
  if (!(s instanceof String) || !(suffix instanceof String)) {
    return maybeNoSuchOverloadErr(s instanceof String ? suffix : s);
  }
  return new Bool(s.value().endsWith(suffix.value()));
}

/**
 * StringStartsWith returns whether the target string contains the input prefix.
 */
export function stringStartsWith(s: Val, prefix: Val): Val {
  if (!(s instanceof String) || !(prefix instanceof String)) {
    return maybeNoSuchOverloadErr(s instanceof String ? prefix : s);
  }
  return new Bool(s.value().startsWith(prefix.value()));
}

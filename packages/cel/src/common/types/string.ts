import * as overloads from "../overloads.js";
import { Bool } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { durationOf } from "./duration.js";
import { err, maybeNoSuchOverloadErr, wrapErr } from "./err.js";
import { Int } from "./int.js";
import type { Type as RefType, Val } from "./ref/index.js";
import { timestampOf } from "./timestamp.js";
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
export class String {
  constructor(private readonly inner: string) {}

  /** Add implements traits.Adder.Add. */
  public add(other: Val): Val {
    if (!(other instanceof String)) {
      return maybeNoSuchOverloadErr(other);
    }
    return new String(this.inner + other.inner);
  }

  /** Compare implements traits.Comparer.Compare. */
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

  /** ConvertToNative implements ref.Val.ConvertToNative. */
  public convertToNative(): string {
    return this.inner;
  }

  /** ConvertToType implements ref.Val.ConvertToType. */
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
        const match = /^(-)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(this.inner);
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
        return durationOf(match[1] ? -nanos : nanos);
      }
      case TimestampType: {
        const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(
          this.inner,
        );
        if (!match) {
          break;
        }
        const millis = Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        );
        const seconds = BigInt(Math.trunc(millis / 1000));
        const nanos = Number((match[7] ?? "").padEnd(9, "0"));
        return timestampOf(seconds, nanos);
      }
      case StringType:
        return this;
      case TypeType:
        return StringType;
    }
    return err(`type conversion error from '${StringType}' to '${typeValue.typeName()}'`);
  }

  /** Equal implements ref.Val.Equal. */
  public equal(other: Val): Val {
    return new Bool(other instanceof String && this.inner === other.inner);
  }

  /** IsZeroValue returns true if the string is empty. */
  public isZeroValue(): boolean {
    return this.inner.length === 0;
  }

  /** Match implements traits.Matcher.Match. */
  public match(pattern: Val): Val {
    if (!(pattern instanceof String)) {
      return maybeNoSuchOverloadErr(pattern);
    }
    try {
      return new Bool(new RegExp(pattern.inner).test(this.inner));
    } catch (error) {
      return wrapErr(error);
    }
  }

  /** Receive implements traits.Receiver.Receive. */
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

  /** Size implements traits.Sizer.Size. */
  public size(): Val {
    return new Int(BigInt([...this.inner].length));
  }

  /** Type implements ref.Val.Type. */
  public type(): RefType {
    return StringType;
  }

  /** Value implements ref.Val.Value. */
  public value(): string {
    return this.inner;
  }
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

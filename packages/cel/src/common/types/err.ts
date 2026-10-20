import type { Type as RefType, Val } from "./ref/index.js";

let ErrTypeValue: RefType | undefined;

/**
 * Error allows types.Err values to be treated as CEL error values.
 */
export interface Error extends globalThis.Error, Val {}

/**
 * Err extends the built-in Error and implements ref.Val.
 */
export class Err extends globalThis.Error implements Error {
  constructor(
    message: string,
    private idValue = 0,
  ) {
    super(message);
    this.name = "Err";
  }
  public convertToNative(): never {
    throw this;
  }
  public convertToType(): Val {
    return this;
  }
  public equal(): Val {
    return this;
  }
  public type(): RefType {
    return ErrTypeValue!;
  }
  public value(): unknown {
    return this;
  }

  /** NodeID returns the AST node ID of the expression that returned the error. */
  public nodeId(): number {
    return this.idValue;
  }

  /** Is indicates whether the current error matches the target error. */
  public is(target: unknown): boolean {
    return target instanceof globalThis.Error && target.message === this.message;
  }
}

/**
 * setErrType installs the shared error type singleton after types.ts initializes it.
 */
export function setErrType(type: RefType): void {
  ErrTypeValue = type;
}

/**
 * Err creates a new Err described by the format string and args.
 */
export function err(message: string, ...args: unknown[]): Val {
  return new Err(formatMessage(message, args));
}

/**
 * ErrFromString creates a new Err with the provided message.
 */
export function errFromString(message: string): Val {
  return new Err(message);
}

/**
 * ErrWithNodeID creates a new Err described by the format string and args.
 */
export function errWithNodeId(id: number, message: string, ...args: unknown[]): Val {
  return new Err(formatMessage(message, args), id);
}

/**
 * LabelErrNode labels an Err with the provided node id if needed.
 */
export function labelErrNode(id: number, val: Val): Val {
  if (val instanceof Err && val.nodeId() === 0) {
    return new Err(val.message, id);
  }
  return val;
}

/**
 * NoSuchOverloadErr returns a shared no-such-overload error value.
 */
export function noSuchOverloadErr(): Val {
  return celErrNoSuchOverload;
}

/**
 * UnsupportedRefValConversionErr indicates a native value could not be converted to a CEL ref.Val.
 */
export function unsupportedRefValConversionErr(val: unknown): Val {
  return err("unsupported conversion to ref.Val: (%T)%v", val, val);
}

/**
 * MaybeNoSuchOverloadErr returns the input unknown or error value when present, else a new no-such-overload error.
 */
export function maybeNoSuchOverloadErr(val: Val): Val {
  return valOrErr(val, "no such overload");
}

/**
 * ValOrErr either returns the existing error or creates a new one.
 */
export function valOrErr(val: Val | undefined, message: string, ...args: unknown[]): Val {
  if (val === undefined || !isUnknownOrError(val)) {
    return err(message, ...args);
  }
  return val;
}

/**
 * WrapErr wraps an existing error into a CEL Err value.
 */
export function wrapErr(err: unknown): Val {
  if (err instanceof Err) {
    return err;
  }
  if (err instanceof globalThis.Error) {
    return new Err(err.message);
  }
  return new Err(String(err));
}

/**
 * IsError returns whether the input element is an Err value.
 */
export function isError(val: Val): val is Err {
  return val instanceof Err;
}

const errTimestampOverflow = new globalThis.Error("timestamp overflow");

/**
 * celErrTimestampOverflow is an error representing timestamp overflow.
 */
export const celErrTimestampOverflow = new Err(errTimestampOverflow.message);

/**
 * errDivideByZero is an error indicating a division by zero of an integer value.
 */
export const errDivideByZero = new globalThis.Error("division by zero");

/**
 * errModulusByZero is an error indicating a modulus by zero of an integer value.
 */
export const errModulusByZero = new globalThis.Error("modulus by zero");

/**
 * errIntOverflow is an error representing integer overflow.
 */
export const errIntOverflow = new globalThis.Error("integer overflow");

/**
 * errUintOverflow is an error representing unsigned integer overflow.
 */
export const errUintOverflow = new globalThis.Error("unsigned integer overflow");

/**
 * errDurationOverflow is an error representing duration overflow.
 */
export const errDurationOverflow = new globalThis.Error("duration overflow");

/**
 * errTimestampOverflowValue is an error representing timestamp overflow.
 */
export const errTimestampOverflowValue = errTimestampOverflow;

const celErrNoSuchOverload = new Err("no such overload");

function isUnknownOrError(val: Val): boolean {
  return (val as { type?: () => RefType }).type?.().typeName() === "unknown" || val instanceof Err;
}

function formatMessage(message: string, args: unknown[]): string {
  let index = 0;
  return message.replace(/%[vsT]/g, (token) => {
    const arg = args[index++];
    switch (token) {
      case "%T":
        return describeType(arg);
      default:
        return describeValue(arg);
    }
  });
}

/**
 * describeType formats a CEL-like type description for error messages.
 */
function describeType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "object" || typeof value === "function") {
    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName && constructorName !== "Object") {
      return constructorName;
    }
  }
  return typeof value;
}

/**
 * describeValue formats CEL values using their string form rather than plain object coercion.
 */
function describeValue(value: unknown): string {
  if (value instanceof Err) {
    return value.message;
  }
  if (typeof value === "object" && value !== null) {
    const stringValue = (value as { toString?: () => string }).toString?.();
    if (stringValue && stringValue !== "[object Object]") {
      return stringValue;
    }
  }
  return String(value);
}

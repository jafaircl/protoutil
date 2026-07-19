import syncedCases from "../../../testdata/cel-go/cel-go-test-cases.json";
import type { Type as ExprType } from "../../gen/cel/expr/checked_pb.js";
import {
  AnyType,
  BoolType,
  String as CelString,
  Double,
  DoubleType,
  DurationType,
  ErrorType,
  Int,
  IntNegOne,
  IntOne,
  IntType,
  IntZero,
  listType,
  MapType,
  mapType,
  NullType,
  NullValue,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  StringType,
  TimestampType,
  type Type,
  TypeType,
  typeParamType,
  typeToExprType,
  typeTypeWithParam,
  Uint,
  UintType,
  type Val,
} from "./index.js";

const jsonCases = syncedCases as Record<string, unknown>;

export function syncedTypeCases<T>(name: string): T[] {
  return (jsonCases[name] as T[] | undefined) ?? [];
}

export function resolveSyncedExpr(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveSyncedExpr(entry));
  }
  if (typeof value === "object" && value !== null && "$expr" in value) {
    return resolveExprString((value as { $expr: string }).$expr);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveSyncedExpr(entry)]),
    );
  }
  return value;
}

export function resolveSyncedType(expr: unknown): Type {
  return resolveSyncedExpr(expr) as Type;
}

export function resolveSyncedProtoType(expr: unknown): ExprType {
  const value = expr as { $expr?: string } | undefined;
  if (value?.$expr) {
    return resolveProtoTypeExprString(value.$expr);
  }
  return expr as ExprType;
}

export function resolveSyncedVal(expr: unknown): Val {
  const unresolved = expr as { $expr?: string } | undefined;
  if (
    unresolved?.$expr?.startsWith("uint64(") ||
    unresolved?.$expr === "uint64(math.MaxInt64) + 1"
  ) {
    return new Uint(resolveExprString(unresolved.$expr) as bigint);
  }
  if (
    unresolved?.$expr?.startsWith("float64(") ||
    unresolved?.$expr === "math.NaN()" ||
    unresolved?.$expr === "math.Inf(1)"
  ) {
    return new Double(resolveExprString(unresolved.$expr) as number);
  }
  const resolved = resolveSyncedExpr(expr);
  if (typeof resolved === "bigint") {
    return new Int(resolved);
  }
  if (typeof resolved === "number") {
    return new Double(resolved);
  }
  if (typeof resolved === "string") {
    return new CelString(resolved);
  }
  return resolved as Val;
}

function resolveExprString(expr: string): unknown {
  switch (expr) {
    case "AnyType":
      return AnyType;
    case "BoolType":
      return BoolType;
    case "BytesType":
      return resolveSyncedType({ $expr: 'NewObjectType("google.protobuf.BytesValue")' });
    case "DoubleType":
      return DoubleType;
    case "DurationType":
      return DurationType;
    case "DynType":
      return resolveSyncedType({ $expr: 'NewObjectType("google.protobuf.Value")' });
    case "ErrorType":
    case "chkdecls.Error":
      return ErrorType;
    case "IntType":
      return IntType;
    case "IntZero":
      return IntZero;
    case "IntOne":
      return IntOne;
    case "IntNegOne":
      return IntNegOne;
    case "ListType":
      return listType(resolveSyncedType({ $expr: "DynType" }));
    case "MapType":
      return MapType;
    case "NullType":
      return NullType;
    case "NullValue":
      return NullValue;
    case "StringType":
      return StringType;
    case "TimestampType":
      return TimestampType;
    case "TypeType":
      return TypeType;
    case "UintType":
      return UintType;
    case "IntType.TypeName()":
      return IntType.typeName();
    case "DoubleType.TypeName()":
      return DoubleType.typeName();
    case "UintType.TypeName()":
      return UintType.typeName();
    case "errUintOverflow":
      return "unsigned integer overflow";
    case "errIntOverflow":
      return "integer overflow";
    case "errTimestampOverflow":
      return "timestamp overflow";
    case 'errors.New("type conversion error")':
      return "type conversion error";
    case "NoSuchOverloadErr()":
      return "no such overload";
    case 'NewErr("NaN values cannot be ordered")':
      return "NaN values cannot be ordered";
  }
  if (expr.startsWith("Int(") && expr.endsWith(")")) {
    return new Int(BigInt(expr.slice(4, -1)));
  }
  if (expr.startsWith("Uint(") && expr.endsWith(")")) {
    const inner = expr.slice(5, -1);
    if (inner === "math.MaxInt64") {
      return new Uint(9223372036854775807n);
    }
    if (inner === "math.MaxUint64") {
      return new Uint(18446744073709551615n);
    }
    return new Uint(BigInt(inner));
  }
  if (expr === "Uint(math.MaxInt64) + 1") {
    return new Uint(9223372036854775808n);
  }
  if (expr.startsWith("Double(") && expr.endsWith(")")) {
    const inner = expr.slice(7, -1);
    if (inner === "math.NaN()") {
      return new Double(Number.NaN);
    }
    if (inner === "math.MaxInt64") {
      return new Double(Number.MAX_SAFE_INTEGER + 1);
    }
    if (inner === "math.MaxUint64") {
      return new Double(Number.MAX_SAFE_INTEGER + 1);
    }
    if (inner === "math.MinInt64") {
      return new Double(-Number.MAX_SAFE_INTEGER - 1);
    }
    return new Double(Number(inner));
  }
  if (expr === "Double(math.MaxInt64) + 1025.0") {
    return new Double(Number.MAX_SAFE_INTEGER + 1025);
  }
  if (expr === "Double(math.MaxUint64) + 2049.0") {
    return new Double(Number.MAX_SAFE_INTEGER + 2049);
  }
  if (expr === "Double(math.MinInt64) - 1025.0") {
    return new Double(-Number.MAX_SAFE_INTEGER - 1025);
  }
  if (expr === "math.NaN()") {
    return Number.NaN;
  }
  if (expr === "math.Inf(1)") {
    return Number.POSITIVE_INFINITY;
  }
  if (expr === "float64(math.MaxInt64)") {
    return Number("9223372036854775808");
  }
  if (expr === "float64(math.MinInt64)") {
    return Number("-9223372036854775808");
  }
  if (expr === "float64(math.MaxUint64)") {
    return Number("18446744073709552000");
  }
  if (expr === "uint64(math.MaxInt64) + 1") {
    return BigInt("9223372036854775808");
  }
  if (expr.startsWith('String("') && expr.endsWith('")')) {
    return new CelString(expr.slice(8, -2));
  }
  if (expr.startsWith("int64(") && expr.endsWith(")")) {
    return BigInt(expr.slice(6, -1));
  }
  if (expr.startsWith("uint64(") && expr.endsWith(")")) {
    return BigInt(expr.slice(7, -1));
  }
  if (expr.startsWith("float64(") && expr.endsWith(")")) {
    return Number(expr.slice(8, -1));
  }
  if (expr === "maxUnixTime + 1" || expr === "minUnixTime - 1") {
    return expr;
  }
  if (expr.startsWith('chkdecls.NewObjectType("') && expr.endsWith('")')) {
    return objectType(expr.slice(23, -2));
  }
  if (expr.startsWith('NewObjectType("') && expr.endsWith('")')) {
    return objectType(expr.slice(15, -2));
  }
  if (expr.startsWith('NewTypeParamType("') && expr.endsWith('")')) {
    return typeParamType(expr.slice(18, -2));
  }
  if (expr.startsWith("NewListType(") && expr.endsWith(")")) {
    return listType(resolveSyncedType({ $expr: expr.slice(12, -1) }));
  }
  if (expr.startsWith("NewOptionalType(") && expr.endsWith(")")) {
    return optionalType(resolveSyncedType({ $expr: expr.slice(16, -1) }));
  }
  if (expr.startsWith("NewNullableType(") && expr.endsWith(")")) {
    return nullableType(resolveSyncedType({ $expr: expr.slice(16, -1) }));
  }
  if (expr.startsWith("NewTypeTypeWithParam(") && expr.endsWith(")")) {
    return typeTypeWithParam(resolveSyncedType({ $expr: expr.slice(21, -1) }));
  }
  if (expr.startsWith("NewMapType(") && expr.endsWith(")")) {
    const [left, right] = splitArgs(expr.slice(11, -1));
    return mapType(resolveSyncedType({ $expr: left }), resolveSyncedType({ $expr: right }));
  }
  if (expr.startsWith("NewOpaqueType(") && expr.endsWith(")")) {
    const [name, ...rest] = splitArgs(expr.slice(14, -1));
    return opaqueType(
      stripQuoted(name),
      ...rest.map((entry) => resolveSyncedType({ $expr: entry })),
    );
  }
  throw new Error(`unsupported synced expr: ${expr}`);
}

function resolveProtoTypeExprString(expr: string): ExprType {
  switch (expr) {
    case "chkdecls.Error":
      return {
        $typeName: "cel.expr.Type",
        typeKind: { case: "error", value: { $typeName: "google.protobuf.Empty" } },
      } as ExprType;
  }
  if (expr.startsWith('chkdecls.NewObjectType("') && expr.endsWith('")')) {
    const match = /^chkdecls\.NewObjectType\("(.+)"\)$/.exec(expr);
    if (!match) {
      throw new Error(`unsupported synced proto type expr: ${expr}`);
    }
    return typeToExprType(objectType(match[1]!));
  }
  if (expr.startsWith("chkdecls.NewListType(") && expr.endsWith(")")) {
    return typeToExprType(listType(resolveSyncedType({ $expr: expr.slice(21, -1) })));
  }
  if (expr.startsWith("chkdecls.NewMapType(") && expr.endsWith(")")) {
    const [left, right] = splitArgs(expr.slice(20, -1));
    return typeToExprType(
      mapType(resolveSyncedType({ $expr: left }), resolveSyncedType({ $expr: right })),
    );
  }
  if (expr.startsWith('chkdecls.NewAbstractType("') && expr.endsWith(")")) {
    const parts = splitArgs(expr.slice(25, -1));
    return typeToExprType(
      opaqueType(
        stripQuoted(parts[0]!),
        ...parts.slice(1).map((entry) => resolveSyncedType({ $expr: entry })),
      ),
    );
  }
  return resolveSyncedExpr({ $expr: expr }) as ExprType;
}

function splitArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out;
}

function stripQuoted(source: string): string {
  return source.replace(/^"/, "").replace(/"$/, "");
}

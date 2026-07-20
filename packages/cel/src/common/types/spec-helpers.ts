import { create, type Message } from "@bufbuild/protobuf";
import {
  AnySchema,
  anyPack,
  Int32ValueSchema,
  ValueSchema,
  NullValue as WktNullValue,
} from "@bufbuild/protobuf/wkt";
import type { Type as ExprType } from "../../gen/cel/expr/checked_pb.js";
import { SourceInfoSchema } from "../../gen/cel/expr/syntax_pb.js";
import {
  NestedTestAllTypesSchema,
  TestAllTypes_NestedEnum,
  TestAllTypes_NestedMessageSchema,
  TestAllTypesSchema,
} from "../../gen/test/proto3pb/test_all_types_pb.js";
import {
  AnyType,
  BoolType,
  String as CelString,
  Double,
  DoubleType,
  DurationType,
  durationOf,
  ErrorType,
  False,
  Int,
  IntNegOne,
  IntOne,
  IntType,
  IntZero,
  JSONListType,
  JSONStructType,
  listType,
  MapType,
  mapType,
  NullType,
  NullValue,
  nullableType,
  OptionalNone,
  objectType,
  opaqueType,
  optionalOf,
  optionalType,
  StringType,
  TimestampType,
  True,
  type Type,
  TypeType,
  typeParamType,
  typeToExprType,
  typeTypeWithParam,
  Uint,
  UintType,
  type Val,
} from "./index.js";
import { dynamicList } from "./list.js";
import { jsonList, jsonStruct } from "./pb/spec-helpers.js";
import { DefaultTypeAdapter, type Registry } from "./provider.js";

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

export function resolveNullTypeExpr(value: { $expr?: string }): unknown {
  const expr = value.$expr;
  if (!expr) {
    return undefined;
  }
  const typeMap = new Map<string, unknown>([
    ["JSONValueType", ValueSchema],
    ["JSONNullType", WktNullValue],
    ["anyValueType", AnySchema],
    ["reflect.TypeOf(NullValue)", NullValue],
    ["reflect.TypeOf(1)", Number],
    ["JSONListType", JSONListType],
    ["JSONStructType", JSONStructType],
  ]);
  return typeMap.get(expr);
}

export function resolveNullOut(value: unknown): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (expr === "structpb.NewNullValue()") {
    return {
      $typeName: "google.protobuf.Value",
      kind: { case: "nullValue", value: WktNullValue.NULL_VALUE },
    };
  }
  if (expr === "structpb.NullValue_NULL_VALUE") {
    return WktNullValue.NULL_VALUE;
  }
  if (expr === "testPackAny(t, structpb.NewNullValue())") {
    return anyPack(ValueSchema, {
      $typeName: "google.protobuf.Value",
      kind: { case: "nullValue", value: WktNullValue.NULL_VALUE },
    });
  }
  if (expr === "NullValue") {
    return NullValue;
  }
  return value;
}

export function resolveNullErr(value: unknown): string {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (expr?.startsWith('errors.New("') && expr.endsWith('")')) {
    return expr.slice(12, -2);
  }
  return String(value);
}

export function resolveListSyncedValue(value: unknown): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (!expr) {
    return resolveSyncedExpr(value);
  }
  if (expr === "&structpb.ListValue{}") {
    return jsonList([]);
  }
  const listLiteral =
    /^&structpb\.ListValue(?:\{Values: \[\]?\*structpb\.Value\{([\s\S]*)\}\})?$/.exec(expr);
  if (listLiteral) {
    const entries = listLiteral[1]?.trim();
    if (!entries) {
      return jsonList([]);
    }
    return jsonList(splitArgs(entries).map((entry) => resolveStructPbScalar(entry)));
  }
  const addMatch =
    /^DefaultTypeAdapter\.NativeToValue\((\[\]ref\.Val\{[\s\S]*\})\)\.\(traits\.Lister\)\.Add\(DefaultTypeAdapter\.NativeToValue\((\[\]ref\.Val\{[\s\S]*\})\)\)$/.exec(
      expr,
    );
  if (addMatch) {
    return dynamicList(DefaultTypeAdapter, parseRefValList(addMatch[1]!)).add(
      dynamicList(DefaultTypeAdapter, parseRefValList(addMatch[2]!)),
    );
  }
  return resolveSyncedExpr(value);
}

export function isProtoListValue(value: unknown): value is { $typeName: string } {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

export function resolveMapSyncedValue(value: unknown): unknown {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (!expr) {
    return resolveSyncedExpr(value);
  }
  if (expr === "&structpb.Struct{}") {
    return jsonStruct({});
  }
  if (expr === 'obj.Get(String("map_int64_nested_type"))') {
    return new Map();
  }
  if (expr === 'obj.Get(String("map_string_string"))') {
    return { hello: "world" };
  }
  const structMatch =
    /^&structpb\.Struct(?:\{\s*Fields: map\[string\]\*structpb\.Value\{([\s\S]*)\},?\s*\})?$/.exec(
      expr,
    );
  if (structMatch) {
    const entries = structMatch[1]?.trim();
    if (!entries) {
      return jsonStruct({});
    }
    return jsonStruct(
      Object.fromEntries(
        splitArgs(entries).map((entry) => {
          const colonIndex = entry.indexOf(":");
          const key = unquoteGoString(
            entry.slice(0, colonIndex).trim().replace(/^"/, "").replace(/"$/, ""),
          );
          const val = entry.slice(colonIndex + 1).trim();
          return [key, resolveStructPbScalar(val)];
        }),
      ),
    );
  }
  return resolveSyncedExpr(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !("$typeName" in value)
  );
}

export function isProtoStruct(value: unknown): value is { $typeName: string } {
  return typeof value === "object" && value !== null && "$typeName" in value;
}

export function resolveProviderTypeName(value: { $expr?: string } | string): string {
  if (typeof value === "string") {
    return canonicalProviderTypeName(value);
  }
  switch (value.$expr) {
    case "msgTypeName":
      return ".google.expr.proto3.test.TestAllTypes";
    case 'msgTypeName + "Undefined"':
      return ".google.expr.proto3.test.TestAllTypesUndefined";
    default:
      throw new Error(`unsupported provider synced type name: ${value.$expr}`);
  }
}

export function canonicalProviderTypeName(typeName: string): string {
  return typeName.replace(/^google\.api\.expr\.v1alpha1\./, "cel.expr.");
}

export function resolveRuntimeAssignableValue(value: unknown): unknown {
  if (typeof value === "number") {
    return new Double(value);
  }
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (expr?.startsWith("time.Duration(") && expr.endsWith(")")) {
    return durationOf(BigInt(expr.slice(14, -1)));
  }
  if (expr) {
    return resolveSyncedExpr(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveRuntimeAssignableValue(entry));
  }
  if (value && typeof (value as { type?: unknown }).type === "function") {
    return value;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveRuntimeAssignableValue(entry)]),
    );
  }
  return resolveSyncedExpr(value);
}

export function resolveProviderFields(
  reg: Registry,
  fields: Record<string, unknown>,
): Record<string, Val> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, resolveProviderFieldValue(reg, value)]),
  );
}

export function resolveProviderMessage(value: unknown): Message {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (!expr) {
    return value as Message;
  }
  if (expr === "&proto3pb.TestAllTypes{}") {
    return create(TestAllTypesSchema);
  }
  if (expr.includes("StandaloneEnum: proto3pb.TestAllTypes_BAR")) {
    return create(TestAllTypesSchema, { standaloneEnum: TestAllTypes_NestedEnum.BAR });
  }
  if (expr.includes("SingleInt32Wrapper: wrapperspb.Int32(123)")) {
    return {
      ...create(TestAllTypesSchema),
      singleInt32Wrapper: create(Int32ValueSchema, { value: 123 }) as never,
    } as Message;
  }
  if (expr.includes("RepeatedInt64: []int64{3, 2, 1}")) {
    return create(TestAllTypesSchema, { repeatedInt64: [3n, 2n, 1n] });
  }
  if (expr.includes("SingleNestedEnum: proto3pb.TestAllTypes_BAZ")) {
    return create(TestAllTypesSchema, {
      nestedType: { case: "singleNestedEnum", value: TestAllTypes_NestedEnum.BAZ },
    });
  }
  if (expr.includes("SingleValue: structpb.NewBoolValue(true)")) {
    return create(TestAllTypesSchema, { singleValue: true as never });
  }
  if (expr.includes("SingleValue: structpb.NewListValue(")) {
    return create(TestAllTypesSchema, {
      singleValue: ["hello", 10.2] as never,
    });
  }
  if (expr.includes("RepeatedNestedMessage: []*proto3pb.TestAllTypes_NestedMessage{{Bb: 123}}")) {
    return create(TestAllTypesSchema, {
      repeatedNestedMessage: [create(TestAllTypes_NestedMessageSchema, { bb: 123 })],
    });
  }
  if (expr.includes("MapInt64NestedType: map[int64]*proto3pb.NestedTestAllTypes{")) {
    return create(TestAllTypesSchema, {
      mapInt64NestedType: {
        "1234": create(NestedTestAllTypesSchema, {
          payload: create(TestAllTypesSchema, { singleInt32: 1234 }),
        }),
      },
    });
  }
  if (expr.startsWith("&exprpb.SourceInfo{")) {
    return create(SourceInfoSchema, {
      location: "TestRegistryNewValue",
      lineOffsets: [0, 2],
      positions: { "1": 2, "2": 4 },
    });
  }
  throw new Error(`unsupported provider synced message expr: ${expr}`);
}

function resolveProviderFieldValue(reg: Registry, value: unknown): Val {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (!expr) {
    return reg.nativeToValue(resolveRuntimeAssignableValue(value));
  }
  if (expr.startsWith("reg.NativeToValue(") && expr.endsWith(")")) {
    return reg.nativeToValue(resolveProviderNativeValue(reg, expr.slice(18, -1)));
  }
  if (expr === "True" || expr === "False") {
    return reg.nativeToValue(resolveSyncedExpr(value));
  }
  return resolveSyncedVal(value);
}

function resolveProviderNativeValue(_reg: Registry, expr: string): unknown {
  const trimmed = expr.trim();
  if (trimmed.startsWith("[]")) {
    return resolveProviderNativeList(trimmed);
  }
  if (trimmed.startsWith("map[")) {
    return resolveProviderNativeMap(trimmed);
  }
  throw new Error(`unsupported provider native value expr: ${expr}`);
}

function resolveProviderNativeList(expr: string): unknown[] {
  const match = /^\[\](?:int64|float64|any)\{([\s\S]*)\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported provider native list expr: ${expr}`);
  }
  const entries = splitArgs(match[1]!.trim());
  return entries.map((entry) => resolveProviderNativeLiteral(entry));
}

function resolveProviderNativeMap(expr: string): Record<string, unknown> {
  const match = /^map\[([^\]]+)\](any|int64|int)\{([\s\S]*)\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported provider native map expr: ${expr}`);
  }
  const entries = match[3]!.trim();
  if (!entries) {
    return {};
  }
  return Object.fromEntries(
    splitArgs(entries).map((entry) => {
      const colon = entry.indexOf(":");
      const key = entry.slice(0, colon).trim().replace(/^"|"$/g, "");
      const value = entry.slice(colon + 1).trim();
      return [key, resolveProviderNativeLiteral(value)];
    }),
  );
}

function resolveProviderNativeLiteral(expr: string): unknown {
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return unquoteGoString(expr.slice(1, -1));
  }
  if (/^-?\d+\.\d+$/.test(expr)) {
    return Number(expr);
  }
  if (/^-?\d+$/.test(expr)) {
    return BigInt(expr);
  }
  if (expr.startsWith("&proto3pb.TestAllTypes_NestedMessage{")) {
    const bbMatch = /Bb:\s*(\d+)/.exec(expr);
    return create(TestAllTypes_NestedMessageSchema, { bb: Number(bbMatch?.[1] ?? "0") });
  }
  if (expr.startsWith("&proto3pb.NestedTestAllTypes{")) {
    const intMatch = /SingleInt32:\s*(\d+)/.exec(expr);
    return create(NestedTestAllTypesSchema, {
      payload: create(TestAllTypesSchema, { singleInt32: Number(intMatch?.[1] ?? "0") }),
    });
  }
  throw new Error(`unsupported provider native literal expr: ${expr}`);
}

function resolveExprString(expr: string): unknown {
  expr = expr.trim().replace(/,$/, "").trim();
  switch (expr) {
    case "AnyType":
      return AnyType;
    case "BoolType":
      return BoolType;
    case "BytesType":
      return resolveSyncedExpr({ $expr: 'NewObjectType("google.protobuf.BytesValue")' }) as Type;
    case "DoubleType":
      return DoubleType;
    case "DurationType":
      return DurationType;
    case "DynType":
      return resolveSyncedExpr({ $expr: 'NewObjectType("google.protobuf.Value")' }) as Type;
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
      return listType(resolveSyncedExpr({ $expr: "DynType" }) as Type);
    case "MapType":
      return MapType;
    case "NullType":
      return NullType;
    case "NullValue":
      return NullValue;
    case "OptionalNone":
      return OptionalNone;
    case "StringType":
      return StringType;
    case "TimestampType":
      return TimestampType;
    case "TypeType":
      return TypeType;
    case "UintType":
      return UintType;
    case "True":
      return true;
    case "False":
      return false;
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
  if (expr.startsWith("uint(") && expr.endsWith(")")) {
    return new Uint(BigInt(expr.slice(5, -1)));
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
  if (expr === "1.1 + math.MaxInt64") {
    return Number("9223372036854775809.1");
  }
  if (expr === "1.1 + math.MaxUint64") {
    return Number("18446744073709552001.1");
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
  const newObjectMatch = /^NewObjectType\(\s*"([\s\S]*?)"\s*,?\s*\)$/.exec(expr);
  if (newObjectMatch) {
    return objectType(newObjectMatch[1]!);
  }
  const checkedObjectMatch = /^chkdecls\.NewObjectType\(\s*"([\s\S]*?)"\s*,?\s*\)$/.exec(expr);
  if (checkedObjectMatch) {
    return objectType(checkedObjectMatch[1]!);
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
  if (expr.startsWith("time.Duration(") && expr.endsWith(")")) {
    return durationOf(BigInt(expr.slice(14, -1)));
  }
  if (expr === "maxUnixTime + 1" || expr === "minUnixTime - 1") {
    return expr;
  }
  if (expr.startsWith('NewTypeParamType("') && expr.endsWith('")')) {
    return typeParamType(expr.slice(18, -2));
  }
  if (expr.startsWith("NewListType(") && expr.endsWith(")")) {
    return listType(resolveSyncedExpr({ $expr: expr.slice(12, -1) }) as Type);
  }
  if (expr.startsWith("NewOptionalType(") && expr.endsWith(")")) {
    return optionalType(resolveSyncedExpr({ $expr: expr.slice(16, -1) }) as Type);
  }
  if (expr.startsWith("NewNullableType(") && expr.endsWith(")")) {
    return nullableType(resolveSyncedExpr({ $expr: expr.slice(16, -1) }) as Type);
  }
  if (expr.startsWith("NewTypeTypeWithParam(") && expr.endsWith(")")) {
    return typeTypeWithParam(resolveSyncedExpr({ $expr: expr.slice(21, -1) }) as Type);
  }
  if (expr.startsWith("NewMapType(") && expr.endsWith(")")) {
    const [left, right] = splitArgs(expr.slice(11, -1));
    return mapType(
      resolveSyncedExpr({ $expr: left }) as Type,
      resolveSyncedExpr({ $expr: right }) as Type,
    );
  }
  if (expr.startsWith("NewOpaqueType(") && expr.endsWith(")")) {
    const [name, ...rest] = splitArgs(expr.slice(14, -1));
    return opaqueType(
      stripQuoted(name),
      ...rest.map((entry) => resolveSyncedExpr({ $expr: entry }) as Type),
    );
  }
  if (expr.startsWith("OptionalOf(") && expr.endsWith(")")) {
    return optionalOf(resolveOptionalArg(expr.slice(11, -1)));
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
    return typeToExprType(listType(resolveSyncedExpr({ $expr: expr.slice(21, -1) }) as Type));
  }
  if (expr.startsWith("chkdecls.NewMapType(") && expr.endsWith(")")) {
    const [left, right] = splitArgs(expr.slice(20, -1));
    return typeToExprType(
      mapType(
        resolveSyncedExpr({ $expr: left }) as Type,
        resolveSyncedExpr({ $expr: right }) as Type,
      ),
    );
  }
  if (expr.startsWith('chkdecls.NewAbstractType("') && expr.endsWith(")")) {
    const parts = splitArgs(expr.slice(25, -1));
    return typeToExprType(
      opaqueType(
        stripQuoted(parts[0]!),
        ...parts.slice(1).map((entry) => resolveSyncedExpr({ $expr: entry }) as Type),
      ),
    );
  }
  return resolveSyncedExpr({ $expr: expr }) as ExprType;
}

function resolveOptionalArg(expr: string): Val {
  if (expr === "True") {
    return True as unknown as Val;
  }
  if (expr === "False") {
    return False as unknown as Val;
  }
  return resolveSyncedExpr({ $expr: expr }) as Val;
}

function parseRefValList(expr: string): Val[] {
  const match = /^\[\]ref\.Val\{([\s\S]*)\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported ref.Val list expr: ${expr}`);
  }
  const inner = match[1]!.trim();
  if (!inner) {
    return [];
  }
  return splitArgs(inner).map((entry) => resolveSyncedExpr({ $expr: entry }) as Val);
}

function resolveStructPbScalar(expr: string): unknown {
  if (expr === "structpb.NewNullValue()") {
    return null;
  }
  const boolMatch = /^structpb\.NewBoolValue\((true|false)\)$/.exec(expr);
  if (boolMatch) {
    return boolMatch[1] === "true";
  }
  const numberMatch = /^structpb\.NewNumberValue\((.+)\)$/.exec(expr);
  if (numberMatch) {
    return Number(numberMatch[1]!);
  }
  const stringMatch = /^structpb\.NewStringValue\("([\s\S]*)"\)$/.exec(expr);
  if (stringMatch) {
    return unquoteGoString(stringMatch[1]!);
  }
  throw new Error(`unsupported structpb scalar expr: ${expr}`);
}

function splitArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const prev = i > 0 ? source[i - 1] : "";
    if (char === '"' && prev !== "\\") {
      inString = !inString;
    } else if (!inString && char === "{") {
      depth += 1;
    } else if (!inString && char === "}") {
      depth -= 1;
    } else if (!inString && char === "(") {
      depth += 1;
    } else if (!inString && char === ")") {
      depth -= 1;
    } else if (!inString && depth === 0 && char === ",") {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length > 0);
}

function unquoteGoString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}

function stripQuoted(source: string): string {
  return source.replace(/^"/, "").replace(/"$/, "");
}

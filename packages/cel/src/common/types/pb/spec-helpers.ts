import {
  create,
  createFileRegistry,
  createRegistry,
  type DescMessage,
  equals,
  fromBinary,
  fromJson,
  type JsonValue,
  type Message,
  type MessageInitShape,
  type MessageShape,
  toBinary,
} from "@bufbuild/protobuf";
import {
  AnySchema,
  anyPack,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  DurationSchema,
  FloatValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  ListValueSchema,
  NullValue,
  StringValueSchema,
  StructSchema,
  TimestampSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import {
  ExampleTypeSchema,
  ExtendedExampleTypeSchema,
  file_test_proto2pb_test_all_types,
  NestedTestAllTypesSchema as Proto2NestedTestAllTypesSchema,
  TestAllTypesSchema as Proto2TestAllTypesSchema,
} from "@protoutil/testing/cel/proto2";
import {
  file_test_proto3pb_test_all_types,
  NestedTestAllTypesSchema as Proto3NestedTestAllTypesSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
  TestAllTypes_NestedEnum,
  TestJsonNamesSchema,
} from "@protoutil/testing/cel/proto3";
import { file_test_proto3pb_test_import } from "@protoutil/testing/cel/proto3-import";
import { expect } from "vitest";
import { resolveSyncedExpr, resolveSyncedProtoType } from "../spec-helpers.js";

const registry = createRegistry(
  file_test_proto2pb_test_all_types,
  file_test_proto3pb_test_all_types,
  file_test_proto3pb_test_import,
  AnySchema.file,
  DurationSchema.file,
  ListValueSchema.file,
  StructSchema.file,
  TimestampSchema.file,
  ValueSchema.file,
);
const schemaByTypeName = new Map<string, DescMessage>([
  [AnySchema.typeName, AnySchema],
  [BoolValueSchema.typeName, BoolValueSchema],
  [BytesValueSchema.typeName, BytesValueSchema],
  [DoubleValueSchema.typeName, DoubleValueSchema],
  [DurationSchema.typeName, DurationSchema],
  [FloatValueSchema.typeName, FloatValueSchema],
  [Int32ValueSchema.typeName, Int32ValueSchema],
  [Int64ValueSchema.typeName, Int64ValueSchema],
  [ListValueSchema.typeName, ListValueSchema],
  [Proto3NestedTestAllTypesSchema.typeName, Proto3NestedTestAllTypesSchema],
  [Proto3TestAllTypesSchema.typeName, Proto3TestAllTypesSchema],
  [StringValueSchema.typeName, StringValueSchema],
  [StructSchema.typeName, StructSchema],
  [TimestampSchema.typeName, TimestampSchema],
  [UInt32ValueSchema.typeName, UInt32ValueSchema],
  [UInt64ValueSchema.typeName, UInt64ValueSchema],
  [ValueSchema.typeName, ValueSchema],
]);

export function expectProtoEqual(actual: unknown, expected: unknown): void {
  expect(isProtoMessage(actual)).toBe(true);
  expect(isProtoMessage(expected)).toBe(true);
  const schema = registry.getMessage((actual as Message).$typeName);
  if (!schema) {
    throw new Error(`message descriptor not found for ${(actual as Message).$typeName}`);
  }
  expect(
    equals(schema, actual as MessageShape<typeof schema>, expected as MessageShape<typeof schema>, {
      registry,
      unpackAny: true,
      unknown: true,
      extensions: true,
    }),
  ).toBe(true);
}

/**
 * syncedProtoEqual compares protobuf messages with cel-go's Any and unknown-field semantics.
 */
export function syncedProtoEqual(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  if (!isProtoMessage(left) || !isProtoMessage(right) || left.$typeName !== right.$typeName) {
    return false;
  }
  const schema = registry.getMessage(left.$typeName);
  if (!schema) {
    throw new Error(`message descriptor not found for ${left.$typeName}`);
  }
  return equals(schema, left as MessageShape<typeof schema>, right as MessageShape<typeof schema>, {
    registry,
    unpackAny: true,
    unknown: true,
    extensions: true,
  });
}

export function descriptorRoundTripFiles() {
  const files = new Map<
    string,
    typeof file_test_proto3pb_test_all_types | typeof file_test_proto3pb_test_import
  >();
  files.set(file_test_proto3pb_test_all_types.proto.name, file_test_proto3pb_test_all_types);
  for (const dep of file_test_proto3pb_test_all_types.dependencies) {
    files.set(dep.proto.name, dep as typeof file_test_proto3pb_test_import);
  }
  return [
    ...createFileRegistry(file_test_proto3pb_test_all_types.proto, (protoFileName) =>
      files.get(protoFileName),
    ).files,
  ];
}

export function dynamicMessage<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
): MessageShape<Desc> {
  return fromBinary(schema, toBinary(schema, message));
}

export function jsonList(values: unknown[]) {
  return fromJson(ListValueSchema, values as JsonValue);
}

export function jsonStruct(value: Record<string, unknown>) {
  return fromJson(StructSchema, value as JsonValue);
}

export function jsonValue(value: unknown) {
  return fromJson(ValueSchema, value as JsonValue);
}

export function resolveSyncedPbExpr(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveSyncedPbExpr(entry));
  }
  if (typeof value === "object" && value !== null && "$expr" in value) {
    return resolvePbExprString((value as { $expr: string }).$expr);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveSyncedPbExpr(entry)]),
    );
  }
  return value;
}

export function isUnsupportedSyncedPbExpr(expr: string): boolean {
  return (
    expr === "(*wrapperspb.BoolValue)(nil)" ||
    expr === "(*wrapperspb.BytesValue)(nil)" ||
    expr === "(*wrapperspb.DoubleValue)(nil)" ||
    expr === "(*wrapperspb.FloatValue)(nil)" ||
    expr === "(*wrapperspb.Int32Value)(nil)" ||
    expr === "(*wrapperspb.Int64Value)(nil)" ||
    expr === "(*wrapperspb.StringValue)(nil)" ||
    expr === "(*wrapperspb.UInt32Value)(nil)" ||
    expr === "(*wrapperspb.UInt64Value)(nil)" ||
    expr === "struct{ proto.Message }{wrapperspb.Int32(1234)}"
  );
}

function resolvePbExprString(expr: string): unknown {
  const protoMessage = maybeResolveProto3Message(expr);
  if (protoMessage !== undefined) {
    return protoMessage;
  }

  const reflected = maybeResolveReflectedValue(expr);
  if (reflected !== undefined) {
    return reflected;
  }

  const wrapperValue = maybeResolveWrapperValue(expr);
  if (wrapperValue !== undefined) {
    return wrapperValue;
  }

  const structValue = maybeResolveStructValue(expr);
  if (structValue !== undefined) {
    return structValue;
  }

  const packedAny = maybeResolveAnyMessage(expr);
  if (packedAny !== undefined) {
    return packedAny;
  }

  const dynamic = maybeResolveDynamicMessage(expr);
  if (dynamic !== undefined) {
    return dynamic;
  }

  const bytes = maybeResolveBytes(expr);
  if (bytes !== undefined) {
    return bytes;
  }

  const timeValue = maybeResolveTimeLike(expr);
  if (timeValue !== undefined) {
    return timeValue;
  }

  switch (expr) {
    case "msgDesc.Zero()":
    case "msgDesc.New().Interface()":
    case "&structpb.Value{}":
      return create(ValueSchema);
    case "&structpb.ListValue{}":
      return create(ListValueSchema);
    case "structpb.NullValue_NULL_VALUE":
      return NullValue.NULL_VALUE;
    case "jsonList(t, []any{})":
      return jsonList([]);
    case "jsonList(t, []any{true, 1.0})":
      return jsonList([true, 1.0]);
    case 'jsonStruct(t, map[string]any{"hello": "world"})':
      return jsonStruct({ hello: "world" });
  }
  if (expr.startsWith("decls.")) {
    return resolveSyncedProtoType({ $expr: `chk${expr}` });
  }
  return resolveSyncedExpr({ $expr: expr });
}

function maybeResolveProto3Message(expr: string): unknown {
  const match = /^&proto3pb\.(TestAllTypes|NestedTestAllTypes)(?:\{([\s\S]*)\})?$/.exec(expr);
  if (!match) {
    return undefined;
  }
  const [, messageName, rawBody] = match;
  const schema =
    messageName === "TestAllTypes" ? Proto3TestAllTypesSchema : Proto3NestedTestAllTypesSchema;
  const body = rawBody?.trim();
  if (!body) {
    return create(schema);
  }
  const fields = Object.fromEntries(
    splitTopLevel(body).map((entry) => {
      const colonIndex = entry.indexOf(":");
      if (colonIndex === -1) {
        throw new Error(`invalid proto3pb.TestAllTypes literal: ${expr}`);
      }
      const fieldName = entry.slice(0, colonIndex).trim();
      const fieldValue = entry.slice(colonIndex + 1).trim();
      return [goFieldNameToTs(fieldName), resolvePbFieldLiteral(fieldName, fieldValue)];
    }),
  );
  return create(schema, fields as MessageInitShape<typeof schema>);
}

/**
 * resolvePbFieldLiteral decodes the protobuf field literals emitted by synced cel-go fixtures.
 */
function resolvePbFieldLiteral(fieldName: string, expr: string): unknown {
  const message = maybeResolveProto3Message(expr);
  if (message !== undefined) {
    return message;
  }
  const packed = maybeResolveEqualAny(expr);
  if (packed !== undefined) {
    return packed;
  }
  const list = /^\[\](?:int32|int64|uint32|uint64)\{([\s\S]*)\}$/.exec(expr);
  if (list) {
    const entries = splitTopLevel(list[1] ?? "");
    const usesBigInt = /(?:Int64|Uint64)$/.test(fieldName);
    return entries.map((entry) => (usesBigInt ? BigInt(entry) : Number(entry)));
  }
  if (expr.startsWith("map[int64]*proto3pb.NestedTestAllTypes{")) {
    return resolveNestedMessageMap(expr);
  }
  if (expr === "proto3pb.TestAllTypes_BAR") {
    return TestAllTypes_NestedEnum.BAR;
  }
  const scalar = resolvePbScalarLiteral(expr);
  return /(?:Int64|Uint64)$/.test(fieldName) && typeof scalar === "number"
    ? BigInt(scalar)
    : scalar;
}

/**
 * resolveNestedMessageMap decodes a Go map literal whose values use inferred nested-message types.
 */
function resolveNestedMessageMap(expr: string): Record<string, unknown> {
  const match = /^map\[int64\]\*proto3pb\.NestedTestAllTypes\{([\s\S]*)\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported nested protobuf map literal: ${expr}`);
  }
  return Object.fromEntries(
    splitTopLevel(match[1] ?? "").map((entry) => {
      const colonIndex = entry.indexOf(":");
      if (colonIndex === -1) {
        throw new Error(`invalid nested protobuf map entry: ${entry}`);
      }
      const key = entry.slice(0, colonIndex).trim();
      const value = entry.slice(colonIndex + 1).trim();
      const nestedExpr = value.startsWith("{") ? `&proto3pb.NestedTestAllTypes${value}` : value;
      return [key, resolvePbExprString(nestedExpr)];
    }),
  );
}

/**
 * maybeResolveEqualAny decodes the Any helper calls used by cel-go's protobuf equality suite.
 */
function maybeResolveEqualAny(expr: string): unknown {
  const match = /^(packAny|doublePackAny|badPackAny|misPackAny)\(t,\s*([\s\S]+)\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  const [, helper, nestedExpr] = match;
  const nested = resolvePbExprString(nestedExpr!);
  if (!isProtoMessage(nested)) {
    throw new Error(`${helper}() requires a protobuf message: ${expr}`);
  }
  const schema = schemaByTypeName.get(nested.$typeName);
  if (!schema) {
    throw new Error(`message descriptor not found for ${nested.$typeName}`);
  }
  const packed = anyPack(schema, nested as MessageShape<typeof schema>);
  switch (helper) {
    case "doublePackAny":
      return anyPack(AnySchema, packed);
    case "badPackAny":
      return { ...packed, typeUrl: "type.googleapis.com/BadType" };
    case "misPackAny":
      return {
        ...packed,
        typeUrl: `type.googleapis.com/${Proto3TestAllTypesSchema.typeName}`,
      };
    default:
      return packed;
  }
}

function maybeResolveReflectedValue(expr: string): unknown {
  const match = /^reflect\.ValueOf\((.+)\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  return { value: resolvePbExprString(match[1]!) };
}

function maybeResolveWrapperValue(expr: string): unknown {
  const match =
    /^wrapperspb\.(Bool|Bytes|Double|Float|Int32|Int64|String|UInt32|UInt64)\((.+)\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  const [, kind, rawValue] = match;
  switch (kind) {
    case "Bool":
      return create(BoolValueSchema, { value: parseBooleanLiteral(rawValue!) });
    case "Bytes":
      return create(BytesValueSchema, { value: parseBytesLiteral(rawValue!) });
    case "Double":
      return create(DoubleValueSchema, { value: Number(rawValue) });
    case "Float":
      return create(FloatValueSchema, { value: Number(rawValue) });
    case "Int32":
      return create(Int32ValueSchema, { value: Number(rawValue) });
    case "Int64":
      return create(Int64ValueSchema, { value: BigInt(rawValue!) });
    case "String":
      return create(StringValueSchema, { value: parseStringLiteral(rawValue!) });
    case "UInt32":
      return create(UInt32ValueSchema, { value: Number(rawValue) });
    case "UInt64":
      return create(UInt64ValueSchema, { value: BigInt(rawValue!) });
  }
}

function maybeResolveStructValue(expr: string): unknown {
  const boolMatch = /^structpb\.NewBoolValue\((true|false)\)$/.exec(expr);
  if (boolMatch) {
    return create(BoolValueSchema, { value: boolMatch[1] === "true" });
  }
  const numberMatch = /^structpb\.NewNumberValue\((.+)\)$/.exec(expr);
  if (numberMatch) {
    return fromJson(ValueSchema, Number(numberMatch[1]!) as JsonValue);
  }
  const stringMatch = /^structpb\.NewStringValue\("([\s\S]*)"\)$/.exec(expr);
  if (stringMatch) {
    return fromJson(ValueSchema, stringMatch[1]!);
  }
  if (expr === "structpb.NewNullValue()") {
    return fromJson(ValueSchema, null);
  }
  if (expr === "structpb.NewListValue(jsonList(t, []any{true, 1.0}))") {
    return fromJson(ValueSchema, [true, 1.0] as JsonValue);
  }
  if (expr === 'structpb.NewStructValue(jsonStruct(t, map[string]any{"hello": "world"}))') {
    return fromJson(ValueSchema, { hello: "world" } as JsonValue);
  }
  return undefined;
}

function maybeResolveAnyMessage(expr: string): unknown {
  const match = /^anyMsg\(t,\s*(.+)\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  const nested = resolvePbExprString(match[1]!);
  if (!isProtoMessage(nested)) {
    throw new Error(`anyMsg() requires a protobuf message: ${expr}`);
  }
  const schema = schemaByTypeName.get(nested.$typeName);
  if (!schema) {
    throw new Error(`message descriptor not found for ${nested.$typeName}`);
  }
  return anyPack(schema, nested as MessageShape<typeof schema>);
}

function maybeResolveDynamicMessage(expr: string): unknown {
  const match = /^dynMsg\(t,\s*(.+)\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  const nested = resolvePbExprString(match[1]!);
  if (!isProtoMessage(nested)) {
    throw new Error(`dynMsg() requires a protobuf message: ${expr}`);
  }
  const schema = schemaByTypeName.get(nested.$typeName);
  if (!schema) {
    throw new Error(`message descriptor not found for ${nested.$typeName}`);
  }
  return dynamicMessage(schema, nested as MessageShape<typeof schema>);
}

function maybeResolveBytes(expr: string): Uint8Array | undefined {
  const match = /^\[\]byte\("([\s\S]*)"\)$/.exec(expr);
  if (!match) {
    return undefined;
  }
  return asciiBytes(match[1]!);
}

function maybeResolveTimeLike(expr: string): unknown {
  const timestampMatch =
    /^tpb\.New\(time\.Unix\((-?\d+),\s*0\)\.UTC\(\)\)$|^time\.Unix\((-?\d+),\s*0\)\.UTC\(\)$/.exec(
      expr,
    );
  if (timestampMatch) {
    const seconds = BigInt(timestampMatch[1] ?? timestampMatch[2]!);
    return create(TimestampSchema, { seconds });
  }
  const durationMatch = /^dpb\.New\(time\.Duration\((-?\d+)\)\)$|^time\.Duration\((-?\d+)\)$/.exec(
    expr,
  );
  if (durationMatch) {
    const seconds = BigInt(durationMatch[1] ?? durationMatch[2]!);
    return create(DurationSchema, { seconds });
  }
  return undefined;
}

function resolvePbScalarLiteral(expr: string): boolean | number | bigint | string | Uint8Array {
  if (expr === "true" || expr === "false") {
    return parseBooleanLiteral(expr);
  }
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return parseStringLiteral(expr);
  }
  const bytes = maybeResolveBytes(expr);
  if (bytes !== undefined) {
    return bytes;
  }
  if (expr === "float32(math.NaN())" || expr === "math.NaN()") {
    return Number.NaN;
  }
  const typedNumber = /^(?:float32|float64|int32|int64|uint32|uint64)\((.+)\)$/.exec(expr);
  if (typedNumber) {
    return Number(typedNumber[1]);
  }
  if (expr.includes(".")) {
    return Number(expr);
  }
  if (/^-?\d+$/.test(expr)) {
    return Number(expr);
  }
  throw new Error(`unsupported pb scalar literal: ${expr}`);
}

function parseBooleanLiteral(expr: string): boolean {
  return expr === "true";
}

function parseStringLiteral(expr: string): string {
  return expr.slice(1, -1);
}

function parseBytesLiteral(expr: string): Uint8Array {
  const value = maybeResolveBytes(expr);
  if (!value) {
    throw new Error(`unsupported bytes literal: ${expr}`);
  }
  return value;
}

function goFieldNameToTs(name: string): string {
  return name[0]!.toLowerCase() + name.slice(1);
}

function splitTopLevel(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"' && source[i - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length > 0);
}

function asciiBytes(value: string): Uint8Array {
  return new Uint8Array([...value].map((char) => char.charCodeAt(0)));
}

export function isProtoMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName: unknown }).$typeName === "string"
  );
}

export {
  AnySchema,
  ExampleTypeSchema,
  ExtendedExampleTypeSchema,
  Proto2NestedTestAllTypesSchema,
  Proto2TestAllTypesSchema,
  Proto3NestedTestAllTypesSchema,
  Proto3TestAllTypesSchema,
  TestJsonNamesSchema,
  ValueSchema,
  file_test_proto2pb_test_all_types,
  file_test_proto3pb_test_all_types,
};

import { create, type MessageInitShape, type MessageShape } from "@bufbuild/protobuf";
import { AnySchema, NullValue as ProtoNullValue } from "@bufbuild/protobuf/wkt";
import { Code } from "@protoutil/core/google/rpc";
import type { Expr, SourceInfo } from "../common/ast/index.js";
import {
  AST,
  ast,
  exceedsDepth,
  protoToExpr,
  protoToSourceInfo,
  toAst,
} from "../common/ast/index.js";
import type { Source } from "../common/source.js";
import { Bool } from "../common/types/bool.js";
import { Bytes } from "../common/types/bytes.js";
import { Double } from "../common/types/double.js";
import { Err } from "../common/types/err.js";
import { Int } from "../common/types/int.js";
import { refValList } from "../common/types/list.js";
import { refValMap } from "../common/types/map.js";
import { NullValue } from "../common/types/null.js";
import { ProtoEnum } from "../common/types/pb/enum.js";
import type { Adapter } from "../common/types/provider.js";
import type { Val } from "../common/types/ref/reference.js";
import { String as CelString } from "../common/types/string.js";
import {
  BoolType,
  BytesType,
  DoubleType,
  IntType,
  ListType,
  MapType,
  NullType,
  objectType,
  StringType,
  TypeType,
  UintType,
} from "../common/types/types.js";
import { Uint } from "../common/types/uint.js";
import { Unknown } from "../common/types/unknown.js";
import { type CheckedExpr, CheckedExprSchema } from "../gen/cel/expr/checked_pb.js";
import type { ExprValue } from "../gen/cel/expr/eval_pb.js";
import {
  ExprSchema,
  type ParsedExpr,
  ParsedExprSchema,
  type Expr as ProtoExpr,
} from "../gen/cel/expr/syntax_pb.js";
import type { MapValue_Entry, Value } from "../gen/cel/expr/value_pb.js";
import {
  type CheckedExpr as AlphaCheckedExpr,
  CheckedExprSchema as AlphaCheckedExprSchema,
} from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import {
  type ExprValue as AlphaExprValue,
  ExprValueSchema as AlphaExprValueSchema,
} from "../gen/google/api/expr/v1alpha1/eval_pb.js";
import {
  type Expr as AlphaExpr,
  ExprSchema as AlphaExprSchema,
  type ParsedExpr as AlphaParsedExpr,
  ParsedExprSchema as AlphaParsedExprSchema,
} from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import { unparse } from "../parser/unparser.js";

/**
 * EnumValueAdapter reconstructs typed protobuf enum values from their canonical CEL wire form.
 */
interface EnumValueAdapter extends Adapter {
  /** enumValueOf resolves a signed number within a fully qualified protobuf enum type. */
  enumValueOf(typeName: string, value: bigint): Val;
}

/**
 * checkedExprToAst converts a checked-expression protobuf message to an AST.
 */
export function checkedExprToAst(checkedExpr: CheckedExpr): AST {
  return checkedExprToAstWithSource(checkedExpr);
}

/**
 * checkedExprToAstWithSource converts a checked-expression protobuf message to an AST using the
 * provided source as the textual contents.
 *
 * In general the source is not necessary unless the AST has been modified between the parse and
 * check calls, as an AST created from the parse step carries the source through future calls.
 *
 * Prefer {@link checkedExprToAst} when loading expressions from storage.
 */
export function checkedExprToAstWithSource(checkedExpr: CheckedExpr, source?: Source): AST {
  const checked = toAst(checkedExpr);
  const loaded = new AST(
    checked.expr(),
    checked.sourceInfo(),
    checked.typeMap(),
    checked.referenceMap(),
    source,
  );
  assertLoadedAstDepth(loaded);
  return loaded;
}

/**
 * astToCheckedExpr converts a checked AST to a checked-expression protobuf message.
 */
export function astToCheckedExpr(astValue?: AST): CheckedExpr {
  if (astValue === undefined || !astValue.isChecked()) {
    throw new Error("cannot convert unchecked ast");
  }
  return astValue.toCheckedExpr();
}

/**
 * astToAlphaExpr converts an AST expression to the wire-compatible legacy
 * google.api.expr.v1alpha1.Expr schema.
 */
export function astToAlphaExpr(astValue: AST): AlphaExpr {
  return exprAsAlphaProto(astValue.expr().toProto());
}

/**
 * astToAlphaCheckedExpr converts a checked AST to the wire-compatible legacy
 * google.api.expr.v1alpha1.CheckedExpr schema.
 */
export function astToAlphaCheckedExpr(astValue?: AST): AlphaCheckedExpr {
  return checkedExprAsAlphaProto(astToCheckedExpr(astValue));
}

/**
 * parsedExprToAst converts a parsed-expression protobuf message to an unchecked AST.
 */
export function parsedExprToAst(parsedExpr: ParsedExpr): AST {
  return parsedExprToAstWithSource(parsedExpr);
}

/**
 * parsedExprToAstWithSource converts a parsed-expression protobuf message to an AST using the
 * provided source as the textual contents.
 *
 * In general this is only needed to recheck a previously checked expression or to separately check
 * a subset of an expression.
 *
 * Prefer {@link parsedExprToAst} when loading expressions from storage.
 */
export function parsedExprToAstWithSource(parsedExpr: ParsedExpr, source?: Source): AST {
  const loaded = ast(
    protoToExpr(parsedExpr.expr),
    protoToSourceInfo(parsedExpr.sourceInfo),
    source,
  );
  assertLoadedAstDepth(loaded);
  return loaded;
}

/**
 * assertLoadedAstDepth guards protobuf-loaded ASTs which bypass parser recursion limits.
 */
function assertLoadedAstDepth(astValue: AST): void {
  const defaultMaxAstDepth = 250;
  if (exceedsDepth(astValue, defaultMaxAstDepth)) {
    throw new Error(`input exceeds maximum expression nesting depth: ${defaultMaxAstDepth}`);
  }
}

/**
 * astToParsedExpr converts an AST to a parsed-expression protobuf message.
 */
export function astToParsedExpr(astValue?: AST): ParsedExpr {
  if (astValue === undefined) {
    return {
      $typeName: "cel.expr.ParsedExpr",
    };
  }
  return astValue.toParsedExpr();
}

/**
 * astToAlphaParsedExpr converts an AST to the wire-compatible legacy
 * google.api.expr.v1alpha1.ParsedExpr schema.
 */
export function astToAlphaParsedExpr(astValue?: AST): AlphaParsedExpr {
  return parsedExprAsAlphaProto(astToParsedExpr(astValue));
}

/**
 * exprAsAlphaProto converts a CEL expression to the wire-compatible legacy
 * google.api.expr.v1alpha1.Expr schema.
 */
export function exprAsAlphaProto(expr: ProtoExpr): AlphaExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(AlphaExprSchema, expr as unknown as MessageInitShape<typeof AlphaExprSchema>);
}

/**
 * alphaProtoAsExpr converts a wire-compatible legacy google.api.expr.v1alpha1.Expr to the CEL
 * expression schema.
 */
export function alphaProtoAsExpr(expr: AlphaExpr): ProtoExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(ExprSchema, expr as unknown as MessageInitShape<typeof ExprSchema>);
}

/**
 * parsedExprAsAlphaProto converts a CEL parsed expression to the wire-compatible legacy
 * google.api.expr.v1alpha1.ParsedExpr schema.
 */
export function parsedExprAsAlphaProto(parsedExpr: ParsedExpr): AlphaParsedExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(
    AlphaParsedExprSchema,
    parsedExpr as unknown as MessageInitShape<typeof AlphaParsedExprSchema>,
  );
}

/**
 * alphaProtoAsParsedExpr converts a wire-compatible legacy google.api.expr.v1alpha1.ParsedExpr
 * to the CEL parsed-expression schema.
 */
export function alphaProtoAsParsedExpr(parsedExpr: AlphaParsedExpr): ParsedExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(
    ParsedExprSchema,
    parsedExpr as unknown as MessageInitShape<typeof ParsedExprSchema>,
  );
}

/**
 * checkedExprAsAlphaProto converts a CEL checked expression to the wire-compatible legacy
 * google.api.expr.v1alpha1.CheckedExpr schema.
 */
export function checkedExprAsAlphaProto(checkedExpr: CheckedExpr): AlphaCheckedExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(
    AlphaCheckedExprSchema,
    checkedExpr as unknown as MessageInitShape<typeof AlphaCheckedExprSchema>,
  );
}

/**
 * alphaProtoAsCheckedExpr converts a wire-compatible legacy google.api.expr.v1alpha1.CheckedExpr
 * to the CEL checked-expression schema.
 */
export function alphaProtoAsCheckedExpr(checkedExpr: AlphaCheckedExpr): CheckedExpr {
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(
    CheckedExprSchema,
    checkedExpr as unknown as MessageInitShape<typeof CheckedExprSchema>,
  );
}

/**
 * astToString unparses an AST into semantically equivalent CEL source.
 */
export function astToString(astValue?: AST): string {
  if (astValue === undefined) {
    throw new Error("unsupported expr: undefined");
  }
  return unparse(astValue);
}

/**
 * exprToString unparses an expression with optional source information.
 */
export function exprToString(expr: Expr, sourceInfo?: SourceInfo): string {
  return unparse(ast(expr, sourceInfo));
}

/**
 * refValToExprValue converts a CEL runtime result to a generated cel.expr.ExprValue shape.
 */
export function refValToExprValue(value: Val): ExprValue {
  if (value instanceof Unknown) {
    return {
      $typeName: "cel.expr.ExprValue",
      kind: {
        case: "unknown",
        value: {
          $typeName: "cel.expr.UnknownSet",
          exprs: value.ids().map(BigInt),
        },
      },
    };
  }
  if (value instanceof Err) {
    return {
      $typeName: "cel.expr.ExprValue",
      kind: {
        case: "error",
        value: {
          $typeName: "cel.expr.ErrorSet",
          errors: [
            {
              $typeName: "cel.expr.Status",
              code: Code.UNKNOWN,
              message: value.message,
              details: [],
            },
          ],
        },
      },
    };
  }
  return {
    $typeName: "cel.expr.ExprValue",
    kind: {
      case: "value",
      value: refValueToValue(value),
    },
  };
}

/**
 * exprValueAsAlphaProto converts a CEL runtime result to the wire-compatible legacy
 * google.api.expr.v1alpha1.ExprValue schema.
 */
export function exprValueAsAlphaProto(value: Val): AlphaExprValue {
  const canonical = refValToExprValue(value);
  // TestAlphaProtoSchemaCompatibility recursively verifies this cast's schema assumption.
  return create(
    AlphaExprValueSchema,
    canonical as unknown as MessageInitShape<typeof AlphaExprValueSchema>,
  );
}

/**
 * refValueToValue converts a CEL runtime value to its generated cel.expr.Value shape.
 */
export function refValueToValue(value: Val): Value {
  if (value instanceof ProtoEnum) {
    return valueMessage({
      case: "enumValue",
      value: {
        $typeName: "cel.expr.EnumValue",
        type: value.enumDescriptor().typeName,
        value: Number(value.value()),
      },
    });
  }
  const runtimeType = value.type();
  if (runtimeType === NullType) {
    return valueMessage({
      case: "nullValue",
      value: ProtoNullValue.NULL_VALUE,
    });
  }
  if (runtimeType === BoolType) {
    return valueMessage({ case: "boolValue", value: value.value() as boolean });
  }
  if (runtimeType === BytesType) {
    return valueMessage({
      case: "bytesValue",
      value: value.value() as Uint8Array,
    });
  }
  if (runtimeType === DoubleType) {
    return valueMessage({
      case: "doubleValue",
      value: value.value() as number,
    });
  }
  if (runtimeType === IntType) {
    return valueMessage({
      case: "int64Value",
      value: value.value() as bigint,
    });
  }
  if (runtimeType === UintType) {
    return valueMessage({
      case: "uint64Value",
      value: value.value() as bigint,
    });
  }
  if (runtimeType === StringType) {
    return valueMessage({
      case: "stringValue",
      value: value.value() as string,
    });
  }
  if (runtimeType === TypeType) {
    return valueMessage({
      case: "typeValue",
      value: String(value.value()),
    });
  }
  if (runtimeType === ListType && isListValue(value)) {
    const values: Value[] = [];
    const size = Number((value.size() as Int).value());
    for (let index = 0; index < size; index += 1) {
      values.push(refValueToValue(value.get(new Int(BigInt(index)))));
    }
    return valueMessage({
      case: "listValue",
      value: {
        $typeName: "cel.expr.ListValue",
        values,
      },
    });
  }
  if (runtimeType === MapType && isMapValue(value)) {
    const entries: MapValue_Entry[] = [];
    const iterator = value.iterator();
    while ((iterator.hasNext() as Bool).value()) {
      const key = iterator.next();
      entries.push({
        $typeName: "cel.expr.MapValue.Entry",
        key: refValueToValue(key),
        value: refValueToValue(value.get(key)),
      });
    }
    return valueMessage({
      case: "mapValue",
      value: {
        $typeName: "cel.expr.MapValue",
        entries,
      },
    });
  }
  return valueMessage({
    case: "objectValue",
    value: value.convertToNative(AnySchema) as MessageShape<typeof AnySchema>,
  });
}

/**
 * valueToRefValue converts a generated cel.expr.Value shape to a CEL runtime value.
 */
export function valueToRefValue(adapter: Adapter, value: Value): Val {
  switch (value.kind.case) {
    case "nullValue":
      return NullValue;
    case "boolValue":
      return new Bool(value.kind.value);
    case "bytesValue":
      return new Bytes(value.kind.value);
    case "doubleValue":
      return new Double(value.kind.value);
    case "int64Value":
      return new Int(value.kind.value);
    case "uint64Value":
      return new Uint(value.kind.value);
    case "stringValue":
      return new CelString(value.kind.value);
    case "typeValue":
      return runtimeTypeValue(value.kind.value);
    case "listValue":
      return refValList(
        adapter,
        value.kind.value.values.map((entry) => valueToRefValue(adapter, entry)),
      );
    case "mapValue": {
      const entries = new Map<Val, Val>();
      for (const entry of value.kind.value.entries) {
        if (entry.key === undefined || entry.value === undefined) {
          throw new Error("map entry must contain both key and value");
        }
        entries.set(valueToRefValue(adapter, entry.key), valueToRefValue(adapter, entry.value));
      }
      return refValMap(adapter, entries);
    }
    case "objectValue":
      return adapter.nativeToValue(value.kind.value);
    case "enumValue":
      return isEnumValueAdapter(adapter)
        ? adapter.enumValueOf(value.kind.value.type, BigInt(value.kind.value.value))
        : new Int(BigInt(value.kind.value.value));
    default:
      throw new Error("value kind is not set");
  }
}

/**
 * isEnumValueAdapter reports whether an adapter can reconstruct strongly typed protobuf enums.
 */
function isEnumValueAdapter(adapter: Adapter): adapter is EnumValueAdapter {
  return (
    "enumValueOf" in adapter &&
    typeof (adapter as { enumValueOf?: unknown }).enumValueOf === "function"
  );
}

/**
 * valueMessage composes a known-valid cel.expr.Value message without normalization overhead.
 */
function valueMessage(kind: Value["kind"]): Value {
  return {
    $typeName: "cel.expr.Value",
    kind,
  };
}

/**
 * runtimeTypeValue resolves built-in type names and preserves custom names as object CEL types.
 */
function runtimeTypeValue(name: string): Val {
  switch (name) {
    case BoolType.typeName():
      return BoolType;
    case BytesType.typeName():
      return BytesType;
    case DoubleType.typeName():
      return DoubleType;
    case IntType.typeName():
      return IntType;
    case ListType.typeName():
      return ListType;
    case MapType.typeName():
      return MapType;
    case NullType.typeName():
      return NullType;
    case StringType.typeName():
      return StringType;
    case TypeType.typeName():
      return TypeType;
    case UintType.typeName():
      return UintType;
    default:
      return objectType(name);
  }
}

/**
 * isListValue reports whether a runtime value exposes the CEL list operations.
 */
function isListValue(value: Val): value is Val & {
  get(index: Val): Val;
  size(): Val;
} {
  return "get" in value && "size" in value;
}

/**
 * isMapValue reports whether a runtime value exposes the CEL map operations.
 */
function isMapValue(value: Val): value is Val & {
  get(key: Val): Val;
  iterator(): {
    hasNext(): Val;
    next(): Val;
  };
} {
  return "get" in value && "iterator" in value;
}

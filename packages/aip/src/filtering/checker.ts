import { create, type MessageInitShape, type MessageShape } from "@bufbuild/protobuf";
import {
  type CheckedExpr,
  CheckedExprSchema,
  type Decl,
  type ReferenceSchema,
  type Type_ListTypeSchema,
  type Type_MapTypeSchema,
} from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import type { Expr, ParsedExpr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import { ErrorCode, type SourcePosition, TypeCheckError } from "./errors.js";
import { offsetToLineCol } from "./parser.js";
import {
  BOOL,
  BYTES,
  DOUBLE,
  DURATION,
  DYN,
  ERROR,
  func,
  INT64,
  ident,
  LIST_OF_A,
  listType,
  MAP_OF_A_B,
  mapType,
  memberOverload,
  messageType,
  NULL,
  type OverloadInit,
  overload,
  PARAM_A,
  STRING,
  TIMESTAMP,
  type TypeInit,
  UINT64,
} from "./types.js";

export const BUILTIN_DECLS: Decl[] = [
  // Constant idents
  ident("true", BOOL),
  ident("false", BOOL),
  ident("null", NULL),

  // Logical operators
  func("_&&_", overload("logical_and", [BOOL, BOOL], BOOL, "Logical AND operator")),
  func("_||_", overload("logical_or", [BOOL, BOOL], BOOL, "Logical OR operator")),
  func("@not", overload("logical_not", [BOOL], BOOL, "Logical NOT operator")),

  // Equality/inequality operators
  func(
    "_==_",
    overload("equals_int64", [INT64, INT64], BOOL, "Equality operator"),
    overload("equals_uint64", [UINT64, UINT64], BOOL, "Equality operator"),
    overload("equals_double", [DOUBLE, DOUBLE], BOOL, "Equality operator"),
    overload("equals_string", [STRING, STRING], BOOL, "Equality operator"),
    overload("equals_bytes", [BYTES, BYTES], BOOL, "Equality operator"),
    // overload("equals_dyn", [DYN, DYN], BOOL, "Equality operator for dynamic types"),
  ),
  func(
    "_!=_",
    overload("not_equals_int64", [INT64, INT64], BOOL, "Inequality operator"),
    overload("not_equals_uint64", [UINT64, UINT64], BOOL, "Inequality operator"),
    overload("not_equals_double", [DOUBLE, DOUBLE], BOOL, "Inequality operator"),
    overload("not_equals_string", [STRING, STRING], BOOL, "Inequality operator"),
    overload("not_equals_bytes", [BYTES, BYTES], BOOL, "Inequality operator"),
    // overload("not_equals_dyn", [DYN, DYN], BOOL, "Inequality operator for dynamic types"),
  ),

  // Comparison operators
  func(
    "_<_",
    overload("less_int64", [INT64, INT64], BOOL, "Less-than operator for int64"),
    overload("less_uint64", [UINT64, UINT64], BOOL, "Less-than operator for uint64"),
    overload("less_double", [DOUBLE, DOUBLE], BOOL, "Less-than operator for double"),
    overload("less_string", [STRING, STRING], BOOL, "Less-than operator for strings"),
    // overload("less_dyn", [DYN, DYN], BOOL, "Less-than operator for dynamic types"),
  ),
  func(
    "_<=_",
    overload("less_equals_int64", [INT64, INT64], BOOL, "Less-than-or-equal operator for int64"),
    overload(
      "less_equals_uint64",
      [UINT64, UINT64],
      BOOL,
      "Less-than-or-equal operator for uint64",
    ),
    overload(
      "less_equals_double",
      [DOUBLE, DOUBLE],
      BOOL,
      "Less-than-or-equal operator for double",
    ),
    overload(
      "less_equals_string",
      [STRING, STRING],
      BOOL,
      "Less-than-or-equal operator for strings",
    ),
    // overload("less_equals_dyn", [DYN, DYN], BOOL, "Less-than-or-equal operator for dynamic types"),
  ),
  func(
    "_>_",
    overload("greater_int64", [INT64, INT64], BOOL, "Greater-than operator for int64"),
    overload("greater_uint64", [UINT64, UINT64], BOOL, "Greater-than operator for uint64"),
    overload("greater_double", [DOUBLE, DOUBLE], BOOL, "Greater-than operator for double"),
    overload("greater_string", [STRING, STRING], BOOL, "Greater-than operator for strings"),
    // overload("greater_dyn", [DYN, DYN], BOOL, "Greater-than operator for dynamic types"),
  ),
  func(
    "_>=_",
    overload(
      "greater_equals_int64",
      [INT64, INT64],
      BOOL,
      "Greater-than-or-equal operator for int64",
    ),
    overload(
      "greater_equals_uint64",
      [UINT64, UINT64],
      BOOL,
      "Greater-than-or-equal operator for uint64",
    ),
    overload(
      "greater_equals_double",
      [DOUBLE, DOUBLE],
      BOOL,
      "Greater-than-or-equal operator for double",
    ),
    overload(
      "greater_equals_string",
      [STRING, STRING],
      BOOL,
      "Greater-than-or-equal operator for strings",
    ),
    // overload(
    //   "greater_equals_dyn",
    //   [DYN, DYN],
    //   BOOL,
    //   "Greater-than-or-equal operator for dynamic types",
    // ),
  ),

  // Has operator
  // The AIP parser emits @in(collection, key) — i.e. `labels:"deprecated"` becomes
  // @in(labels, "deprecated") — so the collection is the first argument.
  func(
    "@in",
    overload("in_list", [LIST_OF_A, PARAM_A], BOOL, "Has operator for lists"),
    overload("in_map", [MAP_OF_A_B, PARAM_A], BOOL, "Has operator for maps"),
  ),

  // String methods
  func(
    "startsWith",
    memberOverload("string_starts_with", [STRING], BOOL, "Checks if a string starts with a prefix"),
  ),
  func(
    "endsWith",
    memberOverload("string_ends_with", [STRING], BOOL, "Checks if a string ends with a suffix"),
  ),
  func(
    "contains",
    memberOverload("string_contains", [STRING], BOOL, "Checks if a string contains a substring"),
  ),
  func(
    "matches",
    memberOverload("string_matches", [STRING], BOOL, "Checks if a string matches a regex pattern"),
  ),

  // Size
  func(
    "size",
    overload(
      "size_string",
      [STRING],
      INT64,
      "Returns the number of Unicode code points in a string",
    ),
    overload("size_bytes", [BYTES], INT64, "Returns the number of bytes in a bytestring"),
    overload("size_list", [LIST_OF_A], INT64, "Returns the number of elements in a list"),
    overload("size_map", [MAP_OF_A_B], INT64, "Returns the number of entries in a map"),
    memberOverload(
      "size_string_instance",
      [STRING],
      INT64,
      "Returns the number of Unicode code points in a string",
    ),
    memberOverload(
      "size_bytes_instance",
      [BYTES],
      INT64,
      "Returns the number of bytes in a bytestring",
    ),
    memberOverload(
      "size_list_instance",
      [LIST_OF_A],
      INT64,
      "Returns the number of elements in a list",
    ),
    memberOverload(
      "size_map_instance",
      [MAP_OF_A_B],
      INT64,
      "Returns the number of entries in a map",
    ),
  ),

  // Type coercion
  func("int", overload("int_dyn", [DYN], INT64, "Coerces dyn to int64")),
  func("uint", overload("uint_dyn", [DYN], UINT64, "Coerces dyn to uint64")),
  func("double", overload("double_dyn", [DYN], DOUBLE, "Coerces dyn to double")),
  func("string", overload("string_dyn", [DYN], STRING, "Coerces dyn to string")),
  func("bytes", overload("bytes_dyn", [DYN], BYTES, "Coerces dyn to bytes")),
  func("bool", overload("bool_dyn", [DYN], BOOL, "Coerces dyn to bool")),
  func("type", overload("type_dyn", [DYN], STRING, "Returns the type of a dyn value as a string")),

  // Has macro
  func("has", overload("has_macro", [DYN, DYN], BOOL, "Has macro for checking presence")),

  // Timestamp and duration
  func(
    "timestamp",
    overload("timestamp_string", [STRING], TIMESTAMP, "Parses a timestamp from a string"),
  ),
  func(
    "duration",
    overload("duration_string", [STRING], DURATION, "Parses a duration from a string"),
  ),
];

type ReferenceInit = MessageInitShape<typeof ReferenceSchema>;

function isDyn(t: TypeInit): boolean {
  return t.typeKind?.case === "dyn";
}

function isError(t: TypeInit): boolean {
  return t.typeKind?.case === "error";
}

/**
 * Returns true if `actual` is compatible with `expected` for overload matching.
 * DYN is compatible with anything. Errors are never compatible.
 */
function typeCompatible(expected: TypeInit, actual: TypeInit): boolean {
  if (isError(expected) || isError(actual)) return false;
  if (isDyn(expected) || isDyn(actual)) return true;
  // A type parameter in the expected (overload signature) position is a type
  // variable — it unifies with any concrete type, like a generic placeholder.
  if (expected.typeKind?.case === "typeParam") return true;
  if (expected.typeKind?.case !== actual.typeKind?.case) return false;
  switch (expected.typeKind?.case) {
    case "primitive":
      return expected.typeKind.value === actual.typeKind?.value;
    case "wellKnown":
      return expected.typeKind.value === actual.typeKind?.value;
    case "messageType":
      return expected.typeKind.value === actual.typeKind?.value;
    case "listType":
      if (actual.typeKind?.case !== "listType") return false;
      return typeCompatible(
        expected.typeKind.value.elemType ?? {},
        actual.typeKind.value.elemType ?? {},
      );
    case "mapType":
      if (actual.typeKind?.case !== "mapType") return false;
      if (!expected.typeKind.value.keyType || !expected.typeKind.value.valueType) return false;
      return (
        typeCompatible(expected.typeKind.value.keyType, actual.typeKind.value.keyType ?? {}) &&
        typeCompatible(expected.typeKind.value.valueType, actual.typeKind.value.valueType ?? {})
      );
    default:
      return true;
  }
}

function paramsMatch(params: TypeInit[], args: TypeInit[]): boolean {
  if (params.length !== args.length) return false;
  return params.every((p, i) => typeCompatible(p, args[i]));
}

/** Unify a list of types to their most specific common type, falling back to DYN. */
function unify(types: TypeInit[]): TypeInit {
  if (types.length === 0) return DYN;
  const first = types[0];
  if (types.every((t) => t.typeKind?.case === first.typeKind?.case)) {
    switch (first.typeKind?.case) {
      case "primitive":
        if (types.every((t) => t.typeKind?.value === first.typeKind?.value)) return first;
        break;
      case "wellKnown":
        if (types.every((t) => t.typeKind?.value === first.typeKind?.value)) return first;
        break;
      case "messageType":
        if (types.every((t) => t.typeKind?.value === first.typeKind?.value)) return first;
        break;
      case "listType": {
        const elem = unify(
          types.map(
            (t) =>
              (t.typeKind?.value as MessageInitShape<typeof Type_ListTypeSchema>)
                ?.elemType as TypeInit,
          ),
        );
        return listType(elem);
      }
      case "mapType": {
        const key = unify(
          types.map(
            (t) =>
              (t.typeKind?.value as MessageShape<typeof Type_MapTypeSchema>)?.keyType as TypeInit,
          ),
        );
        const val = unify(
          types.map(
            (t) =>
              (t.typeKind?.value as MessageShape<typeof Type_MapTypeSchema>)?.valueType as TypeInit,
          ),
        );
        return mapType(key, val);
      }
    }
  }
  return DYN;
}

function inferConstantType(expr: Expr): TypeInit {
  switch (expr.exprKind.case) {
    case "constExpr":
      switch (expr.exprKind.value.constantKind.case) {
        case "nullValue":
          return NULL;
        case "boolValue":
          return BOOL;
        case "int64Value":
          return INT64;
        case "uint64Value":
          return UINT64;
        case "doubleValue":
          return DOUBLE;
        case "stringValue":
          return STRING;
        case "bytesValue":
          return BYTES;
        default:
          return DYN;
      }
    default:
      throw new Error(`Expected constExpr, got ${expr.exprKind?.case}`);
  }
}

// ── Checker ───────────────────────────────────────────────────────────────────

export class Checker {
  #typeMap: Map<bigint, TypeInit> = new Map();
  #referenceMap: Map<bigint, ReferenceInit> = new Map();
  #errors: TypeCheckError[] = [];
  #decls: Decl[];
  #sourceInfo?: ParsedExpr["sourceInfo"];
  #source?: string;

  constructor(extraDecls: Decl[] = [], source?: string) {
    this.#decls = [...BUILTIN_DECLS, ...extraDecls];
    this.#source = source;
  }

  check(parsed: ParsedExpr): { checkedExpr: CheckedExpr; errors: TypeCheckError[] } {
    this.#sourceInfo = parsed.sourceInfo;
    if (parsed.expr) this.#visit(parsed.expr);

    // Convert bigint-keyed maps to string-keyed records for protobuf-es
    const typeMap: Record<string, TypeInit> = {};
    for (const [id, t] of this.#typeMap) {
      typeMap[String(id)] = t;
    }
    const referenceMap: Record<string, ReferenceInit> = {};
    for (const [id, r] of this.#referenceMap) {
      referenceMap[String(id)] = r;
    }

    const checkedExpr = create(CheckedExprSchema, {
      expr: parsed.expr,
      sourceInfo: parsed.sourceInfo,
      typeMap,
      referenceMap,
      exprVersion: "cel1",
    });

    return { checkedExpr, errors: this.#errors };
  }

  #visit(expr: Expr): TypeInit {
    const kind = expr.exprKind;
    let result: TypeInit;

    switch (kind.case) {
      case "constExpr":
        result = inferConstantType(expr);
        break;

      case "identExpr": {
        const name = kind.value.name;
        if (!name) {
          result = NULL;
          break;
        }
        const decl = this.#findIdent(name);
        if (!decl) {
          this.#addError(
            ErrorCode.CHECK_UNDECLARED_IDENT,
            expr.id,
            `Undeclared reference to '${name}'`,
          );
          result = ERROR;
          break;
        }
        if (decl.declKind?.case !== "ident") {
          this.#addError(ErrorCode.CHECK_UNDECLARED_IDENT, expr.id, `'${name}' is not an ident`);
          result = ERROR;
          break;
        }
        result = decl.declKind.value.type as TypeInit;
        this.#referenceMap.set(expr.id, { name });
        break;
      }

      case "selectExpr": {
        const operand = kind.value.operand;
        if (!operand) {
          result = DYN;
          break;
        }
        const baseType = this.#visit(operand);
        if (baseType.typeKind?.case === "mapType") {
          result = baseType.typeKind.value.valueType ?? DYN;
        } else if (baseType.typeKind?.case === "messageType") {
          result = DYN;
        } else if (isDyn(baseType)) {
          result = DYN;
        } else if (isError(baseType)) {
          result = ERROR;
        } else {
          result = DYN;
        }
        break;
      }

      case "callExpr": {
        const { function: fnName, target, args } = kind.value;
        const argTypes = args.map((a) => this.#visit(a));
        const targetType = target ? this.#visit(target) : undefined;
        const isMethod = target !== undefined;

        const overloads = this.#findOverloads(fnName);
        if (overloads.length === 0) {
          this.#addError(ErrorCode.CHECK_UNKNOWN_FUNCTION, expr.id, `Unknown function '${fnName}'`);
          result = ERROR;
          break;
        }

        const match = this.#matchOverload(overloads, argTypes, targetType, isMethod);
        result = match?.resultType ?? DYN;

        const matchedIds = match ? [match.overloadId] : overloads.map((o) => o.overloadId);
        this.#referenceMap.set(expr.id, { name: fnName, overloadId: matchedIds as string[] });
        break;
      }

      case "listExpr": {
        const elemTypes = kind.value.elements.map((e) => this.#visit(e));
        result = listType(elemTypes.length === 0 ? DYN : unify(elemTypes));
        break;
      }

      case "structExpr": {
        const { messageName, entries } = kind.value;
        if (messageName) {
          for (const e of entries) {
            if (e.keyKind.case === "mapKey") {
              this.#visit(e.keyKind.value);
            }
            if (!e.value) {
              this.#addError(
                ErrorCode.CHECK_INVALID_EXPRESSION,
                expr.id,
                "Struct entries must have a value",
              );
              continue;
            }
            this.#visit(e.value);
          }
          result = messageType(messageName);
          this.#referenceMap.set(expr.id, { name: messageName });
        } else {
          const keyTypes: TypeInit[] = [];
          const valTypes: TypeInit[] = [];
          for (const e of entries) {
            keyTypes.push(e.keyKind.case === "mapKey" ? this.#visit(e.keyKind.value) : STRING);
            if (!e.value) {
              this.#addError(
                ErrorCode.CHECK_INVALID_EXPRESSION,
                expr.id,
                "Struct entries must have a value",
              );
              continue;
            }
            valTypes.push(this.#visit(e.value));
          }
          result =
            entries.length === 0 ? mapType(DYN, DYN) : mapType(unify(keyTypes), unify(valTypes));
        }
        break;
      }

      case "comprehensionExpr": {
        const c = kind.value;
        if (!c.iterVar || !c.accuVar) {
          this.#addError(
            ErrorCode.CHECK_INVALID_EXPRESSION,
            expr.id,
            "Comprehension must have iterVar and accuVar",
          );
          result = ERROR;
          break;
        }
        if (!c.iterRange || !c.accuInit || !c.loopCondition || !c.loopStep || !c.result) {
          this.#addError(
            ErrorCode.CHECK_INVALID_EXPRESSION,
            expr.id,
            "Comprehension is missing required sub-expressions",
          );
          result = ERROR;
          break;
        }
        this.#visit(c.iterRange);
        this.#visit(c.accuInit);
        this.#visit(c.loopCondition);
        this.#visit(c.loopStep);
        result = this.#visit(c.result);
        break;
      }

      default:
        result = DYN;
    }

    // Per CheckedExpr spec: only store non-DYN types
    if (!isDyn(result)) {
      this.#typeMap.set(expr.id, result);
    }

    return result;
  }

  #findIdent(name: string): Decl | undefined {
    for (const decl of this.#decls) {
      if (decl.name === name && decl.declKind?.case === "ident") return decl;
    }
    return undefined;
  }

  #findOverloads(name: string): OverloadInit[] {
    const result: OverloadInit[] = [];
    for (const decl of this.#decls) {
      if (decl.name === name && decl.declKind?.case === "function") {
        if (decl.declKind.case !== "function") continue;
        result.push(...(decl.declKind.value.overloads ?? []));
      }
    }
    return result;
  }

  #matchOverload(
    overloads: OverloadInit[],
    argTypes: TypeInit[],
    targetType: TypeInit | undefined,
    isMethod: boolean,
  ): OverloadInit | undefined {
    if (targetType) {
      // For method overloads, the target type is the first parameter (the receiver)
      argTypes = [targetType, ...argTypes];
    }
    for (const ov of overloads) {
      if (isMethod && ov.isInstanceFunction) {
        // params[0] is receiver type in the proto sense, but our memberOverload
        // stores only the non-receiver params — so just match argTypes directly
        if (paramsMatch(ov.params as TypeInit[], argTypes)) return ov;
      } else if (!isMethod && !ov.isInstanceFunction) {
        if (paramsMatch(ov.params as TypeInit[], argTypes)) return ov;
      }
    }
    // Fallback: return first overload (type will be its result type)
    return overloads[0];
  }

  #addError(code: ErrorCode, exprId: bigint, message: string): void {
    const position = this.#getPosition(exprId);
    this.#errors.push(new TypeCheckError(code, exprId, message, this.#source, position));
  }

  #getPosition(exprId: bigint): SourcePosition | undefined {
    if (!this.#sourceInfo) return undefined;
    const offset = this.#sourceInfo.positions[String(exprId)];
    if (offset === undefined) return undefined;
    const { line, column } = offsetToLineCol(offset, this.#sourceInfo.lineOffsets);
    return {
      location: this.#sourceInfo.location,
      offset,
      line,
      column,
      exprId,
    };
  }
}

/**
 * Type check a parsed AIP-160 filter expression. You can provide additional
 * declarations for idents and functions via `extraDecls`. Returns the checked
 * expression along with any type errors encountered. The checked expression will
 * include a type map and reference map that you can use for evaluation.
 */
export function check(
  parsed: ParsedExpr,
  extraDecls: Decl[] = [],
  source?: string,
): { checkedExpr: CheckedExpr; errors: TypeCheckError[] } {
  return new Checker(extraDecls, source).check(parsed);
}

/**
 * Determine the output type of a checked expression from its type map. Returns
 * undefined if the expression has no type (e.g. due to a type error or missing type info).
 */
export function outputType(checkedExpr: CheckedExpr): TypeInit | undefined {
  return checkedExpr.typeMap[String(checkedExpr.expr?.id)];
}

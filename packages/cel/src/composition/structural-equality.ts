import { equals, isMessage } from "@bufbuild/protobuf";
import {
  type ConstantValue,
  type EntryExpr,
  EntryExprKind,
  type Expr,
  ExprKind,
  type ReferenceInfo,
} from "../common/ast/index.js";
import { checkedDyn } from "../common/types/pb/checked.js";
import { type Type as CheckedType, TypeSchema } from "../gen/cel/expr/checked_pb.js";
import { ConstantSchema } from "../gen/cel/expr/syntax_pb.js";

/**
 * StructuralEqualityContext resolves the checked type and reference recorded for an expression
 * id, so that two expression trees built independently and remapped into one shared id space can
 * still be compared node by node.
 */
export interface StructuralEqualityContext {
  /** getType returns the checked type recorded for an expression id, when one was recorded. */
  getType(id: number): CheckedType | undefined;
  /** getReference returns the resolved identifier or overload reference for an expression id. */
  getReference(id: number): ReferenceInfo | undefined;
}

/**
 * structurallyEqual reports whether two expressions are structural duplicates: the same node kind,
 * checked type, and resolved reference, with the same children in the same order. It ignores
 * expression ids, source offsets, and other formatting metadata, since two nodes built from
 * different source positions can still be the same expression.
 *
 * Structural duplication is narrower than logical equivalence: this function finds safe-to-drop
 * duplicates, not proof that two differently-shaped expressions always produce the same value.
 * When it cannot establish equality from the available metadata, it treats the expressions as
 * distinct. A missed duplicate only costs a slightly larger result; a wrongly-merged pair would
 * silently change behavior.
 */
export function structurallyEqual(
  left: Expr,
  right: Expr,
  context: StructuralEqualityContext,
): boolean {
  if (left.kind() !== right.kind()) {
    return false;
  }
  if (!checkedTypesEqual(context.getType(left.id()), context.getType(right.id()))) {
    return false;
  }
  switch (left.kind()) {
    case ExprKind.Literal:
      return constantValuesEqual(left.asLiteral(), right.asLiteral());
    case ExprKind.Ident:
      return left.asIdent() === right.asIdent() && referencesEqual(context, left.id(), right.id());
    case ExprKind.Call:
      return callsEqual(left, right, context);
    case ExprKind.Select: {
      const a = left.asSelect()!;
      const b = right.asSelect()!;
      return (
        a.fieldName() === b.fieldName() &&
        a.isTestOnly() === b.isTestOnly() &&
        structurallyEqual(a.operand(), b.operand(), context)
      );
    }
    case ExprKind.List: {
      const a = left.asList()!;
      const b = right.asList()!;
      if (a.size() !== b.size()) {
        return false;
      }
      const aElements = a.elements();
      const bElements = b.elements();
      for (let i = 0; i < aElements.length; i += 1) {
        if (a.isOptional(i) !== b.isOptional(i)) {
          return false;
        }
        if (!structurallyEqual(aElements[i]!, bElements[i]!, context)) {
          return false;
        }
      }
      return true;
    }
    case ExprKind.Map: {
      const aEntries = left.asMap()!.entries();
      const bEntries = right.asMap()!.entries();
      if (aEntries.length !== bEntries.length) {
        return false;
      }
      return aEntries.every((entry, i) => entriesEqual(entry, bEntries[i]!, context));
    }
    case ExprKind.Struct: {
      const a = left.asStruct()!;
      const b = right.asStruct()!;
      if (a.typeName() !== b.typeName()) {
        return false;
      }
      const aFields = a.fields();
      const bFields = b.fields();
      if (aFields.length !== bFields.length) {
        return false;
      }
      return aFields.every((field, i) => entriesEqual(field, bFields[i]!, context));
    }
    case ExprKind.Comprehension: {
      const a = left.asComprehension()!;
      const b = right.asComprehension()!;
      return (
        a.iterVar() === b.iterVar() &&
        a.iterVar2() === b.iterVar2() &&
        a.accuVar() === b.accuVar() &&
        structurallyEqual(a.iterRange(), b.iterRange(), context) &&
        structurallyEqual(a.accuInit(), b.accuInit(), context) &&
        structurallyEqual(a.loopCondition(), b.loopCondition(), context) &&
        structurallyEqual(a.loopStep(), b.loopStep(), context) &&
        structurallyEqual(a.result(), b.result(), context)
      );
    }
    default:
      return false;
  }
}

function callsEqual(left: Expr, right: Expr, context: StructuralEqualityContext): boolean {
  const a = left.asCall()!;
  const b = right.asCall()!;
  if (a.functionName() !== b.functionName() || a.isMemberFunction() !== b.isMemberFunction()) {
    return false;
  }
  // Two calls with identical-looking syntax but different resolved overloads are different
  // operations (e.g. one operand is `dyn` and gets a different overload than a typed sibling), so
  // the resolved reference has to match, not just the function name.
  if (!referencesEqual(context, left.id(), right.id())) {
    return false;
  }
  if (a.isMemberFunction() && !structurallyEqual(a.target(), b.target(), context)) {
    return false;
  }
  const aArgs = a.args();
  const bArgs = b.args();
  if (aArgs.length !== bArgs.length) {
    return false;
  }
  return aArgs.every((arg, i) => structurallyEqual(arg, bArgs[i]!, context));
}

function entriesEqual(
  left: EntryExpr,
  right: EntryExpr,
  context: StructuralEqualityContext,
): boolean {
  if (left.kind() !== right.kind()) {
    return false;
  }
  if (left.kind() === EntryExprKind.MapEntry) {
    const a = left.asMapEntry()!;
    const b = right.asMapEntry()!;
    return (
      a.isOptional() === b.isOptional() &&
      structurallyEqual(a.key(), b.key(), context) &&
      structurallyEqual(a.value(), b.value(), context)
    );
  }
  const a = left.asStructField()!;
  const b = right.asStructField()!;
  return (
    a.name() === b.name() &&
    a.isOptional() === b.isOptional() &&
    structurallyEqual(a.value(), b.value(), context)
  );
}

function referencesEqual(
  context: StructuralEqualityContext,
  leftId: number,
  rightId: number,
): boolean {
  const left = context.getReference(leftId);
  const right = context.getReference(rightId);
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.equals(right);
}

/** checkedTypesEqual compares two checked types, treating a missing entry as `dyn`. */
function checkedTypesEqual(left: CheckedType | undefined, right: CheckedType | undefined): boolean {
  return equals(TypeSchema, left ?? checkedDyn, right ?? checkedDyn);
}

/**
 * constantValuesEqual compares literal values. Two literals are equal only when their underlying
 * representations match exactly, so `1` and `1.0` are distinct even though they compare equal at
 * runtime — this function answers "are these the same literal", not "do these evaluate the same".
 *
 * `null`, `boolean`, `bigint`, `number`, and `string` compare equal with `===`. `Uint8Array` needs
 * a byte-by-byte comparison, since equal-content byte arrays are always distinct object instances
 * here. A raw `Constant` message can also reach this function: an AST built from a checked-expr
 * proto (`protoToExpr`) keeps a `uint64` literal as its original `Constant` message rather than
 * unwrapping it to a `bigint`, since a bare `bigint` can't itself record that it is unsigned.
 */
function constantValuesEqual(
  left: ConstantValue | undefined,
  right: ConstantValue | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return bytesEqual(left, right);
  }
  if (isMessage(left, ConstantSchema) && isMessage(right, ConstantSchema)) {
    return equals(ConstantSchema, left, right);
  }
  return false;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

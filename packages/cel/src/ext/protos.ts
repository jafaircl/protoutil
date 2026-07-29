import type { LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import type { Expr } from "../common/ast/index.js";
import { ExprKind } from "../common/ast/index.js";
import { receiverMacro } from "../parser/macro.js";
import type { ExprHelper } from "../parser/options.js";

/** protoNamespace is the receiver namespace used by protobuf extension macros. */
const protoNamespace = "proto";
/** hasExtension is the protobuf extension presence macro name. */
const hasExtension = "hasExt";
/** getExtension is the protobuf extension selection macro name. */
const getExtension = "getExt";

/**
 * ProtosOptions configures protobuf extension utilities.
 */
export interface ProtosOptions {
  /** version selects the protobuf utility library version. */
  readonly version?: number;
}

/**
 * ProtosLibrary describes the singleton protobuf utility library.
 */
export type ProtosLibrary = SingletonLibrary & LibraryVersioner;

/**
 * protos configures extended macros for protobuf manipulation.
 *
 * All macros use the `proto` namespace. At macro expansion time the namespace looks like any
 * other identifier, so applications with a variable named `proto` should account for the
 * possibility of a collision.
 *
 * `proto.getExt(message, fully.qualified.extension.name)` retrieves an extension field using
 * safe-traversal default semantics.
 *
 * `proto.hasExt(message, fully.qualified.extension.name)` reports whether an extension field is
 * present on a proto2 message.
 */
export function protos(options: ProtosOptions = {}): ProtosLibrary {
  return {
    libraryName: "cel.lib.ext.protos",
    libraryVersion: options.version ?? 0xffffffff,
    compileOptions: {
      macros: {
        custom: [
          receiverMacro(getExtension, 2, expandGetExtension),
          receiverMacro(hasExtension, 2, expandHasExtension),
        ],
      },
    },
    programOptions: {},
  };
}

/**
 * expandHasExtension generates a test-only select for a fully qualified extension name.
 */
function expandHasExtension(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  if (!matchesProtoNamespace(target)) {
    return undefined;
  }
  const field = extensionFieldName(args[1]!);
  if (field === undefined) {
    return helper.error(args[1]!.id(), "invalid extension field");
  }
  return helper.presenceTest(args[0]!, field);
}

/**
 * expandGetExtension generates a select for a fully qualified extension name.
 */
function expandGetExtension(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  if (!matchesProtoNamespace(target)) {
    return undefined;
  }
  const field = extensionFieldName(args[1]!);
  if (field === undefined) {
    return helper.error(args[1]!.id(), "invalid extension field");
  }
  return helper.select(args[0]!, field);
}

/**
 * matchesProtoNamespace reports whether the macro target is the `proto` identifier.
 */
function matchesProtoNamespace(target: Expr | undefined): boolean {
  return target?.kind() === ExprKind.Ident && target.asIdent() === protoNamespace;
}

/**
 * extensionFieldName validates and flattens a selected extension identifier.
 *
 * A bare identifier is intentionally rejected even though it is accepted while recursively
 * validating the operand of a select.
 */
function extensionFieldName(expression: Expr): string | undefined {
  if (expression.kind() !== ExprKind.Select) {
    return undefined;
  }
  return selectedIdentifier(expression);
}

/**
 * selectedIdentifier recursively converts a non-test-only identifier selection to its full name.
 */
function selectedIdentifier(expression: Expr): string | undefined {
  if (expression.kind() === ExprKind.Ident) {
    return expression.asIdent();
  }
  if (expression.kind() !== ExprKind.Select) {
    return undefined;
  }
  const selection = expression.asSelect()!;
  if (selection.isTestOnly()) {
    return undefined;
  }
  const operand = selectedIdentifier(selection.operand());
  return operand === undefined ? undefined : `${operand}.${selection.fieldName()}`;
}

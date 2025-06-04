import { createMutableRegistry } from '@bufbuild/protobuf';
import { CheckedExpr, Decl } from '../gen/google/api/expr/v1alpha1/checked_pb.js';
import { Expr, ParsedExpr } from '../gen/google/api/expr/v1alpha1/syntax_pb.js';
import { Checker } from './checker.js';
import { Declarations, EnumDecl } from './declarations.js';
import { drillDownOnErrorMessage } from './errors.js';
import { standardFunctionDeclarations } from './functions.js';
import { Parser } from './parser.js';
import { Unparser } from './unparser.js';

/**
 * Parses a filter string into a ParsedExpr object.
 *
 * @param filter The filter string to parse.
 * @returns a ParsedExpr object.
 * @throws an error if the filter string is invalid.
 */
export function parseFilter(filter: string): ParsedExpr {
  const parser = new Parser(filter);
  const result = parser.parse();
  if (result instanceof Error) {
    const message = drillDownOnErrorMessage(result);
    throw new Error(message);
  }
  return result;
}

/**
 * Checks a ParsedExpr object for type correctness.
 *
 * @param expr the ParsedExpr to check
 * @param declarations the Declarations to use for checking
 * @returns the CheckedExpr
 * @throws an error if the checker fails
 */
export function checkParsedExpression(
  expr: ParsedExpr,
  declarations: Declarations = new Declarations({
    declarations: [...standardFunctionDeclarations()],
  })
): CheckedExpr {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const checker = new Checker(expr.expr!, expr.sourceInfo!, declarations);
  const result = checker.check();
  if (result instanceof Error) {
    const message = drillDownOnErrorMessage(result);
    throw new Error(message);
  }
  return result;
}

/**
 * Parses and checks a filter string.
 *
 * @param filter The filter string to parse and check.
 * @param declarations The Declarations to use for checking.
 * @returns A CheckedExpr object.
 * @throws An error if the parsing or checking fails.
 */
export function parseAndCheckFilter(
  filter: string,
  declarations: Declarations = extendStandardFilterDeclarations([])
): CheckedExpr {
  const parsed = parseFilter(filter);
  return checkParsedExpression(parsed, declarations);
}

/**
 * Extends the standard function declarations with additional declarations.
 *
 * @param declarations the additional declarations to add
 * @param typeRegistry an optional MutableRegistry to use for protobuf types
 * @returns
 */
export function extendStandardFilterDeclarations(
  declarations: (Decl | EnumDecl)[],
  typeRegistry = createMutableRegistry()
) {
  const extendedDeclarations = new Declarations({
    declarations: [...standardFunctionDeclarations(), ...declarations],
    typeRegistry,
  });
  return extendedDeclarations;
}

/**
 * Unparses an Expr object into a string. Note that this does not perform
 * any type checking or validation. It simply returns the string
 * representation of the expression.
 *
 * @param expr the `Expr` message to unparse
 * @returns a string representation of the expression
 */
export function unparseFilter(expr: Expr) {
  const unparser = new Unparser(expr);
  return unparser.unparse();
}

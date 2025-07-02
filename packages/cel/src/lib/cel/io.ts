import { create } from '@bufbuild/protobuf';
import { AST, SourceInfo } from '../common/ast/ast.js';
import { protoToSourceInfo, toCheckedExprProto } from '../common/conversion.js';
import { InfoSource } from '../common/source.js';
import { isNil } from '../common/utils.js';
import { unparse } from '../parser/unparser.js';
import { CheckedExpr, Expr, ParsedExpr, ParsedExprSchema } from '../protogen-exports/index.js';
import { Ast, Source } from './env.js';

/**
 * CheckedExprToAst converts a checked expression proto message to an Ast.
 */
export function checkedExprToAst(checkedExpr: CheckedExpr): Ast {
  return checkedExprToAstWithSource(checkedExpr);
}

/**
 * CheckedExprToAstWithSource converts a checked expression proto message to an Ast,
 * using the provided Source as the textual contents.
 *
 * In general the source is not necessary unless the AST has been modified between the
 * `Parse` and `Check` calls as an `Ast` created from the `Parse` step will carry the source
 * through future calls.
 *
 * Prefer CheckedExprToAst if loading expressions from storage.
 */
export function checkedExprToAstWithSource(checkedExpr: CheckedExpr, src?: Source): Ast {
  if (!checkedExpr.expr) {
    throw new Error('expr is required');
  }
  if (!checkedExpr.sourceInfo) {
    throw new Error('sourceInfo is required');
  }
  if (isNil(src)) {
    src = new InfoSource(checkedExpr.sourceInfo);
  }
  return new Ast(src, new AST(checkedExpr.expr, protoToSourceInfo(checkedExpr.sourceInfo)));
}

/**
 * AstToCheckedExpr converts an Ast to an protobuf CheckedExpr value.
 *
 * If the Ast.IsChecked() returns false, this conversion method will return an error.
 */
export function astToCheckedExpr(a: Ast): CheckedExpr {
  if (!a.nativeRep().isChecked()) {
    throw new Error('cannot convert unchecked ast');
  }
  return toCheckedExprProto(a.nativeRep());
}

/**
 * ParsedExprToAst converts a parsed expression proto message to an Ast.
 */
export function parsedExprToAst(parsedExpr: ParsedExpr): Ast {
  return parsedExprToAstWithSource(parsedExpr);
}

/**
 * ParsedExprToAstWithSource converts a parsed expression proto message to an Ast,
 * using the provided Source as the textual contents.
 *
 * In general you only need this if you need to recheck a previously checked
 * expression, or if you need to separately check a subset of an expression.
 *
 * Prefer ParsedExprToAst if loading expressions from storage.
 */
export function parsedExprToAstWithSource(parsedExpr: ParsedExpr, src?: Source): Ast {
  if (!parsedExpr.expr) {
    throw new Error('expr is required');
  }
  if (!parsedExpr.sourceInfo) {
    throw new Error('sourceInfo is required');
  }
  if (isNil(src)) {
    src = new InfoSource(parsedExpr.sourceInfo);
  }
  return new Ast(src, new AST(parsedExpr.expr, protoToSourceInfo(parsedExpr.sourceInfo)));
}

/**
 * AstToParsedExpr converts an Ast to an protobuf ParsedExpr value.
 */
export function astToParsedExpr(a: Ast): ParsedExpr {
  return create(ParsedExprSchema, {
    expr: a.nativeRep().expr(),
    sourceInfo: a.sourceInfo(),
  });
}

/**
 * AstToString converts an Ast back to a string if possible.
 *
 * Note, the conversion may not be an exact replica of the original expression, but will produce
 * a string that is semantically equivalent and whose textual representation is stable.
 */
export function astToString(a: Ast): string {
  return exprToString(a.nativeRep().expr(), a.nativeRep().sourceInfo());
}

/**
 * ExprToString converts an AST Expr node back to a string using macro call tracking metadata from
 * source info if any macros are encountered within the expression.
 */
export function exprToString(e: Expr, info: SourceInfo) {
  const ast = new AST(e, info);
  return unparse(ast);
}

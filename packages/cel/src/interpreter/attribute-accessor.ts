import { AST, type Expr, ExprKind, type ReferenceInfo } from "../common/ast/index.js";
import type { Adapter, Provider, Val } from "../common/types/index.js";
import type { Activation } from "./activation.js";
import { dispatcher } from "./dispatcher.js";
import type { InterpretableAttribute, InterpretableV2 } from "./interpretable.js";
import { interpreter } from "./interpreter.js";

/** A reusable checked CEL attribute expression. */
export interface AttributeAccessor {
  /** The resolved variable, selected fields, and source-level display path. */
  readonly path: AttributePath;

  /** resolve evaluates the accessor with normal CEL semantics. */
  resolve(vars: Activation): Val;
}

/** Options used to create an accessor from a checked expression. */
export interface AttributeAccessorOptions {
  /** ast is the checked AST that owns the expression metadata. */
  ast: AST;

  /** expr is the identifier or select expression to resolve. */
  expr: Expr;

  /** adapter is the type adapter used by the environment and evaluator. */
  adapter: Adapter;

  /** provider is the type provider used by the environment and evaluator. */
  provider: Provider;
}

/** The semantic parts of a checked CEL attribute expression. */
export interface AttributePath {
  /** variable is the resolved variable name of the attribute expression. */
  readonly variable: string;
  /** fields is the ordered list of selected fields in the attribute expression. */
  readonly fields: readonly string[];
  /** display is the source-level representation of the attribute expression. */
  readonly display: string;
}

/**
 * attributeAccessor creates an accessor for a checked identifier or select expression.
 *
 * It returns undefined for calls, presence tests, and other expression forms.
 */
export function attributeAccessor(
  options: AttributeAccessorOptions,
): AttributeAccessor | undefined {
  if (!options.ast.isChecked()) {
    throw new Error("attribute accessor requires a checked AST");
  }

  const path = accessorPath(options.expr, options.ast.referenceMap());
  if (path === undefined) {
    return undefined;
  }

  const scopedAst = new AST(
    options.expr,
    options.ast.sourceInfo(),
    options.ast.typeMap(),
    options.ast.referenceMap(),
    options.ast.source(),
  );
  const planned = interpreter({
    dispatcher: dispatcher(),
    adapter: options.adapter,
    provider: options.provider,
  }).interpretable({ exprAst: scopedAst });
  if (!isInterpretableAttribute(planned)) {
    return undefined;
  }

  return {
    path,
    resolve: (vars) => planned.eval(vars),
  };
}

/** accessorPath validates the expression and returns its resolved variable and fields. */
function accessorPath(
  expr: Expr,
  references: Map<number, ReferenceInfo>,
): AttributePath | undefined {
  const reference = references.get(expr.id());
  if (reference?.value !== undefined) {
    return undefined;
  }
  if (reference?.name) {
    return {
      variable: reference.name,
      fields: [],
      display: displayPath(expr),
    };
  }

  switch (expr.kind()) {
    case ExprKind.Ident: {
      const name = expr.asIdent();
      return name === undefined
        ? undefined
        : {
            variable: name,
            fields: [],
            display: name,
          };
    }
    case ExprKind.Select: {
      const select = expr.asSelect();
      if (select === undefined || select.isTestOnly()) {
        return undefined;
      }
      const operand = accessorPath(select.operand(), references);
      if (operand === undefined) {
        return undefined;
      }
      const field = select.fieldName();
      return {
        variable: operand.variable,
        fields: [...operand.fields, field],
        display: `${operand.display}.${field}`,
      };
    }
    default:
      return undefined;
  }
}

/** displayPath renders the source form of an identifier or select expression. */
function displayPath(expr: Expr): string {
  if (expr.kind() === ExprKind.Ident) {
    return expr.asIdent() ?? "";
  }
  const select = expr.asSelect();
  return select === undefined ? "" : `${displayPath(select.operand())}.${select.fieldName()}`;
}

/** isInterpretableAttribute reports whether the planner produced an attribute instruction. */
function isInterpretableAttribute(value: InterpretableV2): value is InterpretableAttribute {
  return "attr" in value && typeof (value as { attr?: unknown }).attr === "function";
}

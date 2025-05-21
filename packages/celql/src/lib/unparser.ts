import { Ast } from '@bearclaw/cel';
import { Constant, Expr, ExprSchema } from '@buf/google_cel-spec.bufbuild_es/cel/expr/syntax_pb.js';
import { toJsonString } from '@bufbuild/protobuf';
import {
  isBinaryOrTernaryOperator,
  isComplexOperator,
  isComplexOperatorWithRespectTo,
  isLeftRecursive,
  isSamePrecedence,
  isStringLiteral,
} from './common.js';
import { Dialect } from './dialect.js';
import {
  ADD_OPERATOR,
  CONDITIONAL_OPERATOR,
  DIVIDE_OPERATOR,
  EQUALS_OPERATOR,
  GREATER_EQUALS_OPERATOR,
  GREATER_OPERATOR,
  IN_OPERATOR,
  INDEX_OPERATOR,
  LESS_EQUALS_OPERATOR,
  LESS_OPERATOR,
  LOGICAL_AND_OPERATOR,
  LOGICAL_NOT_OPERATOR,
  LOGICAL_OR_OPERATOR,
  MODULO_OPERATOR,
  MULTIPLY_OPERATOR,
  NEGATE_OPERATOR,
  NOT_EQUALS_OPERATOR,
  SUBTRACT_OPERATOR,
} from './operators.js';

export class Unparser {
  private _str = '';
  private _vars: unknown[] = [];

  constructor(private readonly _expr: Ast, private readonly _dialect: Dialect) {}

  get vars() {
    return this._vars;
  }

  unparse() {
    const expr = this._expr.nativeRep().expr();
    if (!expr) {
      return {
        sql: '',
        vars: [],
      };
    }
    this.visit(expr);
    return {
      sql: this._str,
      vars: this._vars,
    };
  }

  writeString(str: string) {
    this._str += str;
  }

  writeQueryParam(value: unknown) {
    this._dialect.writeQueryParam(this, value);
  }

  pushVar(value: unknown) {
    this._vars.push(value);
  }

  visit(expr: Expr) {
    const visited = this.visitMaybeMacroCall(expr);
    if (visited) {
      return;
    }
    switch (expr.exprKind.case) {
      case 'callExpr':
        return this.visitCall(expr);
      case 'constExpr':
        return this.visitConst(expr);
      case 'identExpr':
        return this.visitIdent(expr);
      case 'listExpr':
        return this.visitList(expr);
      case 'selectExpr':
        return this.visitSelect(expr);
      case 'structExpr':
        return this.visitStruct(expr);
      default:
        throw new Error(`Unsupported expression: ${expr.exprKind.case}`);
    }
  }

  visitCall(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const override = this.visitCallFuncOverride(c.function, c.args, c.target);
    if (override) {
      return;
    }
    const fun = c.function;
    switch (fun) {
      // conditional operator
      case CONDITIONAL_OPERATOR:
        return this.visitCallConditional(expr);
      // index operator
      case INDEX_OPERATOR:
        return this.visitCallIndex(expr);
      // unary operators
      case LOGICAL_NOT_OPERATOR:
      case NEGATE_OPERATOR:
        return this.visitCallUnary(expr);
      // binary operators
      case ADD_OPERATOR:
      case DIVIDE_OPERATOR:
      case EQUALS_OPERATOR:
      case GREATER_OPERATOR:
      case GREATER_EQUALS_OPERATOR:
      case IN_OPERATOR:
      case LESS_OPERATOR:
      case LESS_EQUALS_OPERATOR:
      case LOGICAL_AND_OPERATOR:
      case LOGICAL_OR_OPERATOR:
      case MODULO_OPERATOR:
      case MULTIPLY_OPERATOR:
      case NOT_EQUALS_OPERATOR:
      case SUBTRACT_OPERATOR:
        return this.visitCallBinary(expr);
      default:
        return this.visitCallFunc(expr);
    }
  }

  visitCallBinary(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const fun = c.function;
    const args = c.args;
    const lhs = args[0];
    // add parens if the current operator is lower precedence than the lhs expr operator.
    const lhsParen = isComplexOperatorWithRespectTo(fun, lhs);
    const rhs = args[1];
    // add parens if the current operator is lower precedence than the rhs expr operator,
    // or the same precedence and the operator is left recursive.
    let rhsParen = isComplexOperatorWithRespectTo(fun, rhs);
    if (!rhsParen && isLeftRecursive(fun)) {
      rhsParen = isSamePrecedence(fun, rhs);
    }
    this.visitMaybeNested(lhs, lhsParen);
    const unmangled = this._dialect.findSqlOperator(fun);
    if (!unmangled) {
      throw new Error(`Cannot unmangle operator: ${fun}`);
    }

    this.writeString(` ${unmangled} `);
    return this.visitMaybeNested(rhs, rhsParen);
  }

  visitCallConditional(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const args = c.args;
    this.writeString('CASE WHEN ');
    // add parens if operand is a conditional itself.
    let nested = isSamePrecedence(CONDITIONAL_OPERATOR, args[0]) || isComplexOperator(args[0]);
    this.visitMaybeNested(args[0], nested);
    this.writeString(' THEN ');

    // add parens if operand is a conditional itself.
    nested = isSamePrecedence(CONDITIONAL_OPERATOR, args[1]) || isComplexOperator(args[1]);
    this.visitMaybeNested(args[1], nested);

    this.writeString(' ELSE ');

    // add parens if operand is a conditional itself.
    nested = isSamePrecedence(CONDITIONAL_OPERATOR, args[2]) || isComplexOperator(args[2]);

    this.visitMaybeNested(args[2], nested);

    this.writeString(' END');
  }

  visitCallFunc(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const fun = c.function;
    const args = c.args;
    if (c.target) {
      const nested = isBinaryOrTernaryOperator(c.target);
      this.visitMaybeNested(c.target, nested);
      this.writeString('.');
    }
    this.writeString(fun);
    this.writeString('(');
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      this.visit(arg);
      if (i < args.length - 1) {
        this.writeString(', ');
      }
    }
    this.writeString(')');
  }

  visitCallFuncOverride(functionName: string, args: Expr[], target?: Expr) {
    let _args = args;
    if (target) {
      _args = [target, ...args];
    }
    const override = this._dialect.functionToSqlOverrides(this, functionName, _args);
    if (override) {
      return true;
    }
    return false;
  }

  visitCallIndex(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const args = c.args;
    const nested = isBinaryOrTernaryOperator(args[0]);
    this.visitMaybeNested(args[0], nested);
    this.writeString('[');
    this.visit(args[1]);
    this.writeString(']');
  }

  visitCallUnary(expr: Expr) {
    if (expr.exprKind.case !== 'callExpr') {
      throw new Error('Expected callExpr');
    }
    const c = expr.exprKind.value;
    const fun = c.function;
    const args = c.args;
    const unmangled = this._dialect.findSqlOperator(fun);
    if (!unmangled) {
      throw new Error(`Cannot unmangle operator: ${fun}`);
    }
    this.writeString(unmangled);
    const nested = isComplexOperator(args[0]);
    return this.visitMaybeNested(args[0], nested);
  }

  visitConst(expr: Expr) {
    if (expr.exprKind.case !== 'constExpr') {
      throw new Error('Expected constExpr');
    }
    const val = expr.exprKind.value;
    this.visitConstVal(val);
  }

  visitConstVal(val: Constant) {
    switch (val.constantKind.case) {
      case 'boolValue':
      case 'bytesValue':
      case 'doubleValue':
      case 'int64Value':
      case 'uint64Value':
      case 'nullValue':
      case 'stringValue':
        return this.writeQueryParam(val.constantKind.value);
      default:
        throw new Error('Unsupported constant type');
    }
  }

  visitIdent(expr: Expr) {
    if (expr.exprKind.case !== 'identExpr') {
      throw new Error('Expected identExpr');
    }
    const id = expr.exprKind.value;
    this.writeString(this._dialect.maybeQuoteIdentifier(id.name));
  }

  visitList(expr: Expr) {
    if (expr.exprKind.case !== 'listExpr') {
      throw new Error('Expected listExpr');
    }
    const l = expr.exprKind.value;
    const elems = l.elements;
    this.writeString('(');
    for (let i = 0; i < elems.length; i += 1) {
      const elem = elems[i];
      this.visit(elem);
      if (i < elems.length - 1) {
        this.writeString(', ');
      }
    }
    this.writeString(')');
  }

  visitSelect(expr: Expr) {
    if (expr.exprKind.case !== 'selectExpr') {
      throw new Error('Expected selectExpr');
    }
    const sel = expr.exprKind.value;
    return this.visitSelectInternal(sel.operand as Expr, sel.testOnly, '.', sel.field);
  }

  visitSelectInternal(operand: Expr, testOnly: boolean, op: string, field: string) {
    // handle the case when the select expression was generated by the has() macro.
    if (testOnly) {
      this.writeString('has(');
    }
    const nested = !testOnly && isBinaryOrTernaryOperator(operand);
    this.visitMaybeNested(operand, nested);
    this.writeString(op);
    this.writeString(this._dialect.maybeQuoteIdentifier(field));
    if (testOnly) {
      this.writeString(')');
    }
  }

  visitStruct(expr: Expr) {
    if (expr.exprKind.case !== 'structExpr') {
      throw new Error('Expected structExpr');
    }
    if (expr.exprKind.value.messageName !== '') {
      return this.visitStructMsg(expr);
    }
    return this.visitStructMap(expr);
  }

  visitStructMsg(expr: Expr) {
    if (expr.exprKind.case !== 'structExpr') {
      throw new Error('Expected structExpr');
    }
    const m = expr.exprKind.value;
    const fields = m.entries;
    this.writeString(m.messageName);
    this.writeString('{');
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      const f = field.keyKind.value as string;
      this.writeString(this._dialect.maybeQuoteIdentifier(f));
      this.writeString(': ');
      const v = field.value as Expr;
      this.visit(v);
      if (i < fields.length - 1) {
        this.writeString(', ');
      }
    }
    this.writeString('}');
  }

  visitStructMap(expr: Expr) {
    if (expr.exprKind.case !== 'structExpr') {
      throw new Error('Expected structExpr');
    }
    const m = expr.exprKind.value;
    const entries = m.entries;
    this.writeString('STRUCT(');
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const v = entry.value as Expr;
      this.visit(v);
      this.writeString(' AS ');
      const fieldName =
        entry.keyKind.case === 'fieldKey'
          ? this._dialect.maybeQuoteIdentifier(entry.keyKind.value)
          : this.extractFieldName(entry.keyKind.value as Expr);
      this.writeString(fieldName);
      if (i < entries.length - 1) {
        this.writeString(', ');
      }
    }
    this.writeString(')');
  }

  visitMaybeMacroCall(expr: Expr) {
    const call = this._expr.sourceInfo().macroCalls[expr.id.toString()];
    if (!call) {
      return false;
    }
    this.visit(call);
    return true;
  }

  visitMaybeNested(expr: Expr, nested: boolean) {
    if (nested) {
      this.writeString('(');
    }
    this.visit(expr);
    if (nested) {
      this.writeString(')');
    }
  }

  getType(expr: Expr) {
    return this._expr.nativeRep().getType(expr.id);
  }

  extractFieldName(expr: Expr) {
    if (!isStringLiteral(expr)) {
      throw new Error(`unsupported field name type ${toJsonString(ExprSchema, expr)}`);
    }
    const name = expr.exprKind.value.constantKind.value;
    return this._dialect.maybeQuoteIdentifier(name);
  }
}

// function isMapType(type: Type) {
//   return type.typeKind.case === 'mapType';
// }

// function isListType(type: Type) {
//   return type.typeKind.case === 'listType';
// }

// /**
//  * isLeftRecursive indicates whether the parser resolves the call in a
//  * left-recursive manner as this can have an effect of how parentheses affect
//  * the order of operations in the AST.
//  */
// function isLeftRecursive(op: string) {
//   return op !== LOGICAL_OR_OPERATOR && op !== LOGICAL_AND_OPERATOR;
// }

// /**
//  * isSamePrecedence indicates whether the precedence of the input operator is
//  * the same as the precedence of the (possible) operation represented in the
//  * input Expr.
//  *
//  * If the expr is not a Call, the result is false.
//  */
// function isSamePrecedence(op: string, expr: Expr) {
//   if (expr.exprKind.case !== 'callExpr') {
//     return false;
//   }
//   return precedence(op) === precedence(expr.exprKind.value.function);
// }

// /**
//  * isLowerPrecedence indicates whether the precedence of the input operator is
//  * lower precedence than the (possible) operation represented in the input Expr.
//  *
//  * If the expr is not a Call, the result is false.
//  */
// function isLowerPrecedence(op: string, expr: Expr) {
//   return precedence(op) < precedence((expr.exprKind.value as Expr_Call).function);
// }

// /**
//  * Indicates whether the expr is a complex operator, i.e., a call expression
//  * with 2 or more arguments.
//  */
// function isComplexOperator(expr: Expr) {
//   if (expr.exprKind.case == 'callExpr' && expr.exprKind.value.args.length >= 2) {
//     return true;
//   }
//   return false;
// }

// /**
//  * Indicates whether it is a complex operation compared to another.
//  * expr is *not* considered complex if it is not a call expression or has
//  * less than two arguments, or if it has a higher precedence than op.
//  */
// function isComplexOperatorWithRespectTo(op: string, expr: Expr) {
//   if (expr.exprKind.case !== 'callExpr' || expr.exprKind.value.args.length < 2) {
//     return false;
//   }
//   return isLowerPrecedence(op, expr);
// }

// /**
//  * Indicate whether this is a binary or ternary operator.
//  */
// function isBinaryOrTernaryOperator(expr: Expr) {
//   if (expr.exprKind.case !== 'callExpr' || expr.exprKind.value.args.length < 2) {
//     return false;
//   }
//   const isBinaryOp = findReverseBinaryOperator(expr.exprKind.value.function) !== '';
//   return isBinaryOp || isSamePrecedence(CONDITIONAL_OPERATOR, expr);
// }

// /**
//  * bytesToOctets converts byte sequences to a string using a three digit octal
//  * encoded value per byte.
//  */
// function bytesToOctets(bytes: Uint8Array): string {
//   let result = '';
//   for (const byte of bytes) {
//     result += `\\${byte.toString(8).padStart(3, '0')}`;
//   }
//   return result;
// }

// function isNullLiteral(expr: Expr): expr is Expr & {
//   exprKind: { case: 'constExpr'; value: { constantKind: { case: 'nullValue' } } };
// } {
//   if (!expr) {
//     return false;
//   }
//   if (expr.exprKind.case !== 'constExpr') {
//     return false;
//   }
//   const constant = expr.exprKind.value.constantKind;
//   return constant.case === 'nullValue';
// }

// function isBoolLiteral(expr: Expr): expr is Expr & {
//   exprKind: { case: 'constExpr'; value: { constantKind: { case: 'boolValue' } } };
// } {
//   if (!expr) {
//     return false;
//   }
//   if (expr.exprKind.case !== 'constExpr') {
//     return false;
//   }
//   const constant = expr.exprKind.value.constantKind;
//   return constant.case === 'boolValue';
// }

// function isStringLiteral(expr: Expr): expr is Expr & {
//   exprKind: { case: 'constExpr'; value: { constantKind: { case: 'stringValue' } } };
// } {
//   if (!expr) {
//     return false;
//   }
//   if (expr.exprKind.case !== 'constExpr') {
//     return false;
//   }
//   const constant = expr.exprKind.value.constantKind;
//   return constant.case === 'stringValue';
// }

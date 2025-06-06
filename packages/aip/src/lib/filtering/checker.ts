/* eslint-disable no-case-declarations */
import { create, equals } from '@bufbuild/protobuf';
import {
  durationFromString,
  isValidDuration,
  isValidTimestamp,
  timestampFromDateString,
} from '@protoutil/core';
import {
  CheckedExprSchema,
  Decl_FunctionDecl,
  Decl_FunctionDecl_Overload,
  Decl_IdentDecl,
  Type,
  TypeSchema,
} from '../gen/google/api/expr/v1alpha1/checked_pb.js';
import { Expr, SourceInfo } from '../gen/google/api/expr/v1alpha1/syntax_pb.js';
import { Declarations } from './declarations.js';
import { TypeError } from './errors.js';
import {
  FunctionOverloadDurationString,
  FunctionOverloadEqualsTimestampString,
  FunctionOverloadGreaterEqualsTimestampString,
  FunctionOverloadGreaterThanTimestampString,
  FunctionOverloadLessEqualsTimestampString,
  FunctionOverloadLessThanTimestampString,
  FunctionOverloadNotEqualsTimestampString,
  FunctionOverloadTimestampString,
} from './functions.js';
import { getFieldType, TypeBool, TypeFloat, TypeInt, TypeString } from './types.js';

export class Checker {
  private _declarations: Declarations;
  private _expr: Expr;
  private _sourceInfo: SourceInfo;
  private _typeMap: Map<bigint, Type> = new Map();

  constructor(expr: Expr, sourceInfo: SourceInfo, declarations: Declarations) {
    this._expr = expr;
    this._sourceInfo = sourceInfo;
    this._declarations = declarations;
  }

  check() {
    const err = this.checkExpr(this._expr);
    if (err instanceof Error) {
      return err;
    }
    const resultType = this.getType(this._expr);
    if (!resultType) {
      return this.errorf(this._expr, `unknown result type`);
    }
    if (!equals(TypeSchema, resultType, TypeBool)) {
      return this.errorf(this._expr, `non-bool result type`);
    }
    return create(CheckedExprSchema, {
      expr: this._expr,
      sourceInfo: this._sourceInfo,
      typeMap: Object.fromEntries(this._typeMap.entries()),
    });
  }

  checkExpr(expr: Expr): TypeError | void {
    if (!expr) {
      return;
    }
    switch (expr.exprKind.case) {
      case 'constExpr':
        switch (expr.exprKind.value.constantKind.case) {
          case 'boolValue':
            return this.checkBoolLiteral(expr);
          case 'doubleValue':
            return this.checkDoubleLiteral(expr);
          case 'int64Value':
            return this.checkInt64Literal(expr);
          case 'stringValue':
            return this.checkStringLiteral(expr);
          default:
            return this.errorf(
              expr,
              `unsupported constant kind: ${expr.exprKind.value.constantKind.case}`
            );
        }
      case 'identExpr':
        return this.checkIdentExpr(expr);
      case 'selectExpr':
        return this.checkSelectExpr(expr);
      case 'callExpr':
        return this.checkCallExpr(expr);
      default:
        return this.errorf(expr, `unsupported expr kind: ${expr.exprKind.case}`);
    }
  }

  checkIdentExpr(e: Expr): TypeError | void {
    if (e.exprKind.case !== 'identExpr') {
      return this.errorf(e, `expected ident expression, got ${e.exprKind.case}`);
    }
    const identExpr = e.exprKind.value;
    const ident = this._declarations.lookupIdent(identExpr.name);
    if (!ident) {
      return this.errorf(e, `undeclared identifier '${identExpr.name}'`);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const err = this.setType(e, (ident.declKind.value as Decl_IdentDecl).type!);
    if (err instanceof Error) {
      return this.wrapf(e, err, `identifier '${identExpr.name}'`);
    }
  }

  checkSelectExpr(e: Expr): TypeError | void {
    if (e.exprKind.case !== 'selectExpr') {
      return this.errorf(e, `expected select expression, got ${e.exprKind.case}`);
    }
    const qualifiedName = toQualifiedName(e);
    if (qualifiedName) {
      const ident = this._declarations.lookupIdent(qualifiedName);
      if (ident) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.setType(e, (ident.declKind.value as Decl_IdentDecl).type!);
      }
    }
    const selectExpr = e.exprKind.value;
    if (!selectExpr.operand) {
      return this.errorf(e, `missing operand`);
    }
    const operand = this.checkExpr(selectExpr.operand);
    if (operand instanceof Error) {
      return this.wrapf(e, operand, `check select expr`);
    }
    const operandType = this.getType(selectExpr.operand);
    if (!operandType) {
      return this.errorf(e, `failed to get operand type`);
    }
    switch (operandType.typeKind.case) {
      case 'listType':
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.setType(e, operandType.typeKind.value.elemType!);
      case 'mapType':
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.setType(e, operandType.typeKind.value.valueType!);
      case 'messageType':
        const fieldDescriptor = this._declarations.lookupMessageField(
          operandType.typeKind.value,
          selectExpr.field
        );
        if (!fieldDescriptor) {
          return this.errorf(
            e,
            `unknown field '${selectExpr.field}' for message type '${operandType.typeKind.value}'`
          );
        }
        const fieldType = getFieldType(fieldDescriptor);
        if (!fieldType) {
          return this.errorf(e, `failed to get field type for '${selectExpr.field}'`);
        }
        return this.setType(e, fieldType);
      default:
        return this.errorf(e, `unsupported operand type: ${operandType.typeKind.case}`);
    }
  }

  checkCallExpr(e: Expr): TypeError | void {
    if (e.exprKind.case !== 'callExpr') {
      return this.errorf(e, `expected call expression, got ${e.exprKind.case}`);
    }
    const callExpr = e.exprKind.value;
    for (const arg of callExpr.args) {
      const err = this.checkExpr(arg);
      if (err instanceof Error) {
        return err;
      }
    }
    const functionDeclaration = this._declarations.lookupFunction(callExpr.function);
    if (!functionDeclaration) {
      return this.errorf(e, `undeclared function '${callExpr.function}'`);
    }
    const functionOverload = this.resolveCallExprFunctionOverload(
      e,
      functionDeclaration.declKind.value as Decl_FunctionDecl
    );
    if (functionOverload instanceof Error) {
      return this.wrapf(e, functionOverload, `check call exp`);
    }
    const err = this.checkCallExprBuiltinFunctionOverloads(e, functionOverload);
    if (err instanceof Error) {
      return this.wrapf(e, err, `check call expr`);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.setType(e, functionOverload.resultType!);
  }

  resolveCallExprFunctionOverload(expr: Expr, functionDeclaration: Decl_FunctionDecl) {
    if (expr.exprKind.case !== 'callExpr') {
      return this.errorf(expr, `expected call expression, got ${expr.exprKind.case}`);
    }
    const callExpr = expr.exprKind.value;
    for (const overload of functionDeclaration.overloads) {
      if (callExpr.args.length !== overload.params.length) {
        continue;
      }
      if (overload.typeParams.length === 0) {
        let allTypesMatch = true;
        for (let i = 0; i < overload.params.length; i++) {
          const param = overload.params[i];
          const argType = this.getType(callExpr.args[i]);
          if (!argType) {
            return this.errorf(callExpr.args[i], `unknown type`);
          }
          if (!equals(TypeSchema, param, argType)) {
            allTypesMatch = false;
            break;
          }
        }
        if (allTypesMatch) {
          return overload;
        }
      }
      // TODO: Add support for type parameters.
    }
    const argTypes: string[] = [];
    for (const arg of callExpr.args) {
      const argType = this.getType(arg);
      if (!argType) {
        argTypes.push('UNKNOWN');
      } else {
        argTypes.push(argType.$typeName);
      }
    }
    return this.errorf(
      expr,
      `no matching overload found for calling '${callExpr.function}' with ${argTypes.join(', ')}`
    );
  }

  checkCallExprBuiltinFunctionOverloads(expr: Expr, overload: Decl_FunctionDecl_Overload) {
    if (expr.exprKind.case !== 'callExpr') {
      return this.errorf(expr, `expected call expression, got ${expr.exprKind.case}`);
    }
    const callExpr = expr.exprKind.value;
    switch (overload.overloadId) {
      case FunctionOverloadTimestampString:
        const arg0 = callExpr.args[0];
        if (arg0.exprKind.case !== 'constExpr') {
          break;
        }
        const constExpr = arg0.exprKind.value;
        if (constExpr.constantKind.case !== 'stringValue') {
          break;
        }
        if (!isValidTimestampString(constExpr.constantKind.value as string)) {
          return this.errorf(arg0, `invalid timestamp. Should be in RFC3339 format`);
        }
        break;
      case FunctionOverloadDurationString:
        const _arg0 = callExpr.args[0];
        if (_arg0.exprKind.case !== 'constExpr') {
          break;
        }
        const _constExpr = _arg0.exprKind.value;
        if (_constExpr.constantKind.case !== 'stringValue') {
          break;
        }
        if (!isValidDurationString(_constExpr.constantKind.value as string)) {
          return this.errorf(_arg0, `invalid duration`);
        }
        break;
      case FunctionOverloadLessThanTimestampString:
      case FunctionOverloadGreaterThanTimestampString:
      case FunctionOverloadLessEqualsTimestampString:
      case FunctionOverloadGreaterEqualsTimestampString:
      case FunctionOverloadEqualsTimestampString:
      case FunctionOverloadNotEqualsTimestampString:
        const arg1 = callExpr.args[1];
        if (arg1.exprKind.case !== 'constExpr') {
          break;
        }
        const constExpr1 = arg1.exprKind.value;
        if (constExpr1.constantKind.case !== 'stringValue') {
          break;
        }
        if (!isValidTimestampString(constExpr1.constantKind.value as string)) {
          return this.errorf(arg1, `invalid timestamp. Should be in RFC3339 format`);
        }
        break;
      default:
        break;
    }
    return null;
  }

  checkInt64Literal(expr: Expr) {
    return this.setType(expr, TypeInt);
  }

  checkStringLiteral(expr: Expr) {
    return this.setType(expr, TypeString);
  }

  checkDoubleLiteral(expr: Expr) {
    return this.setType(expr, TypeFloat);
  }

  checkBoolLiteral(expr: Expr) {
    return this.setType(expr, TypeBool);
  }

  errorf(expr: Expr, message: string) {
    return new TypeError(message, expr);
  }

  wrapf(expr: Expr, err: Error, message: string) {
    return new TypeError(message, expr, err);
  }

  setType(expr: Expr, type: Type): TypeError | void {
    const existingType = this._typeMap.get(expr.id);
    if (existingType && !equals(TypeSchema, existingType, type)) {
      return this.errorf(expr, `type conflict between ${existingType} and ${type}`);
    }
    this._typeMap.set(expr.id, type);
  }

  getType(expr: Expr): Type | null {
    const type = this._typeMap.get(expr?.id);
    if (type) {
      return type;
    }
    return null;
  }
}

function toQualifiedName(expr: Expr): string | null {
  switch (expr.exprKind?.case) {
    case 'identExpr':
      return expr.exprKind.value.name;
    case 'selectExpr':
      if (expr.exprKind.value.testOnly) {
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const parent = toQualifiedName(expr.exprKind.value.operand!);
      if (parent === null) {
        return null;
      }
      return `${parent}.${expr.exprKind.value.field}`;
    default:
      return null;
  }
}

function isValidTimestampString(str: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return isValidTimestamp(timestampFromDateString(str)!);
  } catch {
    return false;
  }
}

function isValidDurationString(str: string) {
  try {
    return isValidDuration(durationFromString(str));
  } catch {
    return false;
  }
}

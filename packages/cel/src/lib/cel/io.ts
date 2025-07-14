/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-case-declarations */
import { create } from '@bufbuild/protobuf';
import { AnySchema, anyUnpack } from '@bufbuild/protobuf/wkt';
import { AST, SourceInfo } from '../common/ast/ast.js';
import { protoToSourceInfo, toCheckedExprProto } from '../common/conversion.js';
import {
  newBoolProtoValue,
  newBytesProtoValue,
  newDoubleProtoValue,
  newIntProtoValue,
  newStringProtoValue,
  newUintProtoValue,
  NullProtoValue,
} from '../common/pb/values.js';
import { Adapter, isRegistry } from '../common/ref/provider.js';
import { RefVal } from '../common/ref/reference.js';
import { InfoSource } from '../common/source.js';
import { BoolRefVal } from '../common/types/bool.js';
import { BytesRefVal } from '../common/types/bytes.js';
import { DoubleRefVal } from '../common/types/double.js';
import { IntRefVal } from '../common/types/int.js';
import { NullRefVal } from '../common/types/null.js';
import { isObjectRefVal } from '../common/types/object.js';
import { StringRefVal } from '../common/types/string.js';
import { Lister } from '../common/types/traits/lister.js';
import { Mapper } from '../common/types/traits/mapper.js';
import {
  BoolType,
  BytesType,
  DoubleType,
  IntType,
  ListType,
  MapType,
  newObjectType,
  NullType,
  StringType,
  Type,
  TypeType,
  UintType,
} from '../common/types/types.js';
import { isNil } from '../common/utils.js';
import { unparse } from '../parser/unparser.js';
import {
  CheckedExpr,
  Expr,
  MapValue_Entry,
  MapValue_EntrySchema,
  ParsedExpr,
  ParsedExprSchema,
  Value,
  ValueSchema,
} from '../protogen-exports/index.js';
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

/**
 * ValueAsProto converts between ref.Val and cel.expr.Value.
 * The result Value is the serialized proto form. The ref.Val must not be error or unknown.
 */
export function valueAsProto(res: RefVal): Value | null {
  switch (res.type()) {
    case BoolType:
      return newBoolProtoValue(res.value());
    case BytesType:
      return newBytesProtoValue(res.value());
    case DoubleType:
      return newDoubleProtoValue(res.value());
    case IntType:
      return newIntProtoValue(res.value());
    case NullType:
      return NullProtoValue;
    case StringType:
      return newStringProtoValue(res.value());
    case TypeType:
      return create(ValueSchema, { kind: { case: 'typeValue', value: (res as Type).typeName() } });
    case UintType:
      return newUintProtoValue(res.value());
    case ListType:
      const list = res as Lister;
      const _sz = list.size().value();
      const elts: Value[] = [];
      for (let i = 0; i < _sz; i++) {
        const v = list.get(new IntRefVal(BigInt(i)));
        const protoVal = valueAsProto(v);
        if (!protoVal) {
          throw new Error(`valueAsProto failed for list element at index ${i}`);
        }
        elts.push(protoVal);
      }
      return create(ValueSchema, {
        kind: { case: 'listValue', value: { values: elts } },
      });
    case MapType:
      const mapper = res as Mapper;
      const entries: MapValue_Entry[] = [];
      for (const it = mapper.iterator(); it.hasNext().value(); ) {
        const k = it.next()!;
        const v = mapper.get(k);
        const keyProto = valueAsProto(k);
        const valProto = valueAsProto(v);
        if (!keyProto || !valProto) {
          throw new Error(`valueAsProto failed for map entry with key ${k.value()}`);
        }
        entries.push(
          create(MapValue_EntrySchema, {
            key: keyProto,
            value: valProto,
          })
        );
      }
      return create(ValueSchema, {
        kind: { case: 'mapValue', value: { entries } },
      });
    default:
      if (isObjectRefVal(res)) {
        switch (res.typeDesc.typeName) {
          case 'google.protobuf.Value':
            return create(ValueSchema, res.value() as Value);
          case 'google.protobuf.BoolValue':
            return newBoolProtoValue((res.value() as any).value);
          case 'google.protobuf.BytesValue':
            return newBytesProtoValue((res.value() as any).value);
          case 'google.protobuf.DoubleValue':
            return newDoubleProtoValue((res.value() as any).value);
          case 'google.protobuf.Int64Value':
          case 'google.protobuf.Int32Value':
            return newIntProtoValue((res.value() as any).value);
          case 'google.protobuf.NullValue':
            return NullProtoValue;
          case 'google.protobuf.StringValue':
            return newStringProtoValue((res.value() as any).value);
          case 'google.protobuf.UInt64Value':
          case 'google.protobuf.UInt32Value':
            return newUintProtoValue((res.value() as any).value);
          default:
            break;
        }
      }
      const any = res.convertToNative(AnySchema);
      return create(ValueSchema, {
        kind: { case: 'objectValue', value: any },
      });
  }
}

const typeNameToTypeValue: Record<string, Type> = {
  bool: BoolType,
  bytes: BytesType,
  double: DoubleType,
  null_type: NullType,
  int: IntType,
  list: ListType,
  map: MapType,
  string: StringType,
  type: TypeType,
  uint: UintType,
};

/**
 * ProtoAsValue converts between cel.expr.Value and ref.Val.
 */
export function protoAsValue(adapter: Adapter, v: Value): RefVal {
  switch (v.kind.case) {
    case 'nullValue':
      return new NullRefVal();
    case 'boolValue':
      return new BoolRefVal(v.kind.value);
    case 'int64Value':
      return new IntRefVal(v.kind.value);
    case 'uint64Value':
      return new IntRefVal(v.kind.value);
    case 'doubleValue':
      return new DoubleRefVal(v.kind.value);
    case 'stringValue':
      return new StringRefVal(v.kind.value);
    case 'bytesValue':
      return new BytesRefVal(v.kind.value);
    case 'objectValue':
      const any = v.kind.value;
      if (!isRegistry(adapter)) {
        throw new Error('adapter must be a registry to convert object values');
      }
      const schema = adapter.findStructProtoType(any.typeUrl.split('/').pop()!);
      if (!schema) {
        throw new Error(`unknown type: ${any.typeUrl}`);
      }
      return adapter.nativeToValue(anyUnpack(any, schema));
    case 'mapValue':
      const m = v.kind.value;
      const entries: Record<string, RefVal> = {};
      for (const entry of m.entries) {
        const key = protoAsValue(adapter, entry.key!);
        const value = protoAsValue(adapter, entry.value!);
        entries[key.value()] = value;
      }
      return adapter.nativeToValue(entries);
    case 'listValue':
      const l = v.kind.value;
      const elts: RefVal[] = [];
      for (const e of l.values) {
        const rv = protoAsValue(adapter, e);
        if (rv === null) {
          throw new Error('null value in list');
        }
        elts.push(rv);
      }
      return adapter.nativeToValue(elts);
    case 'typeValue':
      const typeName = v.kind.value;
      if (typeName in typeNameToTypeValue) {
        return typeNameToTypeValue[typeName] as RefVal;
      }
      return newObjectType(typeName);
  }
  throw new Error('unknown value');
}

import { Value } from '../../protogen/cel/expr/value_pb.js';
import { isDoubleProtoValue, isIntProtoValue, isUintProtoValue } from '../pb/values.js';
import { RefVal } from '../ref/reference.js';
import { DoubleRefVal } from './double.js';
import { IntRefVal } from './int.js';
import { DoubleType, IntType, UintType } from './types.js';
import { UintRefVal } from './uint.js';

export function isNumberProtoValue(value: Value): value is Value & {
  kind:
    | { case: 'doubleValue'; value: number }
    | { case: 'int64Value'; value: bigint }
    | { case: 'uint64Value'; value: bigint };
} {
  return isDoubleProtoValue(value) || isIntProtoValue(value) || isUintProtoValue(value);
}

export function isNumberRefVal(value: RefVal): value is DoubleRefVal | IntRefVal | UintRefVal {
  switch (value.type()) {
    case DoubleType:
    case IntType:
    case UintType:
      return true;
    default:
      return false;
  }
}

export function unwrapNumberProtoValue(value: Value): number | bigint | null {
  switch (value.kind.case) {
    case 'int64Value':
    case 'uint64Value':
    case 'doubleValue':
      return value.kind.value;
    default:
      return null;
  }
}

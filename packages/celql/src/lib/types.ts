import { listType, mapType, opaqueType, typeParamType } from '@protoutil/cel';

export const DateType = opaqueType('DateType');
export const TimeType = opaqueType('TimeType');

export const paramA = typeParamType('A');
export const paramB = typeParamType('B');
export const listOfA = listType(paramA);
export const mapOfAB = mapType(paramA, paramB);

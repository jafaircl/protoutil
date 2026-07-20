import { describe, expect, it } from "vitest";
import {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  ErrorType,
  IntType,
  listType,
  mapType,
  NullType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  StringType,
  TimestampType,
  TypeType,
  typeParamType,
  typeTypeWithParam,
  UintType,
} from "../common/types/index.js";
import { typeToExprType } from "../common/types/types.js";
import {
  Bool as CheckedBool,
  Int as CheckedInt,
  String as CheckedString,
  functionType,
} from "./decls.js";
import { formatCELType, formatCheckedType } from "./format.js";

describe("checker/format", () => {
  it("checker/format_test.go/TestFormatType", () => {
    const tests = [
      AnyType,
      BoolType,
      BytesType,
      DoubleType,
      DurationType,
      DynType,
      ErrorType,
      IntType,
      listType(StringType),
      mapType(IntType, DynType),
      objectType("dev.cel.Expr"),
      optionalType(BoolType),
      nullableType(IntType),
      typeParamType("T"),
      typeTypeWithParam(listType(IntType)),
      NullType,
      StringType,
      TimestampType,
      TypeType,
      UintType,
    ] as const;
    for (const testCase of tests) {
      expect(formatCELType(testCase)).toBe(formatCheckedType(typeToExprType(testCase)));
    }
  });

  it("checker/format_test.go/TestFormatFunctionType", () => {
    const celType = formatCELType(opaqueType("function", BoolType, StringType, IntType));
    const checkedType = formatCheckedType(functionType(CheckedBool, CheckedString, CheckedInt));
    expect(celType).toBe(checkedType);
  });
});

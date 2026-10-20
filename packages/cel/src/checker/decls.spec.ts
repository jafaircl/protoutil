import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { Type_PrimitiveType, Type_WellKnownType } from "../gen/cel/expr/checked_pb.js";
import { ConstantSchema } from "../gen/cel/expr/syntax_pb.js";
import {
  Any,
  abstractType,
  Bool,
  Bytes,
  Error as CelError,
  String as CelString,
  constDecl,
  Double,
  Duration,
  Dyn,
  functionDecl,
  functionType,
  Int,
  identDecl,
  instanceOverload,
  listType,
  mapType,
  Null,
  objectType,
  optionalType,
  overloadDecl,
  parameterizedInstanceOverload,
  parameterizedOverload,
  primitiveType,
  Timestamp,
  typeParamType,
  typeType,
  Uint,
  varDecl,
  varDeclWithDoc,
  wellKnownType,
  wrapperType,
} from "./index.js";

describe("checker/decls", () => {
  it("constructs the shared singleton CEL types", () => {
    expect(CelError.typeKind.case).toBe("error");
    expect(Dyn.typeKind.case).toBe("dyn");
    expect(Bool.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.BOOL });
    expect(Bytes.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.BYTES });
    expect(Double.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.DOUBLE });
    expect(Int.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.INT64 });
    expect(Null.typeKind.case).toBe("null");
    expect(CelString.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.STRING });
    expect(Uint.typeKind).toEqual({ case: "primitive", value: Type_PrimitiveType.UINT64 });
    expect(Any.typeKind).toEqual({ case: "wellKnown", value: Type_WellKnownType.ANY });
    expect(Duration.typeKind).toEqual({ case: "wellKnown", value: Type_WellKnownType.DURATION });
    expect(Timestamp.typeKind).toEqual({
      case: "wellKnown",
      value: Type_WellKnownType.TIMESTAMP,
    });
  });

  it("creates abstract, optional, function, list, map, object, and type-param types", () => {
    expect(abstractType("vector", Int).typeKind.case).toBe("abstractType");
    expect(optionalType(CelString).typeKind).toEqual({
      case: "abstractType",
      value: {
        $typeName: "cel.expr.Type.AbstractType",
        name: "optional_type",
        parameterTypes: [CelString],
      },
    });
    expect(functionType(Bool, Int, CelString).typeKind.case).toBe("function");
    expect(listType(Int).typeKind.case).toBe("listType");
    expect(mapType(CelString, Int).typeKind.case).toBe("mapType");
    expect(objectType("google.type.Expr").typeKind).toEqual({
      case: "messageType",
      value: "google.type.Expr",
    });
    expect(typeParamType("T").typeKind).toEqual({ case: "typeParam", value: "T" });
  });

  it("creates primitive, type, well-known, and wrapper types", () => {
    expect(primitiveType(Type_PrimitiveType.BOOL).typeKind).toEqual({
      case: "primitive",
      value: Type_PrimitiveType.BOOL,
    });
    expect(typeType().typeKind.case).toBe("type");
    expect(typeType(Int).typeKind).toEqual({ case: "type", value: Int });
    expect(wellKnownType(Type_WellKnownType.ANY).typeKind).toEqual({
      case: "wellKnown",
      value: Type_WellKnownType.ANY,
    });
    expect(wrapperType(Int).typeKind).toEqual({
      case: "wrapper",
      value: Type_PrimitiveType.INT64,
    });
    expect(() => wrapperType(listType(Int))).toThrow("Wrapped type must be a primitive");
  });

  it("creates identifier and function declarations", () => {
    const constant = create(ConstantSchema, { constantKind: { case: "boolValue", value: true } });
    expect(identDecl("flag", Bool, constant).declKind.case).toBe("ident");
    expect(constDecl("flag", Bool, constant).declKind.case).toBe("ident");
    expect(varDecl("flag", Bool).declKind.case).toBe("ident");
    expect(varDeclWithDoc("flag", Bool, "flag doc").declKind).toEqual({
      case: "ident",
      value: {
        $typeName: "cel.expr.Decl.IdentDecl",
        type: Bool,
        value: undefined,
        doc: "flag doc",
      },
    });

    const overload = overloadDecl("id", [Int], Int);
    expect(functionDecl("id", overload).declKind.case).toBe("function");
  });

  it("creates overload declarations with the expected instance and type-parameter flags", () => {
    expect(overloadDecl("id", [Int], Int)).toMatchObject({
      overloadId: "id",
      isInstanceFunction: false,
      params: [Int],
      resultType: Int,
      typeParams: [],
    });
    expect(instanceOverload("inst", [CelString], Bool)).toMatchObject({
      overloadId: "inst",
      isInstanceFunction: true,
    });
    expect(parameterizedOverload("poly", [Dyn], Dyn, ["T"])).toMatchObject({
      typeParams: ["T"],
      isInstanceFunction: false,
    });
    expect(parameterizedInstanceOverload("poly_inst", [Dyn], Dyn, ["T"])).toMatchObject({
      typeParams: ["T"],
      isInstanceFunction: true,
    });
  });
});

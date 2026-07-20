import { describe, expect, it } from "vitest";
import * as checkerDecls from "../checker/decls.js";
import {
  constantDecl,
  excludeOverloads,
  type FunctionDecl,
  functionDecl,
  functionDeclToExprDecl,
  includeOverloads,
  maybeNoSuchOverload,
  memberOverload,
  overload,
  typeVariable,
  type VariableDecl,
  variableDecl,
  variableDeclToExprDecl,
  variableDeclWithDoc,
} from "./decls.js";
import { DocKind } from "./doc.js";
import * as operators from "./operators.js";
import * as commonOverloads from "./overloads.js";
import { syncedCases } from "./spec-helpers.js";
import {
  AnyType,
  attributeTrail,
  type Bool,
  BoolType,
  Bytes,
  String as CelString,
  ContainerType,
  DefaultTypeAdapter,
  DynType,
  err,
  IndexerType,
  Int,
  IntNegOne,
  IntType,
  IntZero,
  isError,
  isUnknown,
  listType,
  mapType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  SizerType,
  StringType,
  TimestampType,
  type Type,
  TypeType,
  typeParamType,
  typeTypeWithParam,
  UintType,
  unknown,
  type Val,
} from "./types/index.js";

type SyncedFunctionDeclToExprDeclRow = {
  fn: { $expr: string };
  exDecl: { $expr: string };
};

type SyncedFunctionDocumentationRow = {
  name: string;
  signatures: string[];
  examples: string[];
};

describe("common/decls/decls_test.go", () => {
  it("common/decls/decls_test.go/TestFunctionBindings", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T"))], IntType)],
    });
    expect(sizeFunc.bindings()).toHaveLength(0);

    const sizeFuncDef = functionDecl("size", {
      overloads: [
        memberOverload("list_size", [listType(typeParamType("T"))], IntType, {
          unaryBinding: (list) => (list as unknown as { size: () => Val }).size(),
        }),
      ],
    });
    const sizeMerged = sizeFunc.merge(sizeFuncDef);
    const bindings = sizeMerged.bindings();
    expect(bindings).toHaveLength(2);

    const empty = DefaultTypeAdapter.nativeToValue([] as string[]);
    const values = DefaultTypeAdapter.nativeToValue(["1", "2"]);
    for (const binding of bindings) {
      expect(binding.unary).toBeDefined();
      expect((binding.unary!(values) as Int).value()).toBe(2n);
      expect((binding.unary!(empty) as Int).value()).toBe(0n);
    }
  });

  it("common/decls/decls_test.go/TestFunctionVariableArgBindings", () => {
    const splitImpl = (value: string, delim: string, count: bigint): Val =>
      DefaultTypeAdapter.nativeToValue(
        value.split(delim).slice(0, count < 0n ? undefined : Number(count)),
      );
    const splitFunc = functionDecl("split", {
      overloads: [
        memberOverload("string_split", [StringType], listType(StringType), {
          unaryBinding: (str) => splitImpl((str as CelString).value(), "", -1n),
        }),
        memberOverload("string_split_string", [StringType, StringType], listType(StringType), {
          binaryBinding: (str, sep) =>
            splitImpl((str as CelString).value(), (sep as CelString).value(), -1n),
        }),
        memberOverload(
          "string_split_string_int",
          [StringType, StringType, IntType],
          listType(StringType),
          {
            functionBinding: (...args) =>
              splitImpl(
                (args[0] as CelString).value(),
                (args[1] as CelString).value(),
                (args[2] as Int).value(),
              ),
          },
        ),
      ],
    });
    const bindings = splitFunc.bindings();
    expect(bindings).toHaveLength(4);
    const input = new CelString("hi");
    const sep = new CelString("");
    const out = DefaultTypeAdapter.nativeToValue(["h", "i"]);
    for (const binding of bindings) {
      if (binding.unary) {
        expect((binding.unary(input).equal(out) as Bool).value()).toBe(true);
        expect(isError(binding.unary(new Bytes(new TextEncoder().encode("hi"))))).toBe(true);
      }
      if (binding.binary) {
        expect((binding.binary(input, sep).equal(out) as Bool).value()).toBe(true);
        expect(isError(binding.binary(new Bytes(new TextEncoder().encode("hi")), sep))).toBe(true);
        expect(
          isUnknown(
            binding.binary(
              new Bytes(new TextEncoder().encode("hi")),
              unknown(1, attributeTrail("x")),
            ),
          ),
        ).toBe(true);
      }
      if (binding.func) {
        expect((binding.func(input, sep, IntNegOne).equal(out) as Bool).value()).toBe(true);
      }
    }
  });

  it("common/decls/decls_test.go/TestFunctionZeroArityBinding", () => {
    const now = DefaultTypeAdapter.nativeToValue(new Date(1000));
    const nowFunc = functionDecl("now", {
      overloads: [
        overload("now", [], TimestampType, {
          functionBinding: (..._args: Val[]) => now,
        }),
      ],
    });
    for (const decl of nowFunc.overloadDecls()) {
      expect(decl.hasBinding()).toBe(true);
    }
    const bindings = nowFunc.bindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.func!()).toBe(now);
  });

  it("common/decls/decls_test.go/TestFunctionSingletonBinding", () => {
    const size = functionDecl("size", {
      disableTypeGuards: true,
      overloads: [
        overload("size_map", [mapType(typeParamType("K"), typeParamType("V"))], IntType),
        overload("size_list", [listType(typeParamType("V"))], IntType),
        overload("size_string", [StringType], IntType),
        memberOverload("map_size", [mapType(typeParamType("K"), typeParamType("V"))], IntType),
        memberOverload("list_size", [listType(typeParamType("V"))], IntType),
        memberOverload("string_size", [StringType], IntType),
      ],
      singletonBinding: {
        unary: (arg) => (arg as unknown as { size: () => Val }).size(),
        trait: SizerType,
      },
    });
    expect(size.hasSingletonBinding()).toBe(true);
    const bindings = size.bindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.unary).toBeDefined();
    expect((bindings[0]!.unary!(new CelString("hello")) as Int).value()).toBe(5n);
    expect((bindings[0]!.unary!(new Bytes(new TextEncoder().encode("hello"))) as Int).value()).toBe(
      5n,
    );
  });

  it("common/decls/decls_test.go/TestVariableDocumentation", () => {
    const variable = variableDeclWithDoc("var", StringType, "string variable");
    const doc = variable.documentation();
    expect(doc.description).toBe(variable.description());
    expect(doc.name).toBe(variable.name());
    expect(doc.type).toBe("string");
  });

  for (const row of syncedCases<SyncedFunctionDocumentationRow>(
    "common/decls/decls_test.go/TestFunctionDocumentation",
  )) {
    it(`common/decls/decls_test.go/TestFunctionDocumentation/${row.name}`, () => {
      const fn = functionDocumentationCase(row.name);
      const doc = fn.documentation();
      expect(doc.kind).toBe(DocKind.Function);
      expect(doc.description).toBe(fn.description());
      expect(doc.children).toHaveLength(fn.overloadDecls().length);
      for (const child of doc.children) {
        expect(row.signatures).toContain(child.signature);
        for (const example of child.children) {
          expect(row.examples.some((entry) => example.description.includes(entry))).toBe(true);
        }
      }
    });
  }

  it("common/decls/decls_test.go/TestFunctionMerge", () => {
    const sizeFunc = functionDecl("size", {
      doc: "compute the number of entries in a list or map",
      overloads: [
        memberOverload("list_size", [listType(typeParamType("T"))], IntType),
        memberOverload("map_size", [mapType(typeParamType("K"), typeParamType("V"))], IntType),
      ],
    });
    expect(sizeFunc.merge(sizeFunc)).toBe(sizeFunc);

    const sizeVecFunc = functionDecl("size", {
      overloads: [
        memberOverload("vector_size", [opaqueType("vector", typeParamType("T"))], IntType),
      ],
      singletonBinding: {
        unary: (value) => (value as unknown as { size: () => Val }).size(),
        trait: SizerType,
      },
    });
    const merged = sizeFunc.merge(sizeVecFunc);
    expect(merged.name()).toBe("size");
    expect(merged.overloadDecls()).toHaveLength(3);
    expect(merged.description()).toBe("compute the number of entries in a list or map");
  });

  it("common/decls/decls_test.go/TestFunctionMergeWrongName", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T"))], IntType)],
    });
    const sizeVecFunc = functionDecl("sizeN", {
      overloads: [
        memberOverload("vector_size", [opaqueType("vector", typeParamType("T"))], IntType),
      ],
    });
    expect(() => sizeFunc.merge(sizeVecFunc)).toThrow(/unrelated functions/);
  });

  it("common/decls/decls_test.go/TestFunctionMergeOverloadCollision", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T"))], IntType)],
    });
    const sizeVecFunc = functionDecl("size", {
      overloads: [memberOverload("list_size2", [listType(typeParamType("K"))], IntType)],
    });
    expect(() => sizeFunc.merge(sizeVecFunc)).toThrow(/declaration merge failed/);
  });

  it("common/decls/decls_test.go/TestFunctionMergeOverloadArgCountRedefinition", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T"))], IntType)],
    });
    const sizeVecFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T")), IntType], IntType)],
    });
    expect(() => sizeFunc.merge(sizeVecFunc)).toThrow(/redefinition/);
  });

  it("common/decls/decls_test.go/TestFunctionMergeOverloadArgTypeRedefinition", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("arg_size", [listType(typeParamType("T"))], IntType)],
    });
    const sizeVecFunc = functionDecl("size", {
      overloads: [memberOverload("arg_size", [mapType(IntType, StringType)], IntType)],
    });
    expect(() => sizeFunc.merge(sizeVecFunc)).toThrow(/redefinition/);
  });

  it("common/decls/decls_test.go/TestFunctionMergeSingletonRedefinition", () => {
    const sizeFunc = functionDecl("size", {
      overloads: [memberOverload("list_size", [listType(typeParamType("T"))], IntType)],
      singletonBinding: { unary: () => IntZero },
    });
    const sizeVecFunc = functionDecl("size", {
      overloads: [memberOverload("string_size", [StringType], IntType)],
      singletonBinding: { unary: () => IntZero },
    });
    expect(() => sizeFunc.merge(sizeVecFunc)).toThrow(/already has a singleton/);
  });

  it("common/decls/decls_test.go/TestFunctionAddDuplicateOverloads", () => {
    expect(() =>
      functionDecl("max", {
        overloads: [
          overload("max_int", [IntType], IntType),
          overload("max_int", [IntType], IntType),
        ],
      }),
    ).not.toThrow();
  });

  it("common/decls/decls_test.go/TestFunctionAddDuplicateOverloadsPreservesBinding", () => {
    const fn = functionDecl("max", {
      overloads: [
        overload("max_int", [IntType], IntType),
        overload("max_int", [IntType], IntType, {
          unaryBinding: (value) => value,
        }),
        overload("max_int", [IntType], IntType),
      ],
    });
    expect(fn.overloadDecls()).toHaveLength(1);
    const bindings = fn.bindings();
    expect(bindings.some((binding) => binding.operator === "max_int" && binding.unary)).toBe(true);
  });

  it("common/decls/decls_test.go/TestFunctionAddCollidingOverloads", () => {
    expect(() =>
      functionDecl("max", {
        overloads: [
          overload("max_int", [IntType], IntType),
          overload("max_int2", [IntType], IntType),
        ],
      }),
    ).toThrow(/max_int collides with max_int2/);
  });

  it("common/decls/decls_test.go/TestFunctionNoOverloads", () => {
    expect(() =>
      functionDecl("right", {
        singletonBinding: { binary: (_arg1, arg2) => arg2 },
      }),
    ).toThrow(/must have at least one overload/);
  });

  it("common/decls/decls_test.go/TestSingletonOverloadCollision", () => {
    const fn = functionDecl("id", {
      overloads: [
        overload("id_any", [AnyType], AnyType, {
          unaryBinding: (arg) => arg,
        }),
      ],
      singletonBinding: { unary: (arg) => arg },
    });
    expect(() => fn.bindings()).toThrow(/incompatible with specialized overloads/);
  });

  it("common/decls/decls_test.go/TestSingletonOverloadLateBindingCollision", () => {
    const fn = functionDecl("id", {
      overloads: [overload("id_any", [AnyType], AnyType, { lateBinding: true })],
      singletonBinding: { unary: (arg) => arg },
    });
    expect(() => fn.bindings()).toThrow(/incompatible with late bindings/);
  });

  it("common/decls/decls_test.go/TestSingletonUnaryBindingRedefinition", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [overload("id_any", [AnyType], AnyType)],
        singletonBinding: {
          unary: (arg) => arg,
          binary: (_left, _right) => AnyType as unknown as Val,
        },
      }),
    ).toThrow(/must define exactly one implementation/);
  });

  it("common/decls/decls_test.go/TestSingletonBinaryBindingRedefinition", () => {
    expect(() =>
      functionDecl("right", {
        overloads: [overload("right_double_double", [IntType, IntType], IntType)],
        singletonBinding: {
          binary: (_arg1, arg2) => arg2,
          unary: (arg) => arg,
          trait: SizerType,
        },
      }),
    ).toThrow(/must define exactly one implementation/);
  });

  it("common/decls/decls_test.go/TestSingletonFunctionBindingRedefinition", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [overload("id_any", [AnyType], AnyType)],
        singletonBinding: {
          func: (...args) => args[0]!,
          unary: (arg) => arg,
          trait: SizerType,
        },
      }),
    ).toThrow(/must define exactly one implementation/);
  });

  it("common/decls/decls_test.go/TestOverloadUnaryBindingRedefinition", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_any", [AnyType], AnyType, {
            unaryBinding: (arg) => arg,
            functionBinding: (...args) => args[0]!,
          }),
        ],
      }),
    ).toThrow(/already has a binding/);
  });

  it("common/decls/decls_test.go/TestOverloadUnaryBindingArgCountMismatch", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_any", [], AnyType, {
            unaryBinding: (arg) => arg,
          }),
        ],
      }),
    ).toThrow(/non-unary overload/);
  });

  it("common/decls/decls_test.go/TestOverloadBinaryBindingArgCountMismatch", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_any", [], AnyType, {
            binaryBinding: (lhs) => lhs,
          }),
        ],
      }),
    ).toThrow(/non-binary overload/);
  });

  it("common/decls/decls_test.go/TestOverloadBinaryBindingRedefinition", () => {
    expect(() =>
      functionDecl("right", {
        overloads: [
          overload("right_double_double", [IntType, IntType], IntType, {
            binaryBinding: (_arg1, arg2) => arg2,
            functionBinding: (...args) => args[1]!,
          }),
        ],
      }),
    ).toThrow(/already has a binding/);
  });

  it("common/decls/decls_test.go/TestOverloadFunctionBindingRedefinition", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_any", [AnyType], AnyType, {
            functionBinding: (...args) => args[0]!,
            unaryBinding: (arg) => arg,
          }),
        ],
      }),
    ).toThrow(/already has a binding/);
  });

  it("common/decls/decls_test.go/TestOverloadFunctionLateBinding", () => {
    const fn = functionDecl("id", {
      overloads: [
        overload("id_bool", [BoolType], AnyType, {
          lateBinding: true,
        }),
      ],
    });
    expect(fn.overloadDecls()).toHaveLength(1);
    expect(fn.overloadDecls()[0]!.hasLateBinding()).toBe(true);
  });

  it("common/decls/decls_test.go/TestOverloadFunctionMixLateAndNonLateBinding", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_bool", [BoolType], AnyType, { lateBinding: true }),
          overload("id_int", [IntType], AnyType),
        ],
      }),
    ).toThrow(/cannot mix late and non-late bindings/);
  });

  it("common/decls/decls_test.go/TestOverloadFunctionBindingWithLateBinding", () => {
    const overloadDecl = overload("id_bool", [BoolType], AnyType, {
      functionBinding: (...args) => args[0]!,
    });
    expect(() =>
      (overloadDecl as unknown as { setLateBinding: () => void }).setLateBinding(),
    ).toThrow(/already has a binding/);
  });

  it("common/decls/decls_test.go/TestOverloadFunctionLateBindingWithBinding", () => {
    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_bool", [BoolType], AnyType, {
            lateBinding: true,
            functionBinding: (...args) => args[0]!,
          }),
        ],
      }),
    ).toThrow(/already has a late binding/);

    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_bool", [BoolType], AnyType, {
            lateBinding: true,
            unaryBinding: (arg) => arg,
          }),
        ],
      }),
    ).toThrow(/already has a late binding/);

    expect(() =>
      functionDecl("id", {
        overloads: [
          overload("id_bool", [BoolType, BoolType], AnyType, {
            lateBinding: true,
            binaryBinding: (arg1) => arg1,
          }),
        ],
      }),
    ).toThrow(/already has a late binding/);
  });

  it("common/decls/decls_test.go/TestOverloadIsNonStrict", () => {
    const fn = functionDecl("getOrDefault", {
      overloads: [
        memberOverload(
          "get",
          [mapType(typeParamType("K"), typeParamType("V")), typeParamType("K"), typeParamType("V")],
          typeParamType("V"),
          {
            operandTrait: ContainerType | IndexerType,
            nonStrict: true,
            functionBinding: (...args) => {
              const container = args[0] as unknown as {
                contains: (key: Val) => Val;
                get: (key: Val) => Val;
              };
              const key = args[1]!;
              const orValue = args[2]!;
              if (isUnknown(key) || isError(key)) {
                return orValue;
              }
              if ((container.contains(key) as Bool).value()) {
                return container.get(key);
              }
              return orValue;
            },
          },
        ),
      ],
    });
    const binding = fn.bindings()[0]!;
    const map = DefaultTypeAdapter.nativeToValue({ hello: "world" });
    expect(
      (binding.func!(map, new CelString("hello"), new CelString("goodbye")) as CelString).value(),
    ).toBe("world");
    expect(
      (binding.func!(map, new CelString("missing"), new CelString("goodbye")) as CelString).value(),
    ).toBe("goodbye");
    expect(
      (binding.func!(map, err("no such key"), new CelString("goodbye")) as CelString).value(),
    ).toBe("goodbye");
  });

  it("common/decls/decls_test.go/TestOverloadOperandTrait", () => {
    const fn = functionDecl("getOrDefault", {
      overloads: [
        memberOverload(
          "get",
          [mapType(typeParamType("K"), typeParamType("V")), typeParamType("K"), typeParamType("V")],
          typeParamType("V"),
          {
            operandTrait: ContainerType | IndexerType,
            functionBinding: (...args) => {
              const container = args[0] as unknown as {
                contains: (key: Val) => Val;
                get: (key: Val) => Val;
              };
              const key = args[1]!;
              const orValue = args[2]!;
              if ((container.contains(key) as Bool).value()) {
                return container.get(key);
              }
              return orValue;
            },
          },
        ),
      ],
    });
    const binding = fn.bindings()[0]!;
    const map = DefaultTypeAdapter.nativeToValue({ hello: "world" });
    expect(
      (binding.func!(map, new CelString("hello"), new CelString("goodbye")) as CelString).value(),
    ).toBe("world");
    expect(
      (binding.func!(map, new CelString("missing"), new CelString("goodbye")) as CelString).value(),
    ).toBe("goodbye");
    const noSuchKey = err("no such key");
    expect(binding.func!(map, noSuchKey, new CelString("goodbye"))).toBe(noSuchKey);
  });

  it("common/decls/decls_test.go/TestFunctionGetTypeParams", () => {
    const fn = functionDecl("deep_type_params", {
      overloads: [
        overload("no_type_params", [], DynType),
        overload("one_type_param", [BoolType], typeParamType("K")),
        overload(
          "deep_type_params",
          [typeParamType("E1"), mapType(typeParamType("K"), typeParamType("V"))],
          typeParamType("V"),
        ),
      ],
    });
    expect(fn.overloadDecls()).toHaveLength(3);
    expect(fn.overloadDecls()[0]!.typeParams()).toEqual([]);
    expect(fn.overloadDecls()[1]!.typeParams()).toEqual(["K"]);
    expect(fn.overloadDecls()[2]!.typeParams().sort()).toEqual(["E1", "K", "V"]);
  });

  it("common/decls/decls_test.go/TestFunctionDisableDeclaration", () => {
    const fn = functionDecl("in", {
      disableDeclaration: true,
      overloads: [
        overload("in_list", [listType(typeParamType("K")), typeParamType("K")], BoolType),
      ],
    });
    expect(fn.isDeclarationDisabled()).toBe(true);
  });

  it("common/decls/decls_test.go/TestFunctionEnableDeclaration", () => {
    const fn = functionDecl("in", {
      disableDeclaration: false,
      overloads: [
        overload("in_list", [listType(typeParamType("K")), typeParamType("K")], BoolType),
      ],
    });
    expect(fn.isDeclarationDisabled()).toBe(false);
    const fn2 = functionDecl("in", {
      disableDeclaration: true,
      overloads: [
        overload("in_list", [listType(typeParamType("K")), typeParamType("K")], BoolType),
      ],
    });
    expect(fn2.isDeclarationDisabled()).toBe(true);
    expect(fn.merge(fn2).isDeclarationDisabled()).toBe(true);
    expect(fn2.merge(fn).isDeclarationDisabled()).toBe(false);
  });

  it("common/decls/decls_test.go/TestFunctionDeclIncludeOverloads", () => {
    const fn = functionDecl("equals", {
      overloads: [
        overload("int_equals_uint", [IntType, UintType], BoolType),
        overload("uint_equals_int", [UintType, IntType], BoolType),
      ],
    });
    const subset = fn.subset(includeOverloads("int_equals_uint"));
    expect(subset?.overloadDecls().map((entry) => entry.id())).toEqual(["int_equals_uint"]);
  });

  it("common/decls/decls_test.go/TestFunctionDeclExcludeOverloads", () => {
    const fn = functionDecl("equals", {
      overloads: [
        overload("int_equals_uint", [IntType, UintType], BoolType),
        overload("uint_equals_int", [UintType, IntType], BoolType),
      ],
    });
    const subset = fn.subset(excludeOverloads("int_equals_uint"));
    expect(subset?.overloadDecls().map((entry) => entry.id())).toEqual(["uint_equals_int"]);
  });

  for (const [index, row] of syncedCases<SyncedFunctionDeclToExprDeclRow>(
    "common/decls/decls_test.go/TestFunctionDeclToExprDecl",
  ).entries()) {
    it(`common/decls/decls_test.go/TestFunctionDeclToExprDecl#${index + 1}`, () => {
      void row;
      expect(functionDeclToExprDecl(functionDeclToExprDeclCase(index))).toEqual(
        functionDeclToExprDeclExpected(index),
      );
    });
  }

  it("common/decls/decls_test.go/TestNewVariable", () => {
    const a = variableDecl("a", BoolType);
    expect(a.declarationIsEquivalent(a)).toBe(true);
    expect(a.declarationIsEquivalent(variableDecl("a", BoolType))).toBe(true);
    expect(a.declarationIsEquivalent(variableDecl("a", IntType))).toBe(false);
  });

  it("common/decls/decls_test.go/TestNewConstant", () => {
    const a = constantDecl("a", IntType, new Int(42n));
    expect(a.declarationIsEquivalent(a)).toBe(true);
    expect(a.declarationIsEquivalent(variableDecl("a", IntType))).toBe(true);
  });

  it("common/decls/decls_test.go/TestTypeVariable", () => {
    const cases: Array<[Type, VariableDecl]> = [
      [AnyType, variableDecl("google.protobuf.Any", typeTypeWithParam(AnyType))],
      [DynType, variableDecl("dyn", typeTypeWithParam(DynType))],
      [
        objectType("google.protobuf.Int32Value"),
        variableDecl("int", typeTypeWithParam(nullableType(IntType))),
      ],
      [
        objectType("google.protobuf.Int32Value"),
        variableDecl("int", typeTypeWithParam(nullableType(IntType))),
      ],
    ];
    for (const [type, expected] of cases) {
      expect(typeVariable(type).declarationIsEquivalent(expected)).toBe(true);
    }
  });

  it("common/decls/decls_test.go/TestVariableDeclToExprDecl", () => {
    expect(variableDeclToExprDecl(variableDecl("a", BoolType))).toEqual(
      checkerDecls.varDecl("a", checkerDecls.Bool),
    );
    expect(variableDeclToExprDecl(variableDeclWithDoc("a", BoolType, "doc"))).toEqual(
      checkerDecls.varDeclWithDoc("a", checkerDecls.Bool, "doc"),
    );
  });

  it("common/decls/decls_test.go/TestVariableDeclToExprDeclInvalid", () => {
    expect(() => variableDeclToExprDecl(variableDecl("bad", {} as Type))).toThrow();
  });

  it("common/decls/decls_test.go/TestMaybeNoSuchOverload", () => {
    expect(maybeNoSuchOverload("split", new Bytes(new Uint8Array([1])))).toBeDefined();
    expect(isError(maybeNoSuchOverload("split", new Bytes(new Uint8Array([1]))))).toBe(true);
    const unk = unknown(1, attributeTrail("x"));
    expect(maybeNoSuchOverload("split", unk)).toBe(unk);
  });

  it.todo(
    "common/decls/decls_test.go/TestNilFunction blocked: TypeScript cannot represent Go nil-receiver method dispatch on undefined class instances",
  );

  it.todo(
    "common/decls/decls_test.go/TestNilVariable blocked: TypeScript cannot represent Go nil-receiver method dispatch on undefined class instances",
  );
});

function functionDocumentationCase(name: string): FunctionDecl {
  switch (name) {
    case "function":
      return functionDecl("size", {
        doc: "compute the number of entries in a list or map",
        overloads: [
          memberOverload("list_size", [listType(typeParamType("T"))], IntType, {
            doc: ["[].size() // 0", "[1, 2, 3].size() // 3"],
          }),
          overload("size_list", [listType(typeParamType("T"))], IntType, {
            doc: ["size([]) // 0", "size([1, 2, 3]) // 3"],
          }),
        ],
      });
    case "type":
      return functionDecl(commonOverloads.TypeConvertType, {
        overloads: [
          overload(
            commonOverloads.TypeConvertType,
            [typeTypeWithParam(typeParamType("T"))],
            TypeType,
            {
              doc: ["type(int) // type"],
            },
          ),
        ],
      });
    case "unary operator":
      return functionDecl(operators.Negate, {
        doc: "negate a numeric value",
        overloads: [
          overload(commonOverloads.NegateInt64, [IntType], IntType, {
            doc: ["-(1) // -1"],
          }),
        ],
      });
    case "binary operator":
      return functionDecl(operators.Add, {
        doc: "add two numeric values",
        overloads: [
          overload(commonOverloads.AddInt64, [IntType, IntType], IntType, {
            doc: ["1 + 2 // 3"],
          }),
        ],
      });
    case "index operator":
      return functionDecl(operators.Index, {
        doc: "access a list by numeric index, zero-based",
        overloads: [
          overload(
            commonOverloads.IndexList,
            [listType(typeParamType("T")), IntType],
            typeParamType("T"),
            {
              doc: ["[1, 2, 3, 4][2] // 3"],
            },
          ),
        ],
      });
    case "conditional":
      return functionDecl(operators.Conditional, {
        doc: "ternary operator",
        overloads: [
          overload(
            commonOverloads.Conditional,
            [BoolType, typeParamType("T"), typeParamType("T")],
            typeParamType("T"),
            {
              doc: ["true ? 1 : 2 // 1"],
            },
          ),
        ],
      });
    default:
      throw new Error(`unsupported documentation case: ${name}`);
  }
}

function functionDeclToExprDeclCase(index: number): FunctionDecl {
  switch (index) {
    case 0:
      return functionDecl("equals", {
        overloads: [
          overload("equals_value_value", [typeParamType("T"), typeParamType("T")], BoolType),
        ],
      });
    case 1:
      return functionDecl("equals", {
        overloads: [
          memberOverload("value_equals_value", [typeParamType("T"), typeParamType("T")], BoolType),
        ],
      });
    case 2:
      return functionDecl("equals", {
        overloads: [overload("equals_int_uint", [IntType, UintType], BoolType)],
      });
    case 3:
      return functionDecl("equals", {
        overloads: [memberOverload("int_equals_uint", [IntType, UintType], BoolType)],
      });
    case 4:
      return functionDecl("equals", {
        overloads: [
          memberOverload(
            "list_optional_value_equals_list_optional_value",
            [
              listType(optionalType(typeParamType("T"))),
              listType(optionalType(typeParamType("T"))),
            ],
            BoolType,
          ),
        ],
      });
    case 5:
      return functionDecl("equals", {
        overloads: [
          memberOverload("int_equals_uint", [IntType, UintType], BoolType),
          memberOverload("uint_equals_int", [UintType, IntType], BoolType),
        ],
      });
    case 6: {
      const left = functionDecl("equals", {
        doc: "test equality between an int and uint only",
        overloads: [
          overload("int_equals_uint", [IntType, UintType], BoolType, {
            doc: ["1 == 1u // true"],
          }),
          overload("uint_equals_int", [UintType, IntType], BoolType, {
            doc: ["1u == -1 // false"],
          }),
        ],
      });
      const right = functionDecl("equals", {
        doc: "test equality between two int-like values",
        overloads: [
          overload("int_equals_int", [IntType, IntType], BoolType, {
            doc: ["1 == 1 // true", "1 == 2 // false"],
          }),
          overload("int_equals_uint", [IntType, UintType], BoolType),
          overload("uint_equals_uint", [UintType, UintType], BoolType, {
            doc: ["1u == 1u // true"],
          }),
        ],
      });
      return left.merge(right);
    }
    default:
      throw new Error(`unsupported FunctionDeclToExprDecl case index: ${index}`);
  }
}

function functionDeclToExprDeclExpected(index: number) {
  switch (index) {
    case 0:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.parameterizedOverload(
          "equals_value_value",
          [checkerDecls.typeParamType("T"), checkerDecls.typeParamType("T")],
          checkerDecls.Bool,
          ["T"],
        ),
      );
    case 1:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.parameterizedInstanceOverload(
          "value_equals_value",
          [checkerDecls.typeParamType("T"), checkerDecls.typeParamType("T")],
          checkerDecls.Bool,
          ["T"],
        ),
      );
    case 2:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.overloadDecl(
          "equals_int_uint",
          [checkerDecls.Int, checkerDecls.Uint],
          checkerDecls.Bool,
        ),
      );
    case 3:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.instanceOverload(
          "int_equals_uint",
          [checkerDecls.Int, checkerDecls.Uint],
          checkerDecls.Bool,
        ),
      );
    case 4:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.parameterizedInstanceOverload(
          "list_optional_value_equals_list_optional_value",
          [
            checkerDecls.listType(checkerDecls.optionalType(checkerDecls.typeParamType("T"))),
            checkerDecls.listType(checkerDecls.optionalType(checkerDecls.typeParamType("T"))),
          ],
          checkerDecls.Bool,
          ["T"],
        ),
      );
    case 5:
      return checkerDecls.functionDecl(
        "equals",
        checkerDecls.instanceOverload(
          "int_equals_uint",
          [checkerDecls.Int, checkerDecls.Uint],
          checkerDecls.Bool,
        ),
        checkerDecls.instanceOverload(
          "uint_equals_int",
          [checkerDecls.Uint, checkerDecls.Int],
          checkerDecls.Bool,
        ),
      );
    case 6:
      return checkerDecls.functionDeclWithDoc(
        "equals",
        "test equality between an int and uint only",
        Object.assign(
          checkerDecls.overloadDecl(
            "int_equals_uint",
            [checkerDecls.Int, checkerDecls.Uint],
            checkerDecls.Bool,
          ),
          { doc: "1 == 1u // true" },
        ),
        Object.assign(
          checkerDecls.overloadDecl(
            "uint_equals_int",
            [checkerDecls.Uint, checkerDecls.Int],
            checkerDecls.Bool,
          ),
          { doc: "1u == -1 // false" },
        ),
        Object.assign(
          checkerDecls.overloadDecl(
            "int_equals_int",
            [checkerDecls.Int, checkerDecls.Int],
            checkerDecls.Bool,
          ),
          { doc: "1 == 1 // true\n1 == 2 // false" },
        ),
        Object.assign(
          checkerDecls.overloadDecl(
            "uint_equals_uint",
            [checkerDecls.Uint, checkerDecls.Uint],
            checkerDecls.Bool,
          ),
          { doc: "1u == 1u // true" },
        ),
      );
    default:
      throw new Error(`unsupported FunctionDeclToExprDecl expected case index: ${index}`);
  }
}

import { describe, expect, it } from "vitest";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import { syncedCases } from "../common/spec-helpers.js";
import { resolveSyncedDecl, resolveSyncedVal } from "../common/types/spec-helpers.js";
import type { Decl } from "../gen/cel/expr/checked_pb.js";
import {
  AnyType,
  BoolType,
  DoubleType,
  DynType,
  declarationFromProto,
  Err,
  env,
  excludeOverloads,
  FunctionDecl,
  func,
  Int,
  IntType,
  includeOverloads,
  listType,
  maybeNoSuchOverload,
  memberOverload,
  opaqueType,
  overload,
  StringType,
  standardFunctions,
  True,
  typeParamType,
  typeToExprType,
  UintType,
  unknown,
  type Val,
  VariableDecl,
  variable,
} from "../index.js";

describe("cel/decls_test.go/TestFunctionMerge", () => {
  it("merges overload extensions while preserving singleton behavior", () => {
    const parameter = typeParamType("V");
    const vectorType = opaqueType("vector", parameter);
    const size = func("size", {
      overloads: [
        overload("size_list", [listType(parameter)], IntType),
        overload("size_string", [StringType], IntType),
        memberOverload("list_size", [listType(parameter)], IntType),
        memberOverload("string_size", [StringType], IntType),
      ],
      singletonBinding: {
        unary: (argument) =>
          (
            argument as unknown as {
              size(): Val;
            }
          ).size(),
      },
    });
    const sizeExtension = func("size", {
      overloads: [
        overload("size_vector", [vectorType], IntType),
        memberOverload("vector_size", [vectorType], IntType),
      ],
    });
    const vector = func("vector", {
      overloads: [
        overload("vector_list", [listType(parameter)], vectorType, {
          unaryBinding: (list) => list,
        }),
      ],
    });
    const equals = func(operators.Equals, {
      overloads: [
        overload(overloads.Equals, [typeParamType("T"), typeParamType("T")], BoolType, {
          binaryBinding: (left, right) => left.equal(right),
        }),
      ],
    });
    const celEnv = env({
      functions: [size, sizeExtension, vector, equals],
      standardLibrary: false,
    });
    const expression = `[
      [0].size() == 1,
      'hello'.size() == 5,
      vector([1.2, 2.3, 3.4]).size() == 3
    ]`;

    const result = celEnv.program(celEnv.compile(expression)).eval({}).value() as Val[];
    expect(result.map((value) => value.value())).toEqual([true, true, true]);

    const incompatibleSingleton = func("size", {
      overloads: [
        overload("size_vector", [vectorType], IntType),
        memberOverload("vector_size", [vectorType], IntType),
      ],
      singletonBinding: {
        binary: () => new Int(0n),
      },
    });
    expect(() =>
      env({
        functions: [size, incompatibleSingleton],
        standardLibrary: false,
      }),
    ).toThrow(/already has a singleton binding/);

    const specialized = func("size", {
      overloads: [
        overload("size_int", [IntType], IntType, {
          unaryBinding: () => new Int(2n),
        }),
      ],
    });
    const specializedEnv = env({
      functions: [size, specialized],
      standardLibrary: false,
    });
    expect(() => specializedEnv.program(celEnv.compile(expression))).toThrow(
      /incompatible with specialized overloads/,
    );
  });
});

describe("cel/decls_test.go/TestSingletonFunctionBinding", () => {
  it("dispatches every synced call through a singleton variadic binding", () => {
    const cases = syncedCases<{
      expr: string;
      out: unknown;
    }>("cel/decls_test.go/TestSingletonFunctionBinding");
    const dynamic = func("dyn", {
      overloads: [overload("dyn", [DynType], DynType)],
      singletonBinding: {
        unary: (argument) => argument,
      },
    });
    const max = func("max", {
      overloads: [
        overload("max_int", [IntType], IntType),
        overload("max_int_int", [IntType, IntType], IntType),
        overload("max_int_int_int", [IntType, IntType, IntType], IntType),
      ],
      singletonBinding: {
        func: (...argumentsValue) => {
          let maximum = new Int(-9223372036854775808n);
          for (const argument of argumentsValue) {
            if (!(argument instanceof Int)) {
              // Singleton implementations perform their own runtime overload validation.
              return maybeNoSuchOverload("max", ...argumentsValue);
            }
            if (argument.value() > maximum.value()) {
              maximum = argument;
            }
          }
          return maximum;
        },
      },
    });
    const celEnv = env({
      functions: [dynamic, max],
      standardLibrary: false,
      variables: [variable("unk", DynType), variable("err", DynType)],
    });

    for (const testCase of cases) {
      const result = celEnv
        .program(celEnv.parse(testCase.expr))
        .eval({ err: new Err("error argument"), unk: unknown(42) });
      const expected = resolveSyncedVal(testCase.out);
      if (expected instanceof Err) {
        expect(result).toBeInstanceOf(Err);
        expect((result as Err).message, testCase.expr).toBe(expected.message);
      } else if (expected.type().typeName() === "unknown") {
        expect(result.type().typeName(), testCase.expr).toBe("unknown");
      } else {
        expect(result.value(), testCase.expr).toEqual(expected.value());
      }
    }
  });
});

describe("cel/decls_test.go/TestFunctionBinding", () => {
  it("dispatches every synced call through guarded overload bindings", () => {
    const cases = syncedCases<{
      expr: string;
      out: unknown;
    }>("cel/decls_test.go/TestFunctionBinding");
    const dynamic = func("dyn", {
      overloads: [
        overload("dyn", [DynType], DynType, {
          unaryBinding: (argument) => argument,
        }),
      ],
    });
    const max = func("max", {
      overloads: [
        overload("max_int", [IntType], IntType, {
          unaryBinding: (argument) => argument,
        }),
        overload("max_int_int", [IntType, IntType], IntType, {
          binaryBinding: (left, right) =>
            (left as Int).value() < (right as Int).value() ? right : left,
        }),
        overload("max_int_int_int", [IntType, IntType, IntType], IntType, {
          functionBinding: (...argumentsValue) => {
            let maximum = new Int(-9223372036854775808n);
            for (const argument of argumentsValue as Int[]) {
              if (argument.value() > maximum.value()) {
                maximum = argument;
              }
            }
            return maximum;
          },
        }),
      ],
    });
    const celEnv = env({
      functions: [dynamic, max],
      standardLibrary: false,
      variables: [variable("unk", DynType), variable("err", DynType)],
    });

    for (const testCase of cases) {
      const result = celEnv
        .program(celEnv.parse(testCase.expr))
        .eval({ err: new Err("error argument"), unk: unknown(42) });
      const expected = resolveSyncedVal(testCase.out);
      if (expected instanceof Err) {
        expect(result).toBeInstanceOf(Err);
        expect((result as Err).message, testCase.expr).toBe(expected.message);
      } else if (expected.type().typeName() === "unknown") {
        expect(result.type().typeName(), testCase.expr).toBe("unknown");
      } else {
        expect(result.value(), testCase.expr).toEqual(expected.value());
      }
    }
  });
});

describe("cel/decls_test.go/TestSingletonUnaryBinding", () => {
  it("merges a singleton unary definition with an earlier declaration", () => {
    const declaration = func("id", {
      overloads: [overload("id_any", [AnyType], AnyType)],
    });
    const definition = func("id", {
      overloads: [overload("id_any", [AnyType], AnyType)],
      singletonBinding: {
        unary: (argument) => argument,
      },
    });
    const celEnv = env({
      functions: [declaration, definition],
      standardLibrary: false,
      variables: [variable("x", AnyType)],
    });

    expect(celEnv.program(celEnv.parse("id(x)")).eval({ x: "hello" }).value()).toBe("hello");
  });
});

describe("cel/decls_test.go/TestSingletonUnaryBindingParameterized", () => {
  it("dispatches a merged singleton across parameterized list overloads", () => {
    const declaration = func("isSorted", {
      overloads: [memberOverload("list_int_is_sorted", [listType(IntType)], BoolType)],
    });
    const definition = func("isSorted", {
      overloads: [memberOverload("list_uint_is_sorted", [listType(UintType)], BoolType)],
      singletonBinding: {
        unary: () => True,
      },
    });
    const celEnv = env({
      functions: [declaration, definition],
      standardLibrary: false,
      variables: [variable("x", AnyType)],
    });

    expect(
      celEnv
        .program(celEnv.parse("x.isSorted()"))
        .eval({ x: [1, 2, 3] })
        .value(),
    ).toBe(true);
  });
});

describe("cel/decls_test.go/TestSingletonBinaryBinding", () => {
  it("accepts a singleton binary implementation for binary overloads", () => {
    expect(() =>
      func("right", {
        overloads: [
          overload("right_int_int", [IntType, IntType], IntType),
          overload("right_double_double", [DoubleType, DoubleType], DoubleType),
          overload("right_string_string", [StringType, StringType], StringType),
        ],
        singletonBinding: {
          binary: (_left, right) => right,
        },
      }),
    ).not.toThrow();
  });
});

describe("cel/decls_test.go/TestUnaryBinding", () => {
  it("guards unary arity and propagates non-strict unknown values", () => {
    expect(() =>
      func("dyn", {
        overloads: [
          overload("dyn", [], DynType, {
            unaryBinding: (argument) => argument,
          }),
        ],
      }),
    ).toThrow(/non-unary overload/);

    const size = func("size", {
      overloads: [
        overload("size_non_strict", [listType(DynType)], IntType, {
          nonStrict: true,
          unaryBinding: (argument) =>
            argument.type().typeName() === "unknown"
              ? argument
              : (
                  argument as unknown as {
                    size(): Int;
                  }
                ).size(),
        }),
      ],
    });
    const celEnv = env({
      functions: [size],
      standardLibrary: false,
      variables: [variable("x", listType(DynType))],
    });
    const result = celEnv.program(celEnv.compile("size(x)")).eval({ x: unknown(1) });

    expect(result.type().typeName()).toBe("unknown");
  });
});

describe("cel/decls_test.go/TestBinaryBinding", () => {
  it("invokes a non-strict binary binding and rejects invalid arity", () => {
    const max = func("max", {
      overloads: [
        overload("max_int_int", [IntType, IntType], IntType, {
          nonStrict: true,
          binaryBinding: (left, right) => {
            if (left.type().typeName() === "unknown") {
              return right;
            }
            if (right.type().typeName() === "unknown") {
              return left;
            }
            return (left as Int).value() > (right as Int).value() ? left : right;
          },
        }),
      ],
    });
    const celEnv = env({
      functions: [max],
      standardLibrary: false,
      variables: [variable("x", IntType), variable("y", IntType)],
    });
    const program = celEnv.program(celEnv.parse("max(x, y)"));

    expect(program.eval({ x: unknown(1), y: 1 }).value()).toBe(1n);
    expect(program.eval({ x: 2, y: unknown(2) }).value()).toBe(2n);
    expect(program.eval({ x: 2, y: 1 }).value()).toBe(2n);

    expect(() =>
      func("right", {
        overloads: [
          overload("right_int_int", [IntType, IntType, IntType], IntType, {
            binaryBinding: (_left, right) => right,
          }),
        ],
      }),
    ).toThrow(/non-binary overload/);
  });
});

describe("cel/decls_test.go/TestFunctionMergeDuplicate", () => {
  it("accepts duplicate equivalent overload declarations", () => {
    const max = func("max", {
      overloads: [overload("max_int", [IntType], IntType), overload("max_int", [IntType], IntType)],
    });

    expect(() =>
      env({
        functions: [max, max],
        standardLibrary: false,
      }),
    ).not.toThrow();
  });
});

describe("cel/decls_test.go/TestFunctionMergeDeclarationAndDefinition", () => {
  it("merges a declaration with its runtime definition", () => {
    const declaration = func("id", {
      overloads: [
        overload("id", [typeParamType("T")], typeParamType("T"), {
          nonStrict: true,
        }),
      ],
    });
    const definition = func("id", {
      overloads: [
        overload("id", [typeParamType("T")], typeParamType("T"), {
          nonStrict: true,
          unaryBinding: (argument) => argument,
        }),
      ],
    });
    const celEnv = env({
      functions: [declaration, definition],
      standardLibrary: false,
      variables: [variable("x", AnyType)],
    });

    expect(celEnv.program(celEnv.compile("id(x)")).eval({ x: true }).value()).toBe(true);
  });
});

describe("cel/decls_test.go/TestFunctionMergeCollision", () => {
  it("rejects overloads with colliding signatures", () => {
    expect(() =>
      func("max", {
        overloads: [
          overload("max_int", [IntType], IntType),
          overload("max_int2", [IntType], IntType),
        ],
      }),
    ).toThrow(/collides/);
  });
});

describe("cel/decls_test.go/TestFunctionNoOverloads", () => {
  it("rejects a function without overload declarations", () => {
    expect(() =>
      func("right", {
        singletonBinding: {
          binary: (_left, right) => right,
        },
      }),
    ).toThrow(/must have at least one overload/);
  });
});

describe("cel/decls_test.go/TestFunctionDisableDeclaration", () => {
  it("keeps the runtime binding while hiding the checker declaration", () => {
    const disabled = func("disabled", {
      disableDeclaration: true,
      overloads: [
        overload("disabled_any", [BoolType], BoolType, {
          functionBinding: () => True,
        }),
      ],
    });
    const celEnv = env({
      functions: [disabled],
      standardLibrary: false,
    });

    expect(celEnv.program(celEnv.parse("disabled(true)")).eval({})).toBe(True);
    expect(celEnv.tryCompile("disabled(true)").errors).toBeDefined();
  });
});

describe("cel/decls_test.go/TestFunctionDisableDeclarationMerge", () => {
  it("allows a later definition to disable an earlier declaration", () => {
    const declaration = func("disabled", {
      overloads: [overload("disabled_any", [BoolType], BoolType)],
    });
    const definition = func("disabled", {
      disableDeclaration: true,
      overloads: [
        overload("disabled_any", [BoolType], BoolType, {
          functionBinding: () => True,
        }),
      ],
    });
    const celEnv = env({
      functions: [declaration, definition],
      standardLibrary: false,
    });

    expect(celEnv.program(celEnv.parse("disabled(true)")).eval({})).toBe(True);
    expect(celEnv.tryCompile("disabled(true)").errors).toBeDefined();
  });
});

describe("cel/decls_test.go/TestFunctionDisableDeclarationMergeReenable", () => {
  it("allows a later definition to re-enable a declaration", () => {
    const declaration = func("enabled", {
      disableDeclaration: true,
      overloads: [overload("enabled_any", [BoolType], BoolType)],
    });
    const definition = func("enabled", {
      disableDeclaration: false,
      overloads: [
        overload("enabled_any", [BoolType], BoolType, {
          functionBinding: () => True,
        }),
      ],
    });
    const celEnv = env({
      functions: [declaration, definition],
      standardLibrary: false,
    });

    expect(celEnv.program(celEnv.parse("enabled(true)")).eval({})).toBe(True);
    expect(celEnv.tryCompile("enabled(true)").errors).toBeUndefined();
  });
});

describe("cel/decls_test.go/TestFunctionDeclExcludeOverloads", () => {
  it("evaluates only the non-excluded addition overloads", () => {
    const successCases = syncedCases<{
      expr: string;
      name: string;
      want: unknown;
    }>("cel/decls_test.go/TestFunctionDeclExcludeOverloads#successTests");
    const failureCases = syncedCases<{
      expr: string;
      name: string;
    }>("cel/decls_test.go/TestFunctionDeclExcludeOverloads#failureTests");
    const functions = standardFunctions().map((declaration) =>
      declaration.name() === operators.Add
        ? declaration.subset(
            excludeOverloads(overloads.AddList, overloads.AddBytes, overloads.AddString),
          )!
        : declaration,
    );
    const celEnv = env({
      standardLibrary: { functions },
    });

    for (const testCase of successCases) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      const expected = resolveSyncedVal(testCase.want);
      expect(result.value(), testCase.name).toEqual(
        typeof expected === "object" &&
          expected !== null &&
          "value" in expected &&
          typeof expected.value === "function"
          ? expected.value()
          : expected,
      );
    }
    for (const testCase of failureCases) {
      expect(celEnv.tryCompile(testCase.expr).errors, testCase.name).toBeDefined();
    }
  });
});

describe("cel/decls_test.go/TestFunctionDeclIncludeOverloads", () => {
  it("evaluates only the explicitly included addition overloads", () => {
    const successCases = syncedCases<{
      expr: string;
      name: string;
      want: unknown;
    }>("cel/decls_test.go/TestFunctionDeclIncludeOverloads#successTests");
    const failureCases = syncedCases<{
      expr: string;
      name: string;
    }>("cel/decls_test.go/TestFunctionDeclIncludeOverloads#failureTests");
    const functions = standardFunctions().map((declaration) =>
      declaration.name() === operators.Add
        ? declaration.subset(includeOverloads(overloads.AddInt64, overloads.AddDouble))!
        : declaration,
    );
    const celEnv = env({
      standardLibrary: { functions },
    });

    for (const testCase of successCases) {
      const result = celEnv.program(celEnv.compile(testCase.expr)).eval({});
      const expected = resolveSyncedVal(testCase.want);
      expect(result.value(), testCase.name).toEqual(
        typeof expected === "object" &&
          expected !== null &&
          "value" in expected &&
          typeof expected.value === "function"
          ? expected.value()
          : expected,
      );
    }
    for (const testCase of failureCases) {
      expect(celEnv.tryCompile(testCase.expr).errors, testCase.name).toBeDefined();
    }
  });
});

describe("cel/decls_test.go/TestExprDeclToDeclarationInvalid", () => {
  it("rejects every synced malformed protobuf declaration", () => {
    const cases = syncedCases<{
      in: unknown;
      out: string;
    }>("cel/decls_test.go/TestExprDeclToDeclarationInvalid");

    for (const testCase of cases) {
      const declaration = resolveSyncedDecl(testCase.in);

      expect(() => declarationFromProto(declaration), JSON.stringify(testCase.in)).toThrow(
        testCase.out,
      );
    }
  });
});

describe("cel/decls_test.go/TestExprDeclToDeclaration", () => {
  it("converts canonical protobuf functions, variables, and constants", () => {
    const typeParam = typeToExprType(typeParamType("T"));
    const equals = declarationFromProto({
      $typeName: "cel.expr.Decl",
      name: operators.Equals,
      declKind: {
        case: "function",
        value: {
          $typeName: "cel.expr.Decl.FunctionDecl",
          doc: "",
          overloads: [
            {
              $typeName: "cel.expr.Decl.FunctionDecl.Overload",
              doc: "",
              isInstanceFunction: false,
              overloadId: overloads.Equals,
              params: [typeParam, typeParam],
              resultType: typeToExprType(BoolType),
              typeParams: ["T"],
            },
          ],
        },
      },
    } satisfies Decl);
    const size = declarationFromProto({
      $typeName: "cel.expr.Decl",
      name: overloads.Size,
      declKind: {
        case: "function",
        value: {
          $typeName: "cel.expr.Decl.FunctionDecl",
          doc: "",
          overloads: [
            {
              $typeName: "cel.expr.Decl.FunctionDecl.Overload",
              doc: "",
              isInstanceFunction: false,
              overloadId: overloads.SizeString,
              params: [typeToExprType(StringType)],
              resultType: typeToExprType(IntType),
              typeParams: [],
            },
            {
              $typeName: "cel.expr.Decl.FunctionDecl.Overload",
              doc: "",
              isInstanceFunction: true,
              overloadId: overloads.SizeStringInst,
              params: [typeToExprType(StringType)],
              resultType: typeToExprType(IntType),
              typeParams: [],
            },
          ],
        },
      },
    } satisfies Decl);
    const variable = declarationFromProto({
      $typeName: "cel.expr.Decl",
      name: "x",
      declKind: {
        case: "ident",
        value: {
          $typeName: "cel.expr.Decl.IdentDecl",
          doc: "",
          type: typeToExprType(StringType),
        },
      },
    } satisfies Decl);
    const constant = declarationFromProto({
      $typeName: "cel.expr.Decl",
      name: "constant",
      declKind: {
        case: "ident",
        value: {
          $typeName: "cel.expr.Decl.IdentDecl",
          doc: "",
          type: typeToExprType(BoolType),
          value: {
            $typeName: "cel.expr.Constant",
            constantKind: { case: "boolValue", value: true },
          },
        },
      },
    } satisfies Decl);

    expect(equals).toBeInstanceOf(FunctionDecl);
    expect(size).toBeInstanceOf(FunctionDecl);
    expect(variable).toBeInstanceOf(VariableDecl);
    expect(constant).toBeInstanceOf(VariableDecl);

    const celEnv = env({
      functions: [equals, size] as FunctionDecl[],
      variables: [variable, constant] as VariableDecl[],
    });
    const program = celEnv.program(celEnv.compile("(size(x) == x.size()) == constant"));

    expect(program.eval({ x: "hello" }).value()).toBe(true);
  });
});

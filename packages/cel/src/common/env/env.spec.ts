import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  functionDecl,
  memberOverload,
  overload,
  variableDecl,
  variableDeclWithDoc,
} from "../decls.js";
import * as operators from "../operators.js";
import { registry } from "../types/provider.js";
import {
  DynType,
  IntType,
  listType,
  mapType,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  StringType,
  TypeType,
  typeParamType,
  typeTypeWithParam,
  UintType,
} from "../types/types.js";
import {
  Config,
  ContextVariable,
  config,
  configFromYAML,
  contextVariable,
  Function as EnvFunction,
  Extension,
  extension,
  Feature,
  feature,
  func,
  Import,
  importType,
  LibrarySubset,
  librarySubset,
  limit,
  Overload,
  overload as serialOverload,
  TypeDesc,
  typeDesc,
  Validator,
  Variable,
  validator,
  variable,
} from "./index.js";

function loadFixture(name: string): string {
  return readFileSync(
    new URL(`../../../testdata/cel-go-files/common/env/testdata/${name}`, import.meta.url),
    "utf8",
  );
}

function testRegistry() {
  const tp = registry();
  tp.registerType(opaqueType("set", typeParamType("T")));
  return tp;
}

function expectFunctionEquivalent(
  actual: ReturnType<EnvFunction["asCELFunction"]>,
  expected: ReturnType<typeof functionDecl>,
): void {
  expect(actual.name()).toBe(expected.name());
  expect(actual.overloadDecls().length).toBe(expected.overloadDecls().length);
  actual.overloadDecls().forEach((overloadDecl, index) => {
    const want = expected.overloadDecls()[index]!;
    expect(overloadDecl.id()).toBe(want.id());
    expect(overloadDecl.isMemberFunction()).toBe(want.isMemberFunction());
    expect(overloadDecl.argTypes().length).toBe(want.argTypes().length);
    overloadDecl.argTypes().forEach((arg, argIndex) => {
      expect(arg.isExactType(want.argTypes()[argIndex]!)).toBe(true);
    });
    expect(overloadDecl.resultType().isExactType(want.resultType())).toBe(true);
  });
}

describe("functional environment configuration API", () => {
  it("creates serializable environment values from option objects", () => {
    const stringType = typeDesc({ typeName: "string" });
    const sizeOverload = serialOverload({
      id: "size_string",
      args: [stringType],
      returnType: typeDesc({ typeName: "int" }),
    });
    const sizeFunction = func({
      name: "size",
      overloads: [sizeOverload],
    });
    const subset = librarySubset({
      includeFunctions: [sizeFunction],
      includeMacros: ["has"],
    });
    const configured = config({
      name: "functional",
      imports: [importType("google.protobuf.StringValue")],
      stdlib: subset,
      extensions: [extension("optional", "1")],
      contextVariable: contextVariable("google.protobuf.StringValue"),
      functions: [sizeFunction],
      validators: [validator("cel.validator.duration")],
      features: [feature("cel.feature.macro_call_tracking", true)],
      limits: [limit("comprehension_nesting", 10)],
    });

    expect(configured.name).toBe("functional");
    expect(configured.imports[0]?.name).toBe("google.protobuf.StringValue");
    expect(configured.stdlib).toBe(subset);
    expect(configured.extensions[0]?.version).toBe("1");
    expect(configured.contextVariable?.typeName).toBe("google.protobuf.StringValue");
    expect(configured.functions[0]).toBe(sizeFunction);
    expect(configured.validators[0]?.name).toBe("cel.validator.duration");
    expect(configured.features[0]?.enabled).toBe(true);
    expect(configured.limits[0]?.value).toBe(10);
  });

  it("creates variables and member overloads from option objects", () => {
    const stringType = typeDesc({ typeName: "string" });
    const member = serialOverload({
      id: "string_size",
      target: stringType,
      returnType: typeDesc({ typeName: "int" }),
      examples: ["'hello'.size() // 5"],
    });
    const declaredVariable = variable({
      name: "message",
      type: stringType,
      description: "A message to inspect.",
    });

    expect(member.target).toBe(stringType);
    expect(member.examples).toEqual(["'hello'.size() // 5"]);
    expect(declaredVariable.getType()).toBe(stringType);
    expect(declaredVariable.description).toBe("A message to inspect.");
  });
});

describe("common/env/env_test.go", () => {
  it("common/env/env_test.go/TestConfig", () => {
    const context = configFromYAML(loadFixture("context_env.yaml"));
    expect(context.name).toBe("context-env");
    expect(context.container).toBe("google.expr");
    expect(context.imports.map((entry) => entry.name)).toEqual([
      "google.expr.proto3.test.TestAllTypes",
    ]);
    expect(context.stdlib?.includeMacros).toEqual(["has"]);
    expect(context.stdlib?.includeFunctions.map((entry) => entry.name)).toEqual([
      operators.Equals,
      operators.NotEquals,
      operators.LogicalNot,
      operators.Less,
      operators.LessEquals,
      operators.Greater,
      operators.GreaterEquals,
    ]);
    expect(context.contextVariable?.typeName).toBe("google.expr.proto3.test.TestAllTypes");
    expect(context.functions[0]?.overloads.map((entry) => entry.id)).toEqual([
      "coalesce_wrapped_int",
      "coalesce_wrapped_double",
      "coalesce_wrapped_uint",
    ]);

    const extended = configFromYAML(loadFixture("extended_env.yaml"));
    expect(extended.variables.map((entry) => entry.getType()?.specifierFormat())).toEqual([
      "google.expr.proto3.test.TestAllTypes",
      "optional_type<google.expr.proto3.test.TestAllTypes>",
    ]);
    expect(extended.features[0]?.name).toBe("cel.feature.macro_call_tracking");
    expect(extended.limits[0]?.value).toBe(7);
    expect(extended.validators[3]?.configValue("limit")).toEqual([2, true]);

    const json = configFromYAML(loadFixture("json_env.json"));
    expect(json.name).toBe("json-env");
    expect(json.functions.map((entry) => entry.name)).toEqual(["isEmpty", "getOrDefault"]);

    const subset = configFromYAML(loadFixture("subset_env.yaml"));
    expect(subset.stdlib?.excludeMacros).toEqual(["map", "filter"]);
    expect(subset.variables.map((entry) => entry.name)).toEqual(["x", "y", "z"]);
  });

  it("common/env/env_test.go/TestConfigValidateErrors", () => {
    const cases: Array<[Config | undefined, string | undefined]> = [
      [undefined, undefined],
      [new Config("invalid import").addImports(new Import("")), "invalid import"],
      [
        new Config("invalid subset").setStdLib(
          new LibrarySubset().addExcludedMacros("has").addIncludedMacros("exists"),
        ),
        "invalid subset",
      ],
      [new Config("invalid extension").addExtensions(new Extension("")), "invalid extension"],
      [
        new Config("invalid context variable").setContextVariable(new ContextVariable("")),
        "invalid context variable",
      ],
      [
        new Config("invalid variable").addVariables(new Variable("", undefined)),
        "invalid variable",
      ],
      [
        new Config("invalid variable").addVariables(
          new Variable("foo", new TypeDesc("X", [], true)),
        ),
        "variables cannot be type parameters",
      ],
      [
        new Config("colliding context variable")
          .setContextVariable(new ContextVariable("msg.type.Name"))
          .addVariables(new Variable("local", new TypeDesc("string"))),
        "invalid config",
      ],
      [new Config("invalid function").addFunctions(new EnvFunction("", [])), "invalid function"],
      [new Config("invalid feature").addFeatures(new Feature("", false)), "invalid feature"],
      [new Config("invalid validator").addValidators(new Validator("")), "invalid validator"],
    ];
    for (const [config, want] of cases) {
      const err = config?.validate();
      if (want === undefined) {
        expect(err).toBeUndefined();
      } else {
        expect(err?.message).toContain(want);
      }
    }
  });

  it("common/env/env_test.go/TestConfigAddVariableDecls", () => {
    const config = new Config("vars").addVariableDecls(
      undefined,
      variableDecl("var", StringType),
      variableDecl("listVar", listType(typeParamType("T"))),
      variableDecl("setVar", opaqueType("bitvector")),
      variableDecl("msg", objectType("google.type.Expr")),
      variableDeclWithDoc(
        "docVar",
        objectType("google.type.Expr"),
        "API-friendly CEL expression type",
      ),
    );
    expect(config.variables.map((entry) => entry.getType()?.specifierFormat())).toEqual([
      "string",
      "list<~T>",
      "bitvector",
      "google.type.Expr",
      "google.type.Expr",
    ]);
    expect(config.variables[4]?.description).toBe("API-friendly CEL expression type");
  });

  it("common/env/env_test.go/TestConfigAddVariableDeclsEmpty", () => {
    expect(new Config("").addVariables().variables).toHaveLength(0);
  });

  it("common/env/env_test.go/TestConfigAddFunctionDecls", () => {
    const config = new Config("funcs").addFunctionDecls(
      undefined,
      functionDecl("size", { overloads: [overload("size_string", [StringType], IntType)] }),
      functionDecl("size", {
        overloads: [overload("size_wrapper_string", [nullableType(StringType)], IntType)],
      }),
      functionDecl("size", {
        overloads: [
          memberOverload("list_size", [listType(typeParamType("T"))], IntType),
          memberOverload("string_size", [StringType], IntType),
        ],
      }),
    );
    expect(config.functions).toHaveLength(3);
    expect(config.functions[0]?.overloads[0]?.args[0]?.specifierFormat()).toBe("string");
    expect(config.functions[1]?.overloads[0]?.args[0]?.specifierFormat()).toBe(
      "google.protobuf.StringValue",
    );
    expect(config.functions[2]?.overloads[0]?.target?.specifierFormat()).toBe("list<~T>");
  });

  it("common/env/env_test.go/TestNewImport", () => {
    expect(new Import("qualified.type.name").name).toBe("qualified.type.name");
  });

  it("common/env/env_test.go/TestImportValidate", () => {
    expect(new Import("").validate()?.message).toContain("invalid import");
  });

  it("common/env/env_test.go/TestNewContextVariable", () => {
    expect(new ContextVariable("qualified.type.name").typeName).toBe("qualified.type.name");
  });

  it("common/env/env_test.go/TestContextVariableValidate", () => {
    expect(new ContextVariable("").validate()?.message).toContain("invalid context variable");
  });

  it("common/env/env_test.go/TestVariableGetType", () => {
    const embedded = new Variable("msg", new TypeDesc("type.name.EmbeddedType"));
    embedded.type = new TypeDesc("type.name.FieldType");
    expect(embedded.getType()?.typeName).toBe("type.name.EmbeddedType");
    expect(new Variable("empty").getType()).toBeUndefined();
  });

  it("common/env/env_test.go/TestVariableAsCELVariable", () => {
    const tp = testRegistry();
    const cases: Array<[Variable, ReturnType<typeof variableDecl> | string]> = [
      [new Variable("t", new TypeDesc("type")), variableDecl("t", TypeType)],
      [
        new Variable("t", new TypeDesc("type", [new TypeDesc("T", [], true)])),
        variableDecl("t", typeTypeWithParam(typeParamType("T"))),
      ],
      [new Variable("int_var", new TypeDesc("int")), variableDecl("int_var", IntType)],
      [new Variable("uint_var", new TypeDesc("uint")), variableDecl("uint_var", UintType)],
      [new Variable("dyn_var", new TypeDesc("dyn")), variableDecl("dyn_var", DynType)],
      [
        new Variable("list_var", new TypeDesc("list", [new TypeDesc("T", [], true)])),
        variableDecl("list_var", listType(typeParamType("T"))),
      ],
      [
        new Variable(
          "map_var",
          new TypeDesc("map", [
            new TypeDesc("string"),
            new TypeDesc("optional_type", [new TypeDesc("T", [], true)]),
          ]),
        ),
        variableDecl("map_var", mapType(StringType, optionalType(typeParamType("T")))),
      ],
      [
        new Variable("set_var", new TypeDesc("set", [new TypeDesc("string")])),
        variableDecl("set_var", opaqueType("set", StringType)),
      ],
      [
        new Variable("msg", new TypeDesc("google.protobuf.StringValue")),
        variableDecl("msg", nullableType(StringType)),
      ],
      [new Variable("bad", new TypeDesc("undefined")), "undefined type name"],
    ];
    for (const [variable, want] of cases) {
      if (typeof want === "string") {
        expect(() => variable.asCELVariable(tp)).toThrow(want);
        continue;
      }
      expect(variable.asCELVariable(tp).declarationIsEquivalent(want)).toBe(true);
    }
  });

  it("common/env/env_test.go/TestTypeDescString", () => {
    expect(new TypeDesc("string").toString()).toBe("string");
    expect(new TypeDesc("list", [new TypeDesc("T", [], true)]).toString()).toBe("list(T)");
    expect(new TypeDesc("type", [new TypeDesc("T", [], true)]).toString()).toBe("type(T)");
    expect(
      new TypeDesc("map", [new TypeDesc("string"), new TypeDesc("T", [], true)]).toString(),
    ).toBe("map(string,T)");
  });

  it("common/env/env_test.go/TestFunctionAsCELFunction", () => {
    const tp = testRegistry();
    const simple = new EnvFunction("size", [
      new Overload("size_string", [new TypeDesc("string")], new TypeDesc("int")),
    ]);
    expectFunctionEquivalent(
      simple.asCELFunction(tp),
      functionDecl("size", { overloads: [overload("size_string", [StringType], IntType)] }),
    );

    const member = new EnvFunction("size", [
      new Overload("string_size", [], new TypeDesc("int"), new TypeDesc("string"), [
        "'hello'.size() // 5",
      ]),
    ]);
    expectFunctionEquivalent(
      member.asCELFunction(tp),
      functionDecl("size", { overloads: [memberOverload("string_size", [StringType], IntType)] }),
    );

    expect(() =>
      new EnvFunction("size", [
        new Overload("size_undefined", [new TypeDesc("undefined")], new TypeDesc("int")),
      ]).asCELFunction(tp),
    ).toThrow("undefined type");
  });

  it("common/env/env_test.go/TestTypeDescAsCELTypeErrors", () => {
    const tp = testRegistry();
    const invalid = [
      [new TypeDesc("optional_type"), "expects 1 parameter"],
      [new TypeDesc("list"), "expects 1 parameter"],
      [new TypeDesc("map"), "expects 2 parameters"],
      [new TypeDesc("T", [new TypeDesc("string")], true), "param type"],
      [new TypeDesc("undefined"), "undefined type"],
    ] as const;
    for (const [desc, want] of invalid) {
      expect(() => desc.asCELType(tp)).toThrow(want);
    }
  });

  it("common/env/env_test.go/TestLibrarySubsetValidate", () => {
    expect(new LibrarySubset().validate()).toBeUndefined();
    expect(
      new LibrarySubset()
        .addIncludedFunctions(new EnvFunction("size"))
        .addExcludedFunctions(new EnvFunction("size"))
        .validate()?.message,
    ).toContain("invalid subset");
    expect(
      new LibrarySubset().addIncludedMacros("has").addExcludedMacros("exists").validate()?.message,
    ).toContain("invalid subset");
  });

  it("common/env/env_test.go/TestSubsetFunction", () => {
    const orig = functionDecl("size", {
      overloads: [
        overload("size_string", [StringType], IntType),
        overload("size_list", [listType(typeParamType("T"))], IntType),
      ],
    });
    const [includeAll, includeAllOk] = new LibrarySubset()
      .addIncludedFunctions(new EnvFunction("size"))
      .subsetFunction(orig);
    expect(includeAllOk).toBe(true);
    expect(includeAll?.overloadDecls()).toHaveLength(2);

    const [subset, subsetOk] = new LibrarySubset()
      .addIncludedFunctions(
        Object.assign(new EnvFunction("size"), { overloads: [new Overload("size_string")] }),
      )
      .subsetFunction(orig);
    expect(subsetOk).toBe(true);
    expect(subset?.overloadDecls().map((entry) => entry.id())).toEqual(["size_string"]);

    const [, excluded] = new LibrarySubset()
      .addExcludedFunctions(new EnvFunction("size"))
      .subsetFunction(orig);
    expect(excluded).toBe(false);
  });

  it("common/env/env_test.go/TestSubsetMacro", () => {
    expect(new LibrarySubset().subsetMacro("has")).toBe(true);
    expect(new LibrarySubset().setDisabled(true).subsetMacro("has")).toBe(false);
    expect(new LibrarySubset().setDisableMacros(true).subsetMacro("has")).toBe(false);
    expect(new LibrarySubset().addIncludedMacros("exists").subsetMacro("has")).toBe(false);
    expect(new LibrarySubset().addExcludedMacros("exists").subsetMacro("has")).toBe(true);
  });

  it("common/env/env_test.go/TestNewExtension", () => {
    expect(new Extension("strings", "latest").version).toBe("latest");
    expect(new Extension("bindings", "1").version).toBe("1");
  });

  it("common/env/env_test.go/TestExtensionGetVersion", () => {
    expect(new Extension("test").versionNumber()).toBe(0);
    expect(new Extension("test", "1").versionNumber()).toBe(1);
    expect(new Extension("test", "latest").versionNumber()).toBe(0xffffffff);
    expect(() => new Extension("test", "1.0").versionNumber()).toThrow("invalid syntax");
  });

  it("common/env/env_test.go/TestValidatorValidate", () => {
    expect(new Validator("").validate()?.message).toContain("missing name");
  });

  it("common/env/env_test.go/TestValidatorConfigValue", () => {
    const validator = new Validator("validator").setConfig({ limit: 2 });
    expect(validator.configValue("absent")).toEqual([undefined, false]);
    expect(validator.configValue("limit")).toEqual([2, true]);
  });

  it("common/env/env_test.go/TestFeatureValidate", () => {
    expect(new Feature("", true).validate()?.message).toContain("missing name");
  });
});

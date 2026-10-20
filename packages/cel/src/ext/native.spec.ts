import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
import { optionalTypes } from "../cel/library.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { registry } from "../common/types/provider.js";
import { IndexerType } from "../common/types/traits/traits.js";
import {
  BoolType,
  IntType,
  listType,
  mapType,
  objectType,
  optionalType,
  StringType,
  TimestampType,
  TypeType,
} from "../common/types/types.js";
import { nativeField, nativeType, nativeTypes } from "./native.js";

/** NativeFieldNamesCase describes a synchronized native field lookup. */
interface NativeFieldNamesCase {
  /** fields contains the expected exported CEL field names. */
  readonly fields: string[];
  /** typeName contains the native or protobuf type name. */
  readonly typeName: string;
}

describe("ext/native_test.go/TestNativeTypes", () => {
  it("constructs, selects, compares, lists, and maps native values", () => {
    const celEnv = nativeEnv();
    const expression = `ext.TestAllTypes{
      BoolVal: true,
      StringVal: 'hello',
      NestedVal: ext.TestNestedType{custom_name: 'nested'},
      ListVal: [ext.TestNestedType{custom_name: 'listed'}],
      MapVal: {'key': ext.TestNestedType{custom_name: 'mapped'}}
    }`;
    const result = celEnv
      .program(
        unwrapAst(
          celEnv.compile(`
      ${expression}.BoolVal &&
      ${expression}.StringVal == 'hello' &&
      ${expression}.NestedVal.custom_name == 'nested' &&
      ${expression}.ListVal[0].custom_name == 'listed' &&
      ${expression}.MapVal.key.custom_name == 'mapped'
    `),
        ),
      )
      .eval({});
    expect(result.value()).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeFindStructFieldNames", () => {
  it("finds every synchronized native field-name set", () => {
    const typeRegistry = nativeRegistry();
    for (const testCase of syncedCases<NativeFieldNamesCase>(
      "ext/native_test.go/TestNativeFindStructFieldNames",
    )) {
      const fields = typeRegistry.findStructFieldNames(testCase.typeName);
      if (testCase.typeName === "ext.TestNestedType") {
        expect(fields).toBeDefined();
        expect(fields!.sort()).toEqual(testCase.fields.sort());
      } else if (testCase.typeName === "invalid.TypeName") {
        expect(fields).toBeUndefined();
      }
    }
  });
});

describe("ext/native_test.go/TestNativeTypesStaticErrors", () => {
  it("reports unknown native types and fields while checking", () => {
    const celEnv = nativeEnv();
    expect(celEnv.compile("TestAllTypos{}").errors?.toDisplayString()).toContain(
      "undeclared reference",
    );
    expect(celEnv.compile("ext.TestAllTypes{bool_val: false}").errors?.toDisplayString()).toContain(
      "undefined field",
    );
  });
});

describe("ext/native_test.go/TestNativeTypesJsonSerialization", () => {
  it("exposes native values as plain TypeScript objects", () => {
    const value = nativeEnv()
      .program(
        unwrapAst(nativeEnv().compile("ext.TestAllTypes{BoolVal: true, StringVal: 'value'}")),
      )
      .eval({})
      .value();
    expect(JSON.stringify(value)).toContain('"boolVal":true');
    expect(JSON.stringify(value)).toContain('"stringVal":"value"');
  });
});

describe("ext/native_test.go/TestNativeTypesRuntimeErrors", () => {
  it("reports unknown fields when unchecked native construction is evaluated", () => {
    const celEnv = nativeEnv();
    const parsed = unwrapAst(celEnv.parse("ext.TestAllTypes{bool_val: false}"));
    expect(String(celEnv.program(parsed).eval({}))).toContain("no such field");
  });
});

describe("ext/native_test.go/TestNativeTypesErrors", () => {
  it("rejects invalid descriptor versions and duplicate names", () => {
    expect(() => nativeTypes({ types: nativeDescriptors(), version: -1 })).toThrow(
      "invalid native types version",
    );
    const typeRegistry = nativeRegistry();
    expect(() =>
      typeRegistry.registerNativeTypes(nativeType({ typeName: "ext.TestAllTypes", fields: [] })),
    ).toThrow("registration conflict");
  });
});

describe("ext/native_test.go/TestNativeTypesConvertToNative", () => {
  it("returns constructed native object values", () => {
    const value = nativeEnv()
      .program(unwrapAst(nativeEnv().compile("ext.TestAllTypes{BoolVal: true}")))
      .eval({});
    expect(value.convertToNative(Object)).toMatchObject({
      $celTypeName: "ext.TestAllTypes",
      boolVal: true,
    });
  });
});

describe("ext/native_test.go/TestConvertToTypeErrors", () => {
  it("reports unsupported native CEL conversions", () => {
    const value = nativeRegistry().nativeToValue({
      $celTypeName: "ext.TestAllTypes",
      boolVal: true,
    });
    expect(String(value.convertToType(StringType))).toContain("type conversion error");
  });
});

describe("ext/native_test.go/TestNativeTypesWithOptional", () => {
  it("supports optional selection and native zero-value detection", () => {
    const celEnv = nativeEnv(true);
    expect(
      celEnv
        .program(
          unwrapAst(
            celEnv.compile(
              "!ext.TestAllTypes{}.?BoolVal.hasValue() && ext.TestAllTypes{BoolVal: true}.?BoolVal.orValue(false)",
            ),
          ),
        )
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeTypesWithCELTypedFields", () => {
  it("preserves CEL values stored directly in native fields", () => {
    const celEnv = nativeEnv(true);
    expect(
      celEnv
        .program(
          unwrapAst(
            celEnv.compile(
              "ext.TestRefValFieldType{optional_name: optional.of('name')}.optional_name.orValue('') == 'name'",
            ),
          ),
        )
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeTypeConvertToType", () => {
  it("converts a native value to its object type and type metadata", () => {
    const value = nativeRegistry().nativeToValue({
      $celTypeName: "ext.TestAllTypes",
      boolVal: true,
    });
    expect(value.convertToType(value.type())).toBe(value);
    expect(value.convertToType(TypeType).type().typeName()).toBe("type");
  });
});

describe("ext/native_test.go/TestNativeTypeConvertToNative", () => {
  it("rejects unsupported native conversion targets", () => {
    const value = nativeRegistry().nativeToValue({
      $celTypeName: "ext.TestAllTypes",
    });
    expect(() => value.convertToNative(String)).toThrow("type conversion error");
  });
});

describe("ext/native_test.go/TestNativeTypeHasTrait", () => {
  it("advertises object indexing traits", () => {
    const value = nativeRegistry().nativeToValue({
      $celTypeName: "ext.TestAllTypes",
    });
    expect(value.type().hasTrait(IndexerType)).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeTypeValue", () => {
  it("returns the underlying native object", () => {
    const input = { $celTypeName: "ext.TestAllTypes", boolVal: true };
    expect(nativeRegistry().nativeToValue(input).value()).toBe(input);
  });
});

describe("TypeScript extension/TestNativeTypeWrapperCache", () => {
  it("reuses a live wrapper for the same registered native object", () => {
    const input = { $celTypeName: "ext.TestAllTypes", boolVal: true };
    const typeRegistry = nativeRegistry();
    const first = typeRegistry.nativeToValue(input);
    const second = typeRegistry.nativeToValue(input);

    expect(second).toBe(first);
    input.boolVal = false;
    expect(first.value()).toBe(input);
  });
});

describe("ext/native_test.go/TestNativeStructWithMultipleSameFieldNames", () => {
  it("keeps identically named fields isolated by native type", () => {
    const celEnv = nativeEnv();
    expect(
      celEnv
        .program(
          unwrapAst(
            celEnv.compile(
              "ext.TestNestedType{custom_name: 'nested'}.custom_name == 'nested' && ext.TestAllTypes{CustomName: 'all'}.CustomName == 'all'",
            ),
          ),
        )
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeStructEmbedded", () => {
  it("selects fields through an explicitly described embedded object", () => {
    const celEnv = nativeEnv();
    expect(
      celEnv
        .program(
          unwrapAst(
            celEnv.compile(
              "ext.TestEmbeddedTypes{embedded: ext.TestNestedType{custom_name: 'name'}}.embedded.custom_name == 'name'",
            ),
          ),
        )
        .eval({})
        .value(),
    ).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeStructEmbeddedPointer", () => {
  it("handles absent and populated optional embedded-object equivalents", () => {
    const celEnv = nativeEnv();
    const absent = celEnv
      .program(unwrapAst(celEnv.compile("!has(test.ListVal)")))
      .eval({ test: { $celTypeName: "ext.TestNestedStruct" } });
    const populated = celEnv
      .program(unwrapAst(celEnv.compile("test.ListVal[0].custom_name == 'name'")))
      .eval({
        test: nativeRegistry().nativeToValue({
          $celTypeName: "ext.TestNestedStruct",
          listVal: [
            nativeRegistry().nativeToValue({
              $celTypeName: "ext.TestNestedType",
              nestedCustomName: "name",
            }),
          ],
        }),
      });

    expect(absent.value()).toBe(true);
    expect(populated.value()).toBe(true);
  });
});

describe("ext/native_test.go/TestNativeStructHiddenField", () => {
  it("does not expose object properties omitted from the explicit TypeScript descriptor", () => {
    const celEnv = nativeEnv();
    expect(celEnv.compile("test.hidden").errors?.toDisplayString()).toContain("undefined field");
  });
});

describe("ext/native_test.go/TestNativeToValueDelegatesUnregisteredStructs", () => {
  it("delegates unregistered plain objects to the underlying CEL adapter", () => {
    const value = nativeRegistry().nativeToValue({ arbitrary: 1 });

    expect(value.type().typeName()).toBe("map");
  });
});

describe("ext/native_test.go/TestNativeNestedStruct", () => {
  it("evaluates synchronized nested native list selection", () => {
    const celEnv = nativeEnv();
    const inputRegistry = nativeRegistry();
    for (const testCase of syncedCases<{ expr: string }>(
      "ext/native_test.go/TestNativeNestedStruct",
    )) {
      expect(
        celEnv
          .program(unwrapAst(celEnv.compile(testCase.expr)))
          .eval({
            test: nativeRegistry().nativeToValue({
              $celTypeName: "ext.TestNestedStruct",
              listVal: [
                inputRegistry.nativeToValue({
                  $celTypeName: "ext.TestNestedType",
                  nestedCustomName: "name",
                }),
              ],
            }),
          })
          .value(),
      ).toBe(true);
    }
  });
});

describe("ext/native_test.go/TestNativeTypesVersion", () => {
  it("accepts native types version zero", () => {
    expect(() => nativeTypes({ types: nativeDescriptors(), version: 0 })).not.toThrow();
  });
});

describe("ext/native_test.go/TestTypeResolutionRace", () => {
  it("resolves repeated native construction deterministically", () => {
    const celEnv = nativeEnv();
    for (let index = 0; index < 20; index += 1) {
      expect(
        celEnv
          .program(unwrapAst(celEnv.compile(`ext.TestNestedType{custom_name: 'name${index}'}`)))
          .eval({})
          .value(),
      ).toMatchObject({ nestedCustomName: `name${index}` });
    }
  });
});

/**
 * nativeEnv creates an environment with the test native descriptors.
 */
function nativeEnv(withOptional = false) {
  const typeRegistry = nativeRegistry();
  return env({
    libraries: withOptional ? [optionalTypes()] : [],
    registry: typeRegistry,
    variables: [variable("test", objectType("ext.TestNestedStruct"))],
  });
}

/**
 * nativeRegistry creates a registry with all test native descriptors.
 */
function nativeRegistry() {
  return nativeTypes({ types: nativeDescriptors(), registry: registry() });
}

/**
 * nativeDescriptors returns explicit TypeScript equivalents of the Go reflection fixtures.
 */
function nativeDescriptors() {
  const nestedType = objectType("ext.TestNestedType");
  return [
    nativeType({
      typeName: "ext.TestNestedType",
      fields: [
        nativeField({
          celName: "NestedListVal",
          property: "nestedListVal",
          type: listType(StringType),
        }),
        nativeField({
          celName: "NestedMapVal",
          property: "nestedMapVal",
          type: mapType(IntType, BoolType),
        }),
        nativeField({
          celName: "custom_name",
          property: "nestedCustomName",
          type: StringType,
        }),
      ],
    }),
    nativeType({
      typeName: "ext.TestAllTypes",
      fields: [
        nativeField({ celName: "BoolVal", property: "boolVal", type: BoolType }),
        nativeField({ celName: "StringVal", property: "stringVal", type: StringType }),
        nativeField({ celName: "CustomName", property: "customName", type: StringType }),
        nativeField({ celName: "NestedVal", property: "nestedVal", type: nestedType }),
        nativeField({
          celName: "ListVal",
          property: "listVal",
          type: listType(nestedType),
        }),
        nativeField({
          celName: "MapVal",
          property: "mapVal",
          type: mapType(StringType, nestedType),
        }),
      ],
    }),
    nativeType({
      typeName: "ext.TestEmbeddedTypes",
      fields: [nativeField({ celName: "embedded", property: "embedded", type: nestedType })],
    }),
    nativeType({
      typeName: "ext.TestNestedStruct",
      fields: [
        nativeField({
          celName: "ListVal",
          property: "listVal",
          type: listType(nestedType),
        }),
      ],
    }),
    nativeType({
      typeName: "ext.TestRefValFieldType",
      fields: [
        nativeField({
          celName: "optional_name",
          property: "optionalName",
          type: optionalType(StringType),
        }),
        nativeField({ celName: "IntVal", property: "intVal", type: IntType }),
        nativeField({ celName: "time", property: "time", type: TimestampType }),
      ],
    }),
  ];
}

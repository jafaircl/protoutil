import { create as createMessage } from "@bufbuild/protobuf";
import { AnySchema, StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { False, True } from "./bool.js";
import { Double } from "./double.js";
import { Err } from "./err.js";
import { Int } from "./int.js";
import {
  dynamicMap,
  insertMapKeyValue,
  mutableMap,
  refValMap,
  stringInterfaceMap,
  stringStringMap,
} from "./map.js";
import { NullValue } from "./null.js";
import { jsonStruct, jsonValue } from "./pb/spec-helpers.js";
import { DefaultTypeAdapter, registry } from "./provider.js";
import {
  isPlainObject,
  isProtoStruct,
  resolveMapSyncedValue,
  resolveSyncedExpr,
} from "./spec-helpers.js";
import { String as CelString } from "./string.js";
import type { Mapper } from "./traits/index.js";
import { ListType, MapType, TypeType } from "./types.js";

describe("map", () => {
  it("common/types/map_test.go/TestStringMapContains", () => {
    const mapVal = dynamicMap(registry(), { first: "hello", second: "world" });
    expect(mapVal.contains(new CelString("first"))).toEqual(True);
    expect(mapVal.contains(new CelString("third"))).toEqual(False);
    expect(mapVal.contains(registry().nativeToValue(123))).toEqual(False);
  });

  it("common/types/map_test.go/TestMapContains", () => {
    const reg = registry([createMessage(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
    const reflectMap = dynamicMap(reg, { 1: "hello", 2: "world" });
    const refValMap = dynamicMap(reg, { 1: "hello", 2: "world" });
    const protoObject = reg.nativeToValue(
      createMessage(Proto3TestAllTypesSchema, {
        mapInt64NestedType: {
          "1": createMessage(NestedTestAllTypesSchema),
          "2": createMessage(NestedTestAllTypesSchema),
        },
      }),
    ) as unknown as { get(index: CelString): unknown };
    const protoMap = protoObject.get(new CelString("map_int64_nested_type"));
    const cases = syncedCases<{ value: unknown; out: unknown }>(
      "common/types/map_test.go/TestMapContains",
    );
    for (const testCase of cases) {
      const input = reg.nativeToValue(resolveSyncedExpr(testCase.value));
      const expected = resolveSyncedExpr(testCase.out) as boolean;
      expect((reflectMap.contains(input) as { value(): boolean }).value()).toBe(expected);
      expect((refValMap.contains(input) as { value(): boolean }).value()).toBe(expected);
      expect(
        (protoMap as unknown as { contains(arg: unknown): { value(): boolean } })
          .contains(input)
          .value(),
      ).toBe(expected);
    }
  });

  it("common/types/map_test.go/TestDynamicMapConvertToNative_Json", () => {
    const mapVal = dynamicMap(registry(), { nested: { "1": -1 } });
    expect(mapVal.convertToNative(ValueSchema)).toEqual(jsonValue({ nested: { "1": -1 } }));
  });

  it("common/types/map_test.go/TestDynamicMapConvertToNative_Struct", () => {
    const mapVal = dynamicMap(registry(), { hello: "world" });
    expect(mapVal.convertToNative(StructSchema)).toEqual(jsonStruct({ hello: "world" }));
  });

  it("common/types/map_test.go/TestMapConvertToType", () => {
    const mapVal = dynamicMap(registry(), { hello: "world" });
    expect(mapVal.convertToType(MapType)).toBe(mapVal);
    expect(mapVal.convertToType(TypeType)).toBe(MapType);
  });

  it("common/types/map_test.go/TestMapEqual", () => {
    const reg = registry();
    const mapA = dynamicMap(reg, { hello: "world" });
    const mapB = dynamicMap(reg, { hello: "world" });
    const mapC = dynamicMap(reg, { hello: "moon" });
    expect(mapA.equal(mapB)).toBe(True);
    expect(mapA.equal(mapC)).toBe(False);
  });

  it("common/types/map_test.go/TestMapFindAndGet", () => {
    const mapVal = dynamicMap(registry(), { hello: "world" });
    const value = mapVal.find(new CelString("hello"));
    expect(value).toBeDefined();
    expect((value as CelString).value()).toBe("world");
    expect((mapVal.get(new CelString("hello")) as CelString).value()).toBe("world");
    expect(String(mapVal.get(new CelString("missing")))).toContain("no such key");
  });

  it("common/types/map_test.go/TestMapIsZeroValue", () => {
    const cases = syncedCases<{ isZeroValue: boolean; val: unknown }>(
      "common/types/map_test.go/TestMapIsZeroValue",
    );
    for (const testCase of cases) {
      const value = resolveMapSyncedValue(testCase.val);
      expect(
        (
          (isPlainObject(value) || isProtoStruct(value) || value instanceof Map
            ? dynamicMap(registry(), value)
            : value) as unknown as {
            isZeroValue(): boolean;
          }
        ).isZeroValue(),
      ).toBe(testCase.isZeroValue);
    }
  });

  it("common/types/map_test.go/TestStringMapIterator", () => {
    const iterator = dynamicMap(registry(), { first: "hello", second: "world" }).iterator();
    const seen: string[] = [];
    while (iterator.hasNext() === True) {
      seen.push((iterator.next() as CelString).value());
    }
    expect(seen).toEqual(["first", "second"]);
  });

  it("common/types/map_test.go/TestMapFold", () => {
    const entries: Array<[unknown, unknown]> = [];
    (
      dynamicMap(registry(), { first: "hello", second: 1 }) as unknown as {
        fold(folder: { foldEntry(key: unknown, value: unknown): boolean }): void;
      }
    ).fold({
      foldEntry(key: unknown, value: unknown) {
        entries.push([key, value]);
        return true;
      },
    });
    expect(entries).toEqual([
      ["first", "hello"],
      ["second", 1n],
    ]);
  });

  it("common/types/map_test.go/TestProtoMap", () => {
    const strMap = {
      hello: "world",
      goodbye: "for now",
      welcome: "back",
    };
    const reg = registry([
      createMessage(Proto3TestAllTypesSchema, { mapStringString: strMap }),
      Proto3TestAllTypesSchema,
    ]);
    const obj = reg.nativeToValue(
      createMessage(Proto3TestAllTypesSchema, { mapStringString: strMap }),
    ) as unknown as { get(index: CelString): unknown };
    const mapVal = obj.get(new CelString("map_string_string")) as Mapper;

    expect(mapVal.convertToType(MapType)).toBe(mapVal);
    expect(mapVal.convertToType(TypeType)).toBe(MapType);
    expect(
      (mapVal.convertToType(ListType) as { type(): { typeName(): string } }).type().typeName(),
    ).toBe("error");
    expect(mapVal.size().value()).toBe(3n);

    for (const [key, value] of Object.entries(strMap)) {
      expect(mapVal.contains(reg.nativeToValue(key))).toEqual(True);
      expect((mapVal.get(reg.nativeToValue(key)) as CelString).value()).toBe(value);
    }

    const refStrMap = reg.nativeToValue(strMap);
    expect(refStrMap.equal(mapVal)).toBe(True);
    expect(mapVal.equal(refStrMap)).toBe(True);

    const mapValCopy = new Map();
    const iterator = mapVal.iterator() as unknown as {
      hasNext(): typeof True | typeof False;
      next(): unknown;
    };
    while (iterator.hasNext() === True) {
      const key = iterator.next();
      mapValCopy.set(key, (mapVal as { get(index: unknown): unknown }).get(key));
    }
    const copied = reg.nativeToValue(mapValCopy);
    expect(copied.equal(mapVal)).toBe(True);
    expect(mapVal.equal(copied)).toBe(True);

    expect(
      mapVal.equal(reg.nativeToValue({ hello: "world", goodbye: "forever", welcome: "back" })),
    ).toBe(False);
    expect(mapVal.equal(reg.nativeToValue({}))).toBe(False);
    expect(
      (mapVal.equal(reg.nativeToValue({ 1: 9, 2: 1, 3: 1 })) as typeof True | typeof False).value(),
    ).toBe(false);
  });

  it("common/types/map_test.go/TestDynamicMapConvertToNative_Any", () => {
    const converted = dynamicMap(registry(), { nested: { "1": -1 } }).convertToNative(AnySchema);
    expect(converted).toMatchObject({
      $typeName: AnySchema.typeName,
      typeUrl: `type.googleapis.com/${StructSchema.typeName}`,
    });
  });

  it("common/types/map_test.go/TestDynamicMapConvertToNative_Error", () => {
    expect(() => dynamicMap(registry(), { nested: {} }).convertToNative([])).toThrow();
  });

  it.todo(
    "common/types/map_test.go/TestDynamicMapConvertToNative_StructPtr Go pointer-to-struct reflection has no TypeScript equivalent",
  );
  it.todo(
    "common/types/map_test.go/TestDynamicMapConvertToNative_StructPtrPtr Go pointer-depth reflection has no TypeScript equivalent",
  );
  it.todo(
    "common/types/map_test.go/TestDynamicMapConvertToNative_Struct_InvalidFieldError Go struct field reflection has no TypeScript equivalent",
  );
  it.todo(
    "common/types/map_test.go/TestDynamicMapConvertToNative_Struct_EmptyFieldError Go struct field reflection has no TypeScript equivalent",
  );
  it.todo(
    "common/types/map_test.go/TestDynamicMapConvertToNative_Struct_PrivateFieldError Go exported-field reflection has no TypeScript equivalent",
  );

  it("common/types/map_test.go/TestStringMapConvertToNative", () => {
    expect(stringStringMap(registry(), { hello: "world" }).convertToNative({})).toEqual({
      hello: "world",
    });
  });

  it("common/types/map_test.go/TestDynamicMapConvertToType", () => {
    expectMapConversions(dynamicMap(registry(), { key: "value" }));
  });

  it("common/types/map_test.go/TestStringMapConvertToType", () => {
    expectMapConversions(stringStringMap(registry(), { key: "value" }));
  });

  it("common/types/map_test.go/TestDynamicMapEqual_True", () => {
    const map = dynamicMap(registry(), { nested: { 1: -1, 2: 2 }, empty: {} });
    expect(map.equal(map)).toBe(True);
    expect(map.equal(map.get(new CelString("nested")))).toBe(False);
  });

  it("common/types/map_test.go/TestStringMapEqual_True", () => {
    const reg = registry();
    const map = stringStringMap(reg, { first: "hello", second: "world" });
    expect(map.equal(dynamicMap(reg, { second: "world", first: "hello" }))).toBe(True);
    expect(map.equal(dynamicMap(reg, jsonStruct({ first: "hello", second: "world" })))).toBe(True);
  });

  it("common/types/map_test.go/TestDynamicMapEqual_NotTrue", () => {
    const reg = registry();
    const map = dynamicMap(reg, { nested: { 1: -1, 2: 2 }, empty: {} });
    expect(map.equal(dynamicMap(reg, { nested: { 1: -1, 2: 2, 3: 3.14 }, empty: {} }))).toBe(False);
    expect(map.equal(NullValue)).toBe(False);
  });

  it("common/types/map_test.go/TestStringMapEqual_NotTrue", () => {
    const reg = registry();
    const map = stringStringMap(reg, { first: "hello", second: "world" });
    expect(map.equal(stringStringMap(reg, { first: "hello", second: "goodbye" }))).toBe(False);
    expect(map.equal(stringStringMap(reg, { first: "hello" }))).toBe(False);
    expect(map.equal(dynamicMap(reg, { first: "hello", second: 1 }))).toBe(False);
  });

  it("common/types/map_test.go/TestDynamicMapGet", () => {
    expectNestedMapLookups(
      dynamicMap(registry(), {
        nested: { 1: new Double(-1), 2: new Double(2) },
        empty: {},
      }),
    );
  });

  it("common/types/map_test.go/TestStringIfaceMapGet", () => {
    expectNestedMapLookups(
      stringInterfaceMap(registry(), {
        nested: { 1: new Double(-1), 2: new Double(2) },
        empty: {},
      }),
    );
  });

  it("common/types/map_test.go/TestStringMapGet", () => {
    const map = stringStringMap(registry(), { first: "hello", second: "world" });
    expect(map.get(new CelString("first"))).toEqual(new CelString("hello"));
    expect(map.get(new Int(1n))).toBeInstanceOf(Err);
    expect(map.get(new CelString("third"))).toBeInstanceOf(Err);
  });

  it("common/types/map_test.go/TestRefValMapGet", () => {
    const reg = registry();
    expectNestedMapLookups(
      refValMap(
        reg,
        new Map([
          [
            new CelString("nested"),
            refValMap(
              reg,
              new Map([
                [new Int(1n), new Double(-1)],
                [new Int(2n), new Double(2)],
              ]),
            ),
          ],
          [new CelString("empty"), refValMap(reg, new Map())],
        ]),
      ),
    );
  });

  it("common/types/map_test.go/TestDynamicMapIterator", () => {
    expectMapIterator(dynamicMap(registry(), { nested: {}, empty: {} }), ["nested", "empty"]);
  });
  it.todo(
    "common/types/map_test.go/TestDynamicMapIterator nil exhaustion cannot return Go nil through the Val contract",
  );

  it("common/types/map_test.go/TestDynamicMapSize", () => {
    expect(dynamicMap(registry(), { first: 1, second: 2 }).size()).toEqual(new Int(2n));
  });

  it("common/types/map_test.go/TestStringMapSize", () => {
    expect(stringStringMap(registry(), { first: "hello", second: "world" }).size()).toEqual(
      new Int(2n),
    );
  });

  it("common/types/map_test.go/TestProtoMapGet", () => {
    const map = protoStringMap();
    expect(map.get(new CelString("hello"))).toEqual(new CelString("world"));
    expect(map.get(new CelString("not_found"))).toBeInstanceOf(Err);
    expect(map.get(new Int(42n))).toBeInstanceOf(Err);
  });

  it("common/types/map_test.go/TestProtoMapString", () => {
    expect(String(stringStringMap(registry(), { hello: "world" }))).toBe("{hello: world}");
  });

  it("common/types/map_test.go/TestProtoMapConvertToNative", () => {
    expect(protoStringMap().convertToNative({})).toEqual({
      hello: "world",
      goodbye: "for now",
      welcome: "back",
    });
  });

  it("common/types/map_test.go/TestProtoMapConvertToNative_NestedProto", () => {
    const reg = registry([createMessage(Proto3TestAllTypesSchema), Proto3TestAllTypesSchema]);
    const message = createMessage(Proto3TestAllTypesSchema, {
      mapInt64NestedType: { "1": createMessage(NestedTestAllTypesSchema) },
    });
    const object = reg.nativeToValue(message) as unknown as { get(index: CelString): Mapper };
    expect(object.get(new CelString("map_int64_nested_type")).convertToNative({})).toEqual({
      "1": message.mapInt64NestedType["1"],
    });
  });

  it("common/types/map_test.go/TestMutableMap", () => {
    const map = mutableMap(DefaultTypeAdapter);
    expect(map.insert(new CelString("first"), new Int(1n))).toBe(map);
    const immutable = map.toImmutableMap();
    expect(immutable.find(new CelString("first"))).toBeDefined();
    map.insert(new CelString("second"), new Int(2n));
    expect(immutable.find(new CelString("second"))).toBeUndefined();
  });

  it("common/types/map_test.go/TestInsertMapKeyValue_MutableMapper", () => {
    const map = mutableMap(DefaultTypeAdapter, new Map([[new CelString("first"), new Int(1n)]]));
    expect(insertMapKeyValue({ map, key: new CelString("second"), value: new Int(2n) })).toBe(map);
    expect(map.find(new CelString("second"))).toBeDefined();
    expect(
      insertMapKeyValue({ map, key: new CelString("second"), value: new Int(3n) }),
    ).toBeInstanceOf(Err);
  });

  it("common/types/map_test.go/TestInsertMapKeyValue_Mapper", () => {
    const map = refValMap(DefaultTypeAdapter, new Map([[new CelString("first"), new Int(1n)]]));
    const modified = insertMapKeyValue({
      map,
      key: new CelString("second"),
      value: new Int(2n),
    }) as Mapper;
    expect(modified).not.toBe(map);
    expect(modified.find(new CelString("first"))).toBeDefined();
    expect(modified.find(new CelString("second"))).toBeDefined();
    expect(
      insertMapKeyValue({ map: modified, key: new CelString("second"), value: new Int(3n) }),
    ).toBeInstanceOf(Err);
  });
});

/** Verifies the standard CEL map conversion contract. */
function expectMapConversions(map: Mapper): void {
  expect(map.convertToType(MapType)).toBe(map);
  expect(map.convertToType(TypeType)).toBe(MapType);
  expect(map.convertToType(ListType)).toBeInstanceOf(Err);
}

/** Verifies nested lookup and missing-key behavior shared by map implementations. */
function expectNestedMapLookups(map: Mapper): void {
  const nested = map.get(new CelString("nested")) as Mapper;
  expect(nested.get(new Int(1n))).toEqual(new Double(-1));
  expect(map.get(new CelString("absent"))).toBeInstanceOf(Err);
  expect(nested.get(new CelString("bad_key"))).toBeInstanceOf(Err);
  const empty = map.get(new CelString("empty")) as Mapper;
  expect(empty.get(new CelString("hello"))).toBeInstanceOf(Err);
}

/** Verifies that a map iterator visits exactly the expected stable keys. */
function expectMapIterator(map: Mapper, expected: string[]): void {
  const iterator = map.iterator();
  const keys: string[] = [];
  while (iterator.hasNext() === True) {
    keys.push((iterator.next() as CelString).value());
  }
  expect(keys).toEqual(expected);
}

/** Creates the canonical protobuf-backed string map used by upstream map tests. */
function protoStringMap(): Mapper {
  const values = { hello: "world", goodbye: "for now", welcome: "back" };
  const reg = registry([
    createMessage(Proto3TestAllTypesSchema, { mapStringString: values }),
    Proto3TestAllTypesSchema,
  ]);
  const object = reg.nativeToValue(
    createMessage(Proto3TestAllTypesSchema, { mapStringString: values }),
  ) as unknown as { get(index: CelString): Mapper };
  return object.get(new CelString("map_string_string"));
}

import { create as createMessage } from "@bufbuild/protobuf";
import { StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  NestedTestAllTypesSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "../../gen/test/proto3pb/test_all_types_pb.js";
import { syncedCases } from "../spec-helpers.js";
import { False, True } from "./bool.js";
import { dynamicMap } from "./map.js";
import { jsonStruct, jsonValue } from "./pb/spec-helpers.js";
import { registry } from "./provider.js";
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
    const [value, found] = mapVal.find(new CelString("hello"));
    expect(found).toBe(true);
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
});

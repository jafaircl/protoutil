import { ListValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { False, True } from "./bool.js";
import { Double } from "./double.js";
import { Int } from "./int.js";
import { dynamicList, stringList } from "./list.js";
import { jsonList } from "./pb/spec-helpers.js";
import { DefaultTypeAdapter, registry } from "./provider.js";
import {
  isProtoListValue,
  resolveListSyncedValue,
  resolveSyncedExpr,
  resolveSyncedVal,
} from "./spec-helpers.js";
import { String as CelString } from "./string.js";
import { ListType, MapType, TypeType } from "./types.js";

describe("list", () => {
  it("common/types/list_test.go/TestBaseListAdd_Empty", () => {
    const reg = registry();
    const list = dynamicList(reg, [true]);
    expect(list.add(dynamicList(reg, []))).toBe(list);
    expect(dynamicList(reg, []).add(list)).toBe(list);
  });

  it("common/types/list_test.go/TestBaseListContains", () => {
    const list = dynamicList(registry(), [new Double(1), new Double(2), new Double(3)]);
    const cases = syncedCases<{ in: unknown; out: unknown }>(
      "common/types/list_test.go/TestBaseListContains",
    );
    for (const testCase of cases) {
      expect((list.contains(resolveSyncedVal(testCase.in)) as { value(): boolean }).value()).toBe(
        resolveSyncedExpr(testCase.out),
      );
    }
  });

  it("common/types/list_test.go/TestBaseListConvertToNative_Json", () => {
    const list = dynamicList(registry(), [new Double(1), new Double(2)]);
    expect(list.convertToNative(ListValueSchema)).toEqual(jsonList([1, 2]));
  });

  it("common/types/list_test.go/TestBaseListConvertToType", () => {
    const list = dynamicList(registry(), ["h", "e", "l", "l", "o"]);
    expect(list.convertToType(ListType)).toBe(list);
    expect(list.convertToType(TypeType)).toBe(ListType);
    expect(String(list.convertToType(MapType))).toContain("type conversion error");
  });

  it("common/types/list_test.go/TestBaseListEqual", () => {
    const reg = registry();
    const listA = dynamicList(reg, ["h", "e", "l", "l", "o"]);
    const listB = dynamicList(reg, ["h", "e", "l", "p", "!"]);
    const listC = reg.nativeToValue(["h", "e", "l", "l", new CelString("o")]);
    expect(listA.equal(listA)).toBe(True);
    expect(listA.equal(listB)).toBe(False);
    expect(listA.equal(listC)).toBe(True);
  });

  it("common/types/list_test.go/TestBaseListGet", () => {
    const list = dynamicList(registry(), [1, 2, 3]);
    expect((list.get(new Int(0n)) as Int).value()).toBe(1n);
    expect((list.get(new Int(1n)) as Int).value()).toBe(2n);
    expect((list.get(new Int(2n)) as Int).value()).toBe(3n);
    expect(String(list.get(new Int(3n)))).toContain("out of range");
  });

  it("common/types/list_test.go/TestListIsZeroValue", () => {
    const cases = syncedCases<{ isZeroValue: boolean; val: unknown }>(
      "common/types/list_test.go/TestListIsZeroValue",
    );
    for (const testCase of cases) {
      const value = resolveListSyncedValue(testCase.val);
      expect(
        (
          (Array.isArray(value) || isProtoListValue(value)
            ? dynamicList(DefaultTypeAdapter, value)
            : value) as unknown as { isZeroValue(): boolean }
        ).isZeroValue(),
      ).toBe(testCase.isZeroValue);
    }
  });

  it("common/types/list_test.go/TestStringListAdd_Heterogenous", () => {
    const reg = registry();
    const actual = stringList(reg, ["hello"]).add(dynamicList(reg, [1, 2])) as {
      convertToNative(typeDesc: unknown): unknown;
    };
    expect(actual.convertToNative([])).toEqual(["hello", 1n, 2n]);
  });

  it("common/types/list_test.go/TestStringListAdd_StringLists", () => {
    const reg = registry();
    const actual = stringList(reg, ["hello"]).add(stringList(reg, ["world"])) as {
      convertToNative(typeDesc: unknown): unknown;
    };
    expect(actual.convertToNative([])).toEqual(["hello", "world"]);
  });

  it("common/types/list_test.go/TestStringListConvertToNative_ListInterface", () => {
    expect(stringList(registry(), ["hello", "world"]).convertToNative([])).toEqual([
      "hello",
      "world",
    ]);
  });

  it("common/types/list_test.go/TestListFold", () => {
    const entries: Array<[number, unknown]> = [];
    (
      dynamicList(registry(), ["hello", 1, true]) as unknown as {
        fold(folder: { foldEntry(index: number, value: unknown): boolean }): void;
      }
    ).fold({
      foldEntry(index: number, value: unknown) {
        entries.push([index as number, value]);
        return true;
      },
    });
    expect(entries).toEqual([
      [0, "hello"],
      [1, 1],
      [2, true],
    ]);
  });
});

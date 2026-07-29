import { AnySchema, ListValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import { False, True } from "./bool.js";
import { Double } from "./double.js";
import { Err } from "./err.js";
import { Int } from "./int.js";
import { JSONStructType } from "./json-value.js";
import { dynamicList, mutableList, refValList, stringList } from "./list.js";
import { jsonList, jsonValue } from "./pb/spec-helpers.js";
import { DefaultTypeAdapter, registry } from "./provider.js";
import {
  isProtoListValue,
  resolveListSyncedValue,
  resolveSyncedExpr,
  resolveSyncedVal,
} from "./spec-helpers.js";
import { String as CelString } from "./string.js";
import type { Lister } from "./traits/index.js";
import { ListType, MapType, TypeType } from "./types.js";
import { Uint } from "./uint.js";

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

  it("common/types/list_test.go/TestBaseListAdd_Error", () => {
    expect(dynamicList(registry(), []).add(new CelString("error"))).toBeInstanceOf(Err);
  });

  it("common/types/list_test.go/TestBaseListConvertToNative", () => {
    expect(dynamicList(registry(), [1, 2]).convertToNative([])).toEqual([1n, 2n]);
  });

  it("common/types/list_test.go/TestBaseListConvertToNative_Any", () => {
    const converted = dynamicList(registry(), [1, 2]).convertToNative(AnySchema);
    expect(converted).toMatchObject({
      $typeName: AnySchema.typeName,
      typeUrl: `type.googleapis.com/${ListValueSchema.typeName}`,
    });
  });

  it("common/types/list_test.go/TestBaseListString", () => {
    expect(String(dynamicList(DefaultTypeAdapter, [1, "hello", 2.1, true, ["world"]]))).toBe(
      "[1, hello, 2.1, true, [world]]",
    );
  });

  it("common/types/list_test.go/TestConcatListString", () => {
    const list = dynamicList(DefaultTypeAdapter, [1, "hello", 2.1, true]).add(
      dynamicList(DefaultTypeAdapter, ["world"]),
    );
    expect(String(list)).toBe("[1, hello, 2.1, true, world]");
  });

  it("common/types/list_test.go/TestValueListGet", () => {
    expectList123(refValList(registry(), [new Int(1n), new Int(2n), new Int(3n)]));
  });

  it("common/types/list_test.go/TestBaseListIterator", () => {
    expectIterator123(dynamicList(registry(), [1, 2, 3]));
  });

  it("common/types/list_test.go/TestValueListValue_Iterator", () => {
    expectIterator123(refValList(registry(), [new Int(1n), new Int(2n), new Int(3n)]));
  });

  it("common/types/list_test.go/TestBaseListNestedList", () => {
    const reg = registry();
    const left = dynamicList(reg, [[1, 2]]);
    const right = dynamicList(reg, [[1n, 2n]]);
    expect(left.equal(right)).toBe(True);
    expect(left.contains(dynamicList(reg, [1n, 2n]))).toBe(True);
    expect(right.contains(dynamicList(reg, [1, 2]))).toBe(True);
  });

  it("common/types/list_test.go/TestBaseListSize", () => {
    const list = dynamicList(registry(), [[1, 2]]);
    expect(list.size()).toEqual(new Int(1n));
    expect((list.get(new Int(0n)) as unknown as Lister).size()).toEqual(new Int(2n));
  });

  it("common/types/list_test.go/TestMutableListGet", () => {
    const list = mutableList(registry());
    list.add(stringList(registry(), ["item"]));
    expect(list.get(new Int(0n)).value()).toBe("item");
  });

  it("common/types/list_test.go/TestConcatListAdd", () => {
    const reg = registry();
    const left = dynamicList(reg, [1, 2]);
    const right = stringList(reg, ["3"]);
    const concat = left.add(right) as typeof left;
    expect(concat.add(left).value()).toEqual([1n, 2n, "3", 1n, 2n]);
    expect(concat.add(stringList(reg, []))).toBe(concat);
    expect(dynamicList(reg, []).add(concat)).toBe(concat);
  });

  it("common/types/list_test.go/TestConcatListConvertToNative_Json", () => {
    const list = dynamicList(registry(), [1, 2]).add(dynamicList(registry(), ["3"]));
    expect(list.convertToNative(ValueSchema)).toEqual(jsonValue([1, 2, "3"]));
  });

  it("common/types/list_test.go/TestConcatListConvertToNativeListInterface", () => {
    const list = dynamicList(registry(), [1, 2]).add(stringList(registry(), ["3.0"]));
    expect(list.convertToNative([])).toEqual([1n, 2n, "3.0"]);
  });

  it("common/types/list_test.go/TestConcatListConvertToType", () => {
    const list = dynamicList(registry(), [1, 2]).add(dynamicList(registry(), ["3"]));
    expect(list.convertToType(ListType)).toBe(list);
    expect(list.convertToType(TypeType)).toBe(ListType);
    expect(list.convertToType(MapType)).toBeInstanceOf(Err);
  });

  it("common/types/list_test.go/TestConcatListContains", () => {
    const reg = registry();
    const list = dynamicList(reg, [1, 2]).add(stringList(reg, ["3"])) as Lister;
    expect(list.contains(new CelString("3"))).toBe(True);
    expect(list.contains(new Double(2))).toBe(True);
    expect(
      (stringList(reg, ["3"]).add(stringList(reg, ["2", "1"])) as Lister).contains(
        new CelString("4"),
      ),
    ).toBe(False);
  });

  it("common/types/list_test.go/TestConcatListContainsNonBool", () => {
    const list = dynamicList(registry(), [1, 2]).add(stringList(registry(), ["3"])) as Lister;
    expect(list.contains(new CelString("4"))).toBe(False);
  });

  it("common/types/list_test.go/TestConcatListEqual", () => {
    const reg = registry();
    const list = dynamicList(reg, [1, 2]).add(dynamicList(reg, [3]));
    expect(list.equal(dynamicList(reg, [1, 2, 3]))).toBe(True);
    expect(list.equal(dynamicList(reg, [1, 3, 2]))).toBe(False);
    expect(list.equal(new CelString("not a list"))).toBe(False);
  });

  it("common/types/list_test.go/TestConcatListGet", () => {
    const list = dynamicList(registry(), [1, 2]).add(dynamicList(registry(), [3])) as Lister;
    expect(list.get(new Int(0n))).toEqual(new Int(1n));
    expect(list.get(new Uint(1n))).toEqual(new Int(2n));
    expect(list.get(new Double(2))).toEqual(new Int(3n));
    expect(list.get(new Int(-1n))).toBeInstanceOf(Err);
    expect(list.get(new Int(3n))).toBeInstanceOf(Err);
  });

  it("common/types/list_test.go/TestConcatListIterator", () => {
    expectIterator123(dynamicList(registry(), [1, 2]).add(dynamicList(registry(), [3])) as Lister);
  });

  it.todo(
    "common/types/list_test.go/TestConcatListIterator nil exhaustion cannot return Go nil through the Val contract",
  );

  it("common/types/list_test.go/TestStringListAdd_Empty", () => {
    const list = stringList(registry(), ["hello"]);
    expect(list.add(stringList(registry(), []))).toBe(list);
    expect(stringList(registry(), []).add(list)).toBe(list);
  });

  it("common/types/list_test.go/TestStringListAdd_Error", () => {
    expect(stringList(registry(), []).add(True)).toBeInstanceOf(Err);
  });

  it("common/types/list_test.go/TestStringListConvertToNative", () => {
    expect(stringList(registry(), ["h", "e", "l", "p"]).convertToNative([])).toEqual([
      "h",
      "e",
      "l",
      "p",
    ]);
  });

  it("common/types/list_test.go/TestStringListConvertToNative_Error", () => {
    expect(() =>
      stringList(registry(), ["h", "e", "l", "p"]).convertToNative(JSONStructType),
    ).toThrow();
  });

  it("common/types/list_test.go/TestStringListConvertToNative_Json", () => {
    const list = stringList(registry(), ["h", "e", "l", "p"]);
    expect(list.convertToNative(ValueSchema)).toEqual(jsonValue(["h", "e", "l", "p"]));
    expect(list.convertToNative(ListValueSchema)).toEqual(jsonList(["h", "e", "l", "p"]));
  });

  it("common/types/list_test.go/TestStringListGet_OutOfRange", () => {
    const list = stringList(registry(), ["hello", "world"]);
    for (const index of [new Int(-1n), new Int(2n), new Double(0.9), new CelString("1")]) {
      expect(list.get(index)).toBeInstanceOf(Err);
    }
  });

  it("common/types/list_test.go/TestValueListAdd", () => {
    const list = refValList(registry(), [new CelString("hello")]).add(
      refValList(registry(), [new CelString("world")]),
    ) as Lister;
    expect(list.contains(new CelString("goodbye"))).toBe(False);
    expect(list.contains(new CelString("hello"))).toBe(True);
  });

  it("common/types/list_test.go/TestValueListConvertToNative_Json", () => {
    const list = refValList(registry(), [new CelString("hello"), new CelString("world")]);
    expect(list.convertToNative(ListValueSchema)).toEqual(jsonList(["hello", "world"]));
  });

  it("common/types/list_test.go/TestMutableList", () => {
    const list = mutableList(DefaultTypeAdapter);
    list.add(refValList(DefaultTypeAdapter, [new CelString("hello")]));
    list.add(refValList(DefaultTypeAdapter, [new CelString("world")]));
    const immutable = list.toImmutableList();
    expect(immutable.size()).toEqual(new Int(2n));
    list.add(refValList(DefaultTypeAdapter, [new CelString("!")]));
    expect(immutable.size()).toEqual(new Int(2n));
  });

  it("common/types/list_test.go/TestConcatListSizeCached", () => {
    let list = dynamicList(registry(), [0]);
    for (let index = 0; index < 200; index += 1) {
      list = list.add(dynamicList(registry(), [0])) as typeof list;
    }
    for (let index = 0; index < 1_000; index += 1) {
      expect(list.size()).toEqual(new Int(201n));
    }
  });
});

/** Asserts the canonical three-element integer list contract. */
function expectList123(list: ReturnType<typeof dynamicList>): void {
  expect(list.get(new Int(0n))).toEqual(new Int(1n));
  expect(list.get(new Int(1n))).toEqual(new Int(2n));
  expect(list.get(new Int(2n))).toEqual(new Int(3n));
}

/** Asserts that a list iterator visits the canonical integer values in order. */
function expectIterator123(list: ReturnType<typeof dynamicList>): void {
  const iterator = list.iterator();
  const values = [];
  while (iterator.hasNext() === True) {
    values.push(iterator.next().value());
  }
  expect(values).toEqual([1n, 2n, 3n]);
}

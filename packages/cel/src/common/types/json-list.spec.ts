import { AnySchema, ListValueSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { False, True } from "./bool.js";
import { Double } from "./double.js";
import { Err } from "./err.js";
import { Int } from "./int.js";
import { jsonListValue, stringList } from "./list.js";
import { jsonList, jsonValue } from "./pb/spec-helpers.js";
import { registry } from "./provider.js";
import { String as CelString } from "./string.js";
import type { Lister } from "./traits/index.js";
import { ListType, MapType, TypeType } from "./types.js";
import { Uint } from "./uint.js";

describe("common/types/json_list_test.go", () => {
  it("common/types/json_list_test.go/TestJsonListValueAdd", () => {
    const reg = registry();
    const prefix = jsonListValue(reg, jsonList(["hello", 1])).add(
      jsonListValue(reg, jsonList([2, 3])),
    ) as Lister;
    const list = prefix.add(stringList(reg, ["goodbye", "world"]));
    expect(list.convertToNative(ListValueSchema)).toEqual(
      jsonList(["hello", 1, 2, 3, "goodbye", "world"]),
    );
  });

  it("common/types/json_list_test.go/TestJsonListValueContains_SingleElemType", () => {
    const list = jsonListValue(registry(), jsonList([3.3, 1]));
    expect(list.contains(new Double(1))).toBe(True);
    expect(list.contains(new Double(2))).toBe(False);
  });

  it("common/types/json_list_test.go/TestJsonListValueContains_MixedElemType", () => {
    const list = jsonListValue(registry(), jsonList(["hello", 1]));
    expect(list.contains(new Double(1))).toBe(True);
    // Contains is semantically equivalent to unrolling the list and applying logical OR between
    // the input and each element. A present value can resolve true; an absent mixed value is false.
    expect(list.contains(new Double(2))).toBe(False);
  });

  it("common/types/json_list_test.go/TestJsonListValueConvertToNative_Json", () => {
    const native = jsonList(["hello", 1]);
    const list = jsonListValue(registry(), native);
    expect(list.convertToNative(ListValueSchema)).toBe(native);
    expect(list.convertToNative(ValueSchema)).toEqual(jsonValue(["hello", 1]));
  });

  it("common/types/json_list_test.go/TestJsonListValueConvertToNative_Slice", () => {
    expect(jsonListValue(registry(), jsonList(["hello", 1])).convertToNative([])).toEqual([
      "hello",
      1,
    ]);
  });

  it("common/types/json_list_test.go/TestJsonListValueConvertToNative_Any", () => {
    const converted = jsonListValue(registry(), jsonList(["hello", 1])).convertToNative(AnySchema);
    expect(converted).toMatchObject({
      $typeName: AnySchema.typeName,
      typeUrl: `type.googleapis.com/${ListValueSchema.typeName}`,
    });
  });

  it("common/types/json_list_test.go/TestJsonListValueConvertToType", () => {
    const list = jsonListValue(registry(), jsonList(["hello", 1]));
    expect(list.convertToType(TypeType)).toBe(ListType);
    expect(list.convertToType(ListType)).toBe(list);
    expect(list.convertToType(MapType)).toBeInstanceOf(Err);
  });

  it("common/types/json_list_test.go/TestJsonListValueEqual", () => {
    const left = jsonListValue(registry(), jsonList([-3, "hello"]));
    const right = jsonListValue(registry(), jsonList([2, "hello"]));
    expect(left.equal(right)).toBe(False);
    expect(right.equal(left)).toBe(False);
    expect(left.equal(left)).toBe(True);
    expect(left.add(left).equal(right)).toBe(False);
    expect(left.equal(True)).toBe(False);
  });

  it("common/types/json_list_test.go/TestJsonListValueGet_OutOfRange", () => {
    const list = jsonListValue(registry(), jsonList(["hello", 1]));
    for (const index of [
      new Int(-1n),
      new Int(2n),
      new CelString("1"),
      new Uint(0xffffffffffffffffn),
    ]) {
      expect(list.get(index)).toBeInstanceOf(Err);
    }
    expect(list.get(new Uint(1n))).toEqual(new Double(1));
  });

  it("common/types/json_list_test.go/TestJsonListValueIterator", () => {
    const list = jsonListValue(registry(), jsonList(["hello", 1, 2, 3]));
    const iterator = list.iterator();
    let index = 0n;
    while (iterator.hasNext() !== False) {
      expect(iterator.next().equal(list.get(new Int(index)))).toBe(True);
      index += 1n;
    }
    expect(iterator.hasNext()).toBe(False);
  });

  it.todo(
    "common/types/json_list_test.go/TestJsonListValueIterator nil exhaustion cannot return Go nil through the Val contract",
  );
});

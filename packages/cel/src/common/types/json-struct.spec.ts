import { AnySchema, StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { False, True } from "./bool.js";
import { Double } from "./double.js";
import { Err } from "./err.js";
import { Int } from "./int.js";
import { dynamicMap, jsonStructMap } from "./map.js";
import { jsonStruct, jsonValue } from "./pb/spec-helpers.js";
import { registry } from "./provider.js";
import { String as CelString } from "./string.js";
import { ListType, MapType, TypeType } from "./types.js";

describe("common/types/json_struct_test.go", () => {
  it("common/types/json_struct_test.go/TestJsonStructContains", () => {
    const map = jsonStructMap(registry(), jsonStruct({ first: "hello", second: 1 }));
    expect(map.contains(new CelString("first"))).toBe(True);
    expect(map.contains(new CelString("firs"))).toBe(False);
  });

  it("common/types/json_struct_test.go/TestJsonStructConvertToNative_Json", () => {
    const native = jsonStruct({ first: "hello", second: 1 });
    const map = jsonStructMap(registry(), native);
    expect(map.convertToNative(ValueSchema)).toEqual(jsonValue({ first: "hello", second: 1 }));
    expect(map.convertToNative(StructSchema)).toBe(native);
  });

  it("common/types/json_struct_test.go/TestJsonStructConvertToNative_Any", () => {
    const converted = jsonStructMap(
      registry(),
      jsonStruct({ first: "hello", second: 1 }),
    ).convertToNative(AnySchema);
    expect(converted).toMatchObject({
      $typeName: AnySchema.typeName,
      typeUrl: `type.googleapis.com/${StructSchema.typeName}`,
    });
  });

  it("common/types/json_struct_test.go/TestJsonStructConvertToNative_Map", () => {
    expect(
      jsonStructMap(registry(), jsonStruct({ first: "hello", second: "world" })).convertToNative(
        {},
      ),
    ).toEqual({ first: "hello", second: "world" });
  });

  it("common/types/json_struct_test.go/TestJsonStructConvertToType", () => {
    const map = jsonStructMap(registry(), jsonStruct({ first: "hello", second: 1 }));
    expect(map.convertToType(MapType)).toBe(map);
    expect(map.convertToType(TypeType)).toBe(MapType);
    expect(map.convertToType(ListType)).toBeInstanceOf(Err);
  });

  it("common/types/json_struct_test.go/TestJsonStructEqual", () => {
    const reg = registry();
    const map = jsonStructMap(reg, jsonStruct({ first: "hello", second: 4 }));
    expect(map.equal(map)).toBe(True);
    expect(map.equal(jsonStructMap(reg, jsonStruct({})))).toBe(False);
    expect(map.equal(new CelString(""))).toBe(False);
    expect(map.equal(jsonStructMap(reg, jsonStruct({ first: "hello", second: 1 })))).toBe(False);
    expect(map.equal(jsonStructMap(reg, jsonStruct({ first: "hello", third: 4 })))).toBe(False);
    expect(map.equal(dynamicMap(reg, { 1: "hello", 2: "world" }))).toBe(False);
  });

  it("common/types/json_struct_test.go/TestJsonStructGet", () => {
    expect(jsonStructMap(registry(), jsonStruct({})).get(new Int(1n))).toBeInstanceOf(Err);
    const map = jsonStructMap(registry(), jsonStruct({ first: "hello", second: 4 }));
    expect(map.get(new CelString("first"))).toEqual(new CelString("hello"));
    expect(map.get(new CelString("second"))).toEqual(new Double(4));
    expect(map.get(new CelString("third"))).toBeInstanceOf(Err);
  });
});

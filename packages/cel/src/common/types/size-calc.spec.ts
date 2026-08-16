import { create } from "@bufbuild/protobuf";
import { reflect } from "@bufbuild/protobuf/reflect";
import { TestAllTypesSchema as Proto3TestAllTypesSchema } from "@protoutil/testing/cel/proto3";
import { describe, expect, it } from "vitest";
import { syncedCases } from "../spec-helpers.js";
import type { AggregateSizer, AggregateSizeVisitor } from "./aggregate-sizer.js";
import { True } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { durationOf } from "./duration.js";
import { err } from "./err.js";
import { Int } from "./int.js";
import { refValList } from "./list.js";
import { stringStringMap } from "./map.js";
import { NullValue } from "./null.js";
import { object } from "./object.js";
import { OptionalNone, optionalOf } from "./optional.js";
import { MAX_UINT32 } from "./overflow.js";
import { DefaultTypeAdapter } from "./provider.js";
import { SizeCalculator } from "./size-calc.js";
import { String as CelString } from "./string.js";
import { timestampOf } from "./timestamp.js";
import { IntType } from "./types.js";
import { Unknown } from "./unknown.js";

/** goOnly marks synced cases whose Go input has no TypeScript analogue. */
const goOnly = Symbol("go-only");

describe("common/types size calculator", () => {
  it("common/types/size_calc_test.go/TestCalculateSize", () => {
    const cases = syncedCases<{ name: string; val: unknown; want: number }>(
      "common/types/size_calc_test.go/TestCalculateSize",
    );
    const calculator = new SizeCalculator();
    let exercised = 0;
    for (const testCase of cases) {
      const input = resolveSizeCalcInput(testCase.name);
      if (input === goOnly) {
        continue;
      }
      expect(calculator.aggregateSize(input), testCase.name).toBe(testCase.want);
      exercised += 1;
    }
    // Guard against the resolver silently degrading into an all-skipped no-op.
    expect(exercised).toBeGreaterThan(20);
  });

  it("saturates at the traversal limit", () => {
    const calculator = new SizeCalculator({ maxTraversal: 3 });
    expect(
      calculator.aggregateSize(
        refValList(DefaultTypeAdapter, [new Int(1n), new Int(2n), new Int(3n), new Int(4n)]),
      ),
    ).toBe(MAX_UINT32);
  });

  it("saturates at the depth limit", () => {
    const shallow = new SizeCalculator({ maxDepth: 1 });
    const nested = refValList(DefaultTypeAdapter, [
      refValList(DefaultTypeAdapter, [new Int(1n)]) as unknown as Int,
    ]);
    expect(shallow.aggregateSize(nested)).toBe(MAX_UINT32);
  });

  it("measures optionals", () => {
    const calculator = new SizeCalculator();
    expect(calculator.aggregateSize(OptionalNone)).toBe(0);
    expect(calculator.aggregateSize(optionalOf(new CelString("abc")))).toBe(4);
  });

  it("defers to a custom AggregateSizeVisitor", () => {
    const visitor: AggregateSizeVisitor = {
      aggregateSize(_sizer: AggregateSizer): number {
        return 100;
      },
    };
    expect(new SizeCalculator().aggregateSize(visitor)).toBe(100);
  });
});

/**
 * resolveSizeCalcInput maps one synced Go input expression onto its TypeScript analogue.
 */
function resolveSizeCalcInput(name: string): unknown {
  switch (name) {
    case "aggregate_sizer_list":
      return refValList(DefaultTypeAdapter, [new Int(1n), new Int(2n)]);
    case "sizer_string":
      return new CelString("hello");
    case "sizer_bytes":
      return new Bytes(new TextEncoder().encode("world"));
    case "err_val":
      return err("test error");
    case "unknown_val":
      return new Unknown(new Map([[0, []]]));
    case "type_val":
      return IntType;
    case "null_val":
      return NullValue;
    case "scalar_ref_val_int":
      return new Int(42n);
    case "scalar_ref_val_double":
      return new Double(1.5);
    case "scalar_ref_val_bool":
      return True;
    case "scalar_ref_val_timestamp":
      return timestampOf(100n, 0);
    case "scalar_ref_val_duration":
      return durationOf(1_000_000_000n);
    case "proto_message":
      return object(
        DefaultTypeAdapter,
        Proto3TestAllTypesSchema,
        IntType,
        create(Proto3TestAllTypesSchema, { singleString: "hello" }),
      );
    case "proto_message_with_list_and_map":
      return object(
        DefaultTypeAdapter,
        Proto3TestAllTypesSchema,
        IntType,
        create(Proto3TestAllTypesSchema, {
          repeatedString: ["a", "b"],
          mapStringString: { k: "v" },
        }),
      );
    case "protoreflect_message":
      return reflect(
        Proto3TestAllTypesSchema,
        create(Proto3TestAllTypesSchema, { singleInt64: 10n }),
      );
    case "protoreflect_list":
      return ["a", "b"];
    case "protoreflect_map":
      return stringStringMap(DefaultTypeAdapter, { k: "v" });
    case "native_string":
      return "hello";
    case "native_bytes":
      return new TextEncoder().encode("world");
    case "native_int":
      return 42;
    case "native_float":
      return 3.14;
    case "native_bool":
      return true;
    case "native_time":
      return new Date();
    case "native_duration":
      return 3_600_000_000_000n;
    case "native_nil":
      return null;
    case "custom_struct":
      return { name: "cel" };
    case "custom_lister":
      return refValList(DefaultTypeAdapter, [new CelString("a"), new CelString("b")]);
    case "custom_mapper":
    case "custom_pure_mapper":
      return stringStringMap(DefaultTypeAdapter, { key: "val" });
    // Go-specific inputs: protoreflect scalar wrappers and map keys, typed-nil pointers,
    // reflect.Value handles, and struct fields typed as Go interfaces.
    case "proto_value_string":
    case "proto_value_bytes":
    case "proto_value_int":
    case "proto_map_key":
    case "nil_proto_message":
    case "reflect_value":
    case "custom_sizer_struct_field":
    case "custom_visitor_struct_field":
    case "custom_sizer_pointer":
    case "custom_visitor_pointer":
      return goOnly;
    default:
      throw new Error(`unsupported synced size calculation case: ${name}`);
  }
}

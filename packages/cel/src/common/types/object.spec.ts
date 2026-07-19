import { create, type DescMessage, type Message } from "@bufbuild/protobuf";
import { type Any, AnySchema, anyUnpack, ValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, test } from "vitest";
import {
  ConstantSchema,
  Expr_CallSchema,
  ExprSchema,
  ParsedExprSchema,
  SourceInfoSchema,
} from "../../gen/cel/expr/syntax_pb.js";
import { anyValueType } from "./any-value.js";
import { Bool, False, True } from "./bool.js";
import { Bytes } from "./bytes.js";
import { Double } from "./double.js";
import { isError } from "./err.js";
import { Int, IntZero } from "./int.js";
import { JSONValueType } from "./json-value.js";
import { NullValue } from "./null.js";
import { object, type protoObj } from "./object.js";
import type { Type as RefType, TypeAdapter, Val } from "./ref/index.js";
import { String as CelString } from "./string.js";
import { objectType, TypeType } from "./types.js";

describe("common/types/object_test.go", () => {
  test("common/types/object_test.go/TestNewProtoObject", () => {
    const adapter = new testAdapter();
    const parsedExpr = create(ParsedExprSchema, {
      sourceInfo: create(SourceInfoSchema, {
        lineOffsets: [1, 2, 3],
      }),
    });
    const obj = adapter.nativeToValue(parsedExpr) as protoObj;
    const si = obj.get(new CelString("source_info")) as protoObj;
    const lo = si.get(new CelString("line_offsets")) as testList;
    expectTrue(lo.get(new Int(2n)).equal(new Int(3n)));
    const expr = obj.get(new CelString("expr")) as protoObj;
    const call = expr.get(new CelString("call_expr")) as protoObj;
    expectTrue(call.get(new CelString("function")).equal(new CelString("")));
  });

  test("common/types/object_test.go/TestProtoObjectConvertToNative", () => {
    const adapter = new testAdapter();
    const msg = create(ParsedExprSchema, {
      expr: create(ExprSchema, {
        id: 1n,
        exprKind: {
          case: "constExpr",
          value: create(ConstantSchema, {
            constantKind: { case: "boolValue", value: true },
          }),
        },
      }),
      sourceInfo: create(SourceInfoSchema, {
        lineOffsets: [1, 2, 3],
      }),
    });
    const objVal = adapter.nativeToValue(msg) as protoObj;

    expect(objVal.convertToNative(ParsedExprSchema)).toEqual(msg);

    const anyVal = objVal.convertToNative(anyValueType);
    const unpackedAny = anyUnpack(anyVal as Any, ParsedExprSchema);
    expect(unpackedAny).toEqual(msg);

    const jsonVal = objVal.convertToNative(JSONValueType);
    expect(jsonVal).toEqual(
      create(ValueSchema, {
        kind: {
          case: "structValue",
          value: {
            fields: {
              expr: {
                kind: {
                  case: "structValue",
                  value: {
                    fields: {
                      id: { kind: { case: "stringValue", value: "1" } },
                      constExpr: {
                        kind: {
                          case: "structValue",
                          value: {
                            fields: {
                              boolValue: { kind: { case: "boolValue", value: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              sourceInfo: {
                kind: {
                  case: "structValue",
                  value: {
                    fields: {
                      lineOffsets: {
                        kind: {
                          case: "listValue",
                          value: {
                            values: [
                              { kind: { case: "numberValue", value: 1 } },
                              { kind: { case: "numberValue", value: 2 } },
                              { kind: { case: "numberValue", value: 3 } },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
  });

  test("common/types/object_test.go/TestProtoObjectIsSet", () => {
    const adapter = new testAdapter();
    const msg = create(ParsedExprSchema, {
      sourceInfo: create(SourceInfoSchema, { lineOffsets: [1, 2, 3] }),
    });
    const objVal = adapter.nativeToValue(msg) as protoObj;
    expect(objVal.isSet(new CelString("source_info"))).toBe(True);
    expect(objVal.isSet(new CelString("expr"))).toBe(False);
    expect(isError(objVal.isSet(new CelString("bad_field")))).toBe(true);
    expect(isError(objVal.isSet(IntZero))).toBe(true);
  });

  test("common/types/object_test.go/TestProtoObjectIsZeroValue", () => {
    const adapter = new testAdapter();
    const emptyObj = adapter.nativeToValue(create(ParsedExprSchema)) as protoObj;
    expect(emptyObj.isZeroValue()).toBe(true);
    const obj = adapter.nativeToValue(
      create(ExprSchema, {
        exprKind: {
          case: "callExpr",
          value: create(Expr_CallSchema),
        },
      }),
    ) as protoObj;
    expect(obj.isZeroValue()).toBe(false);
  });

  test("common/types/object_test.go/TestProtoObjectGet", () => {
    const adapter = new testAdapter();
    const msg = create(ParsedExprSchema, {
      sourceInfo: create(SourceInfoSchema, { lineOffsets: [1, 2, 3] }),
    });
    const objVal = adapter.nativeToValue(msg) as protoObj;
    expect(
      objVal.get(new CelString("source_info")).equal(adapter.nativeToValue(msg.sourceInfo!)),
    ).toBe(True);
    expect(objVal.get(new CelString("expr")).equal(adapter.nativeToValue(create(ExprSchema)))).toBe(
      True,
    );
    expect(isError(objVal.get(new CelString("bad_field")))).toBe(true);
    expect(isError(objVal.get(IntZero))).toBe(true);
  });

  test("common/types/object_test.go/TestProtoObjectConvertToType", () => {
    const adapter = new testAdapter();
    const msg = create(ParsedExprSchema, {
      sourceInfo: create(SourceInfoSchema, { lineOffsets: [1, 2, 3] }),
    });
    const objVal = adapter.nativeToValue(msg) as protoObj;
    const tv = objVal.type() as unknown as Val;
    expectTrue(objVal.convertToType(TypeType).equal(tv));
    expect(objVal.convertToType(objVal.type())).toBe(objVal);
  });
});

class testAdapter implements TypeAdapter {
  public nativeToValue(value: unknown): Val {
    if (value === null || value === undefined) {
      return NullValue;
    }
    if (
      value instanceof Bool ||
      value instanceof Int ||
      value instanceof Double ||
      value instanceof Bytes ||
      value instanceof CelString
    ) {
      return value;
    }
    if (typeof value === "boolean") {
      return value ? True : False;
    }
    if (typeof value === "number") {
      return new Double(value);
    }
    if (typeof value === "bigint") {
      return new Int(value);
    }
    if (typeof value === "string") {
      return new CelString(value);
    }
    if (value instanceof Uint8Array) {
      return new Bytes(value);
    }
    if (Array.isArray(value)) {
      return new testList(this, value);
    }
    if (isMessage(value)) {
      return object(this, schemaForMessage(value), objectType(value.$typeName), value);
    }
    throw new Error(`unsupported conversion to ref.Val: ${String(value)}`);
  }
}

class testList implements Val {
  constructor(
    private readonly adapter: testAdapter,
    private readonly values: unknown[],
  ) {}

  public convertToNative(): unknown {
    return this.values;
  }

  public convertToType(): Val {
    return this;
  }

  public equal(other: Val): Val {
    const value = other.value();
    if (!Array.isArray(value) || value.length !== this.values.length) {
      return False;
    }
    return value.every(
      (entry, index) =>
        this.adapter.nativeToValue(this.values[index]!).equal(this.adapter.nativeToValue(entry)) ===
        True,
    )
      ? True
      : False;
  }

  public get(index: Val): Val {
    return this.adapter.nativeToValue(this.values[Number(index.value())]);
  }

  public type(): RefType {
    return objectType("list");
  }

  public value(): unknown {
    return this.values;
  }
}

function schemaForMessage(message: Message): DescMessage {
  switch (message.$typeName) {
    case ParsedExprSchema.typeName:
      return ParsedExprSchema;
    case SourceInfoSchema.typeName:
      return SourceInfoSchema;
    case ExprSchema.typeName:
      return ExprSchema;
    case Expr_CallSchema.typeName:
      return Expr_CallSchema;
    case ConstantSchema.typeName:
      return ConstantSchema;
    case AnySchema.typeName:
      return AnySchema;
    default:
      throw new Error(`unknown schema for message ${message.$typeName}`);
  }
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName: unknown }).$typeName === "string"
  );
}

function expectTrue(value: Val) {
  expect(value).toEqual(True);
}

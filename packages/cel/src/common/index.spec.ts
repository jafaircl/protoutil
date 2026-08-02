import { describe, expect, it } from "vitest";
import {
  config,
  configContextVariable,
  configFunc,
  configOverload,
  configTypeDesc,
  configVariable,
  constant,
  func,
  Int,
  IntType,
  memberOverload,
  overload,
  StringType,
  variable,
} from "../index.js";

describe("root public API", () => {
  it("exports concise CEL declaration builders", () => {
    const identity = func("identity", {
      overloads: [overload("identity_string", [StringType], StringType)],
    });

    expect(variable("message", StringType).name()).toBe("message");
    expect(constant("count", IntType, new Int(1n)).value()).toStrictEqual(new Int(1n));
    expect(identity.name()).toBe("identity");
    expect(memberOverload("string_identity", [StringType], StringType).isMemberFunction()).toBe(
      true,
    );
  });

  it("exports prefixed serialized configuration builders", () => {
    const stringType = configTypeDesc({ typeName: "string" });
    const configuredFunction = configFunc({
      name: "identity",
      overloads: [
        configOverload({
          id: "identity_string",
          args: [stringType],
          returnType: stringType,
        }),
      ],
    });

    expect(
      config({
        name: "public-api",
        contextVariable: configContextVariable("google.protobuf.StringValue"),
        variables: [configVariable({ name: "message", type: stringType })],
        functions: [configuredFunction],
      }).name,
    ).toBe("public-api");
  });
});

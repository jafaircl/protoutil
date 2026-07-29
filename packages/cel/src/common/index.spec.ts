import { describe, expect, it } from "vitest";
import {
  config,
  contextVariable,
  extension,
  feature,
  func,
  importType,
  librarySubset,
  limit,
  overload,
  typeDesc,
  validator,
  variable,
} from "./index.js";

describe("common public API", () => {
  it("exports functional environment configuration factories", () => {
    const stringType = typeDesc({ typeName: "string" });
    const configuredOverload = overload({
      id: "identity_string",
      args: [stringType],
      returnType: stringType,
    });
    const fn = func({ name: "identity", overloads: [configuredOverload] });

    expect(
      config({
        name: "public-api",
        imports: [importType("google.protobuf.StringValue")],
        stdlib: librarySubset({ includeFunctions: [fn] }),
        extensions: [extension("optional", "1")],
        contextVariable: contextVariable("google.protobuf.StringValue"),
        variables: [variable({ name: "message", type: stringType })],
        functions: [fn],
        validators: [validator("cel.validator.duration")],
        features: [feature("cel.feature.macro_call_tracking", true)],
        limits: [limit("comprehension_nesting", 10)],
      }).name,
    ).toBe("public-api");
  });
});

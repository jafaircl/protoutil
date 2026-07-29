import { setExtension } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { container } from "../common/containers.js";
import { functionDecl, memberOverload, variableDecl } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { True } from "../common/types/bool.js";
import { registry } from "../common/types/provider.js";
import type { Indexer } from "../common/types/traits/index.js";
import { BoolType, DynType, objectType, StringType } from "../common/types/types.js";
import {
  type ExampleType,
  ExtendedExampleType_enum_ext,
  ExtendedExampleType_extended_examples,
  file_test_proto2pb_test_all_types,
  GlobalEnum,
} from "../gen/test/proto2pb/test_all_types_pb.js";
import {
  file_test_proto2pb_test_extensions,
  int32_ext,
  int32_wrapper_ext,
  nested_example,
} from "../gen/test/proto2pb/test_extensions_pb.js";
import { protos } from "./protos.js";

/** ProtosCase describes a synchronized protobuf extension expression. */
interface ProtosCase {
  /** err contains the expected parser error fragment. */
  readonly err?: string;
  /** expr contains the CEL source expression. */
  readonly expr: string;
}

describe("ext/protos_test.go/TestProtos", () => {
  it("evaluates every synchronized protobuf extension case", () => {
    const celEnv = protosEnv();
    const msg = messageWithExtensions();
    for (const testCase of syncedCases<ProtosCase>("ext/protos_test.go/TestProtos")) {
      expect(
        celEnv.program(celEnv.compile(testCase.expr)).eval({ msg }).value(),
        testCase.expr,
      ).toBe(true);
    }
  });
});

describe("ext/protos_test.go/TestProtosNonMatch", () => {
  it("leaves receiver calls outside the proto namespace unexpanded", () => {
    const celEnv = protosEnv([
      functionDecl("getExt", {
        overloads: [
          memberOverload("msg_getExt_field_default", [DynType, StringType, DynType], DynType, {
            functionBinding: (message, field) => (message as unknown as Indexer).get(field),
          }),
        ],
      }),
      functionDecl("hasExt", {
        overloads: [
          memberOverload("msg_hasExt_field_any", [DynType, StringType, DynType], BoolType, {
            functionBinding: () => True,
          }),
        ],
      }),
    ]);
    const msg = messageWithExtensions();
    for (const testCase of syncedCases<ProtosCase>("ext/protos_test.go/TestProtosNonMatch")) {
      expect(
        celEnv.program(celEnv.compile(testCase.expr)).eval({ msg }).value(),
        testCase.expr,
      ).toBe(true);
    }
  });
});

describe("ext/protos_test.go/TestProtosParseErrors", () => {
  it("reports every synchronized invalid extension field", () => {
    const celEnv = protosEnv();
    for (const testCase of syncedCases<ProtosCase>("ext/protos_test.go/TestProtosParseErrors")) {
      const expected =
        testCase.expr === "ExampleType{}.in"
          ? "Syntax error"
          : normalizeDisplay(testCase.err ?? "");
      expect(
        normalizeDisplay(celEnv.tryParse(testCase.expr).errors?.toDisplayString() ?? ""),
        testCase.expr,
      ).toContain(expected);
    }
  });
});

describe("ext/protos_test.go/TestProtosWithExtension", () => {
  it("applies the singleton library only once", () => {
    const celEnv = protosEnv().extend({ libraries: [protos()] });
    expect(() =>
      celEnv.compile("proto.getExt(ExampleType{}, google.expr.proto2.test.int32_ext) == 0"),
    ).not.toThrow();
  });
});

describe("ext/protos_test.go/TestProtosVersion", () => {
  it("accepts version zero", () => {
    expect(() => env({ libraries: [protos({ version: 0 })] })).not.toThrow();
  });
});

/**
 * protosEnv creates the shared proto2 extension environment.
 */
function protosEnv(functions: ReturnType<typeof functionDecl>[] = []) {
  const typeRegistry = registry();
  typeRegistry.registerDescriptor(file_test_proto2pb_test_all_types);
  typeRegistry.registerDescriptor(file_test_proto2pb_test_extensions);
  return env({
    container: container({ name: "google.expr.proto2.test" }),
    functions,
    libraries: [protos()],
    registry: typeRegistry,
    variables: [variableDecl("msg", objectType("google.expr.proto2.test.ExampleType"))],
  });
}

/**
 * messageWithExtensions creates an example message with every tested extension set.
 */
function messageWithExtensions(): ExampleType {
  const msg = {
    $typeName: "google.expr.proto2.test.ExampleType",
    name: "example0",
  } as ExampleType;
  setExtension(msg, int32_ext, 42);
  setExtension(msg, int32_wrapper_ext, 21);
  setExtension(msg, nested_example, {
    $typeName: "google.expr.proto2.test.ExampleType",
    name: "nested",
  } as ExampleType);
  setExtension(msg, ExtendedExampleType_enum_ext, GlobalEnum.GAZ);
  setExtension(msg, ExtendedExampleType_extended_examples, ["example1", "example2"]);
  return msg;
}

/**
 * normalizeDisplay removes Go fixture indentation which is not part of the diagnostic.
 */
function normalizeDisplay(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n");
}

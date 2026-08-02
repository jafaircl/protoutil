import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { variableDecl } from "../common/decls.js";
import {
  attributeTrail,
  String as CelString,
  DynType,
  Err,
  Int,
  OptionalNone,
  objectType,
  registry,
  StringType,
  unknown,
} from "../common/types/index.js";
import { TestAllTypesSchema } from "../gen/test/proto3pb/test_all_types_pb.js";
import { activation } from "./activation.js";
import { attributeAccessor } from "./index.js";

describe("TypeScript extension/AttributeAccessor", () => {
  it("resolves one checked field path against multiple activations", () => {
    const celEnv = env({ variables: [variableDecl("request", DynType)] });
    const ast = celEnv.compile("request.auth.subject");
    const accessor = attributeAccessor({
      ast,
      expr: ast.expr(),
      adapter: celEnv.typeAdapter(),
      provider: celEnv.typeProvider(),
    });

    expect(accessor?.path).toEqual({
      variable: "request",
      fields: ["auth", "subject"],
      display: "request.auth.subject",
    });
    const alice = accessor?.resolve(
      activation({ bindings: { request: { auth: { subject: "alice" } } } }),
    );
    const bob = accessor?.resolve(
      activation({ bindings: { request: { auth: { subject: "bob" } } } }),
    );

    expect(alice).toBeInstanceOf(CelString);
    expect(alice?.value()).toBe("alice");
    expect(bob).toBeInstanceOf(CelString);
    expect(bob?.value()).toBe("bob");
  });

  it("resolves protobuf fields with the environment provider and adapter", () => {
    const typeRegistry = registry();
    typeRegistry.registerDescriptor(TestAllTypesSchema.file);
    const celEnv = env({
      registry: typeRegistry,
      variables: [variableDecl("message", objectType(TestAllTypesSchema.typeName))],
    });
    const ast = celEnv.compile("message.single_int32");
    const accessor = attributeAccessor({
      ast,
      expr: ast.expr(),
      adapter: celEnv.typeAdapter(),
      provider: celEnv.typeProvider(),
    });

    const result = accessor?.resolve(
      activation({
        bindings: { message: create(TestAllTypesSchema, { singleInt32: 42 }) },
      }),
    );

    expect(result).toBeInstanceOf(Int);
    expect(result?.value()).toBe(42n);
  });

  it("uses checked references to resolve qualified variables", () => {
    const celEnv = env({ variables: [variableDecl("request.auth", StringType)] });
    const ast = celEnv.compile("request.auth");
    const accessor = attributeAccessor({
      ast,
      expr: ast.expr(),
      adapter: celEnv.typeAdapter(),
      provider: celEnv.typeProvider(),
    });

    const result = accessor?.resolve(activation({ bindings: { "request.auth": "qualified" } }));

    expect(accessor?.path).toEqual({
      variable: "request.auth",
      fields: [],
      display: "request.auth",
    });
    expect(result).toBeInstanceOf(CelString);
    expect(result?.value()).toBe("qualified");
  });

  it("returns CEL errors without another result wrapper", () => {
    const celEnv = env({ variables: [variableDecl("request", DynType)] });
    const ast = celEnv.compile("request.auth");
    const accessor = attributeAccessor({
      ast,
      expr: ast.expr(),
      adapter: celEnv.typeAdapter(),
      provider: celEnv.typeProvider(),
    });

    const result = accessor?.resolve(activation({ bindings: { request: {} } }));

    expect(result).toBeInstanceOf(Err);
  });

  it("returns unknown and optional CEL values unchanged", () => {
    const celEnv = env({ variables: [variableDecl("request", DynType)] });
    const ast = celEnv.compile("request");
    const accessor = attributeAccessor({
      ast,
      expr: ast.expr(),
      adapter: celEnv.typeAdapter(),
      provider: celEnv.typeProvider(),
    });
    const unknownValue = unknown(1, attributeTrail("request"));

    expect(accessor?.resolve(activation({ bindings: { request: unknownValue } }))).toBe(
      unknownValue,
    );
    expect(accessor?.resolve(activation({ bindings: { request: OptionalNone } }))).toBe(
      OptionalNone,
    );
  });

  it("returns undefined for calls and presence tests", () => {
    const celEnv = env({ variables: [variableDecl("request", DynType)] });
    const callAst = celEnv.compile('request.auth == "admin"');
    const presenceAst = celEnv.compile("has(request.auth)");

    for (const ast of [callAst, presenceAst]) {
      expect(
        attributeAccessor({
          ast,
          expr: ast.expr(),
          adapter: celEnv.typeAdapter(),
          provider: celEnv.typeProvider(),
        }),
      ).toBeUndefined();
    }
  });

  it("rejects an unchecked AST", () => {
    const celEnv = env({ variables: [variableDecl("request", DynType)] });
    const ast = celEnv.parse("request.auth");

    expect(() =>
      attributeAccessor({
        ast,
        expr: ast.expr(),
        adapter: celEnv.typeAdapter(),
        provider: celEnv.typeProvider(),
      }),
    ).toThrow("attribute accessor requires a checked AST");
  });
});

import { create } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "./cel/env.js";
import { toProto } from "./common/ast/index.js";
import { runtime } from "./runtime.js";

describe("runtime", () => {
  it("evaluates a checked expression against a context protobuf", () => {
    const checked = unwrapAst(env({ contextProto: TimestampSchema }).compile("seconds == 1"));
    const program = runtime({ contextProto: TimestampSchema }).program(checked);

    expect(program.eval(create(TimestampSchema, { seconds: 1n })).value()).toBe(true);
  });

  it("evaluates a checked-expression protobuf", () => {
    const checked = unwrapAst(env({ contextProto: TimestampSchema }).compile("seconds == 1"));
    const program = runtime({ contextProto: TimestampSchema }).program(toProto(checked));

    expect(program.eval(create(TimestampSchema, { seconds: 1n })).value()).toBe(true);
  });

  it("evaluates an unchecked parsed AST", () => {
    const parsed = unwrapAst(env().parse("1 == 1"));

    expect(runtime().program(parsed).eval({}).value()).toBe(true);
  });

  it("evaluates a parsed-expression protobuf", () => {
    const parsed = unwrapAst(env().parse("1 == 1"));

    expect(runtime().program(parsed.toParsedExpr()).eval({}).value()).toBe(true);
  });
});

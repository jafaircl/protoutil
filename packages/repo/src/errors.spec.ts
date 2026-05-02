import { describe, expect, it } from "vitest";
import {
  RepoErrorCode,
  UnexpectedInterceptorContextError,
  UnsupportedQueryTypeRepoError,
} from "./errors.js";
import { expectOperation } from "./interceptors.js";
import type { InterceptorContext } from "./types.js";

describe("repo errors", () => {
  it("throws typed coded error for unexpected interceptor context", () => {
    const ctx = {
      operation: "create",
      schema: {} as never,
      tableName: "users",
      contextValues: new Map() as never,
      resource: {},
    } as unknown as InterceptorContext<never>;
    expect(() => expectOperation(ctx, "get")).toThrow(UnexpectedInterceptorContextError);
    try {
      expectOperation(ctx, "get");
    } catch (error) {
      expect(error).toBeInstanceOf(UnexpectedInterceptorContextError);
      expect((error as UnexpectedInterceptorContextError).code).toBe(
        RepoErrorCode.UNEXPECTED_INTERCEPTOR_CONTEXT,
      );
    }
  });

  it("assigns stable code for unsupported query types", () => {
    const error = new UnsupportedQueryTypeRepoError(
      "sqlite",
      "string",
      "object",
      "SQLite engine only supports string queries",
    );
    expect(error.code).toBe(RepoErrorCode.UNSUPPORTED_QUERY_TYPE);
    expect(error.engine).toBe("sqlite");
    expect(error.expected).toBe("string");
    expect(error.received).toBe("object");
  });
});

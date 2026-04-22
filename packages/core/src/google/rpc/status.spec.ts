import { create } from "@bufbuild/protobuf";
import { anyPack, StringValueSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { Code } from "../../gen/google/rpc/code_pb.js";
import { StatusSchema } from "../../gen/google/rpc/status_pb.js";
import { assertValidStatus, isValidStatus, status } from "./status.js";

interface InvalidStatusCase {
  value: ReturnType<typeof create<typeof StatusSchema>>;
  error: string;
}

describe("google/rpc status helpers", () => {
  it("creates valid statuses with and without details", () => {
    const packedDetail = anyPack(
      StringValueSchema,
      create(StringValueSchema, { value: "books/123 was not found" }),
    );
    const cases = [
      {
        value: status(Code.OK, "OK"),
        expected: {
          code: Code.OK,
          message: "OK",
          details: [],
        },
      },
      {
        value: status(Code.NOT_FOUND, "Book not found", [packedDetail]),
        expected: {
          code: Code.NOT_FOUND,
          message: "Book not found",
          details: [packedDetail],
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toEqual(expect.objectContaining(tc.expected));
    }
  });

  it("rejects unknown and out-of-range status codes", () => {
    const cases: InvalidStatusCase[] = [
      {
        value: create(StatusSchema, {
          code: -1,
          message: "bad",
        }),
        error: "invalid google.rpc.Code value",
      },
      {
        value: create(StatusSchema, {
          code: 17,
          message: "bad",
        }),
        error: "invalid google.rpc.Code value",
      },
      {
        value: create(StatusSchema, {
          code: 2 ** 31,
          message: "bad",
        }),
        error: "out-of-range Int32",
      },
      {
        value: {
          code: Code.UNKNOWN,
          message: 123,
          details: [],
        } as unknown as ReturnType<typeof create<typeof StatusSchema>>,
        error: "message must be a string",
      },
      {
        value: {
          code: Code.UNKNOWN,
          message: "bad",
          details: "nope",
        } as unknown as ReturnType<typeof create<typeof StatusSchema>>,
        error: "details must be an array of google.protobuf.Any",
      },
      {
        value: {
          code: Code.UNKNOWN,
          message: "bad",
          details: [create(StringValueSchema, { value: "not packed" })],
        } as unknown as ReturnType<typeof create<typeof StatusSchema>>,
        error: "details must contain only google.protobuf.Any values",
      },
    ];

    for (const tc of cases) {
      expect(() => assertValidStatus(tc.value)).toThrow(tc.error);
    }
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      create(StatusSchema, { code: Code.OK, message: "OK" }),
      create(StatusSchema, { code: Code.NOT_FOUND, message: "Book not found" }),
    ];
    const invalidCases = [
      create(StatusSchema, { code: -1, message: "bad" }),
      create(StatusSchema, { code: 99, message: "bad" }),
    ];

    for (const tc of validCases) {
      expect(() => assertValidStatus(tc)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(isValidStatus(tc)).toBe(false);
    }
  });

  it("reports validity without throwing", () => {
    const cases = [
      {
        value: status(Code.PERMISSION_DENIED, "Forbidden"),
        expected: true,
      },
      {
        value: create(StatusSchema, {
          code: 42,
          message: "Unknown status",
        }),
        expected: false,
      },
    ];

    for (const tc of cases) {
      expect(isValidStatus(tc.value)).toBe(tc.expected);
    }
  });
});

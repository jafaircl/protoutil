import { anyIs } from "@bufbuild/protobuf/wkt";
import {
  BadRequestSchema,
  Code,
  ErrorInfoSchema,
  LocalizedMessageSchema,
  RetryInfoSchema,
} from "@protoutil/core/google/rpc";
import { describe, expect, it } from "vitest";
import {
  InvalidArgumentError,
  NotFoundError,
  PermissionDeniedError,
  parseStatus,
  StatusError,
} from "./errors.js";
import { errorDetails, OK_STATUS, packErrorDetails, status, unpackErrorDetails } from "./status.js";

describe("AIP error status helpers", () => {
  it("materializes standard error detail init shapes using core schemas", () => {
    const cases = [
      {
        value: errorDetails({
          errorInfo: {
            reason: "BOOK_NOT_FOUND",
            domain: "library.example.com",
            metadata: { resource: "books/1" },
          },
        }),
        expected: {
          errorInfo: {
            reason: "BOOK_NOT_FOUND",
            domain: "library.example.com",
            metadata: { resource: "books/1" },
          },
        },
      },
      {
        value: errorDetails({
          retryInfo: {
            retryDelay: { seconds: 3n },
          },
        }),
        expected: {
          retryInfo: {
            retryDelay: { seconds: 3n, nanos: 0 },
          },
        },
      },
      {
        value: errorDetails({
          badRequest: {
            fieldViolations: [{ field: "name", description: "is required" }],
          },
        }),
        expected: {
          badRequest: {
            fieldViolations: [{ field: "name", description: "is required" }],
          },
        },
      },
      {
        value: errorDetails({
          localizedMessage: {
            locale: "en-US",
            message: "Book not found",
          },
        }),
        expected: {
          localizedMessage: {
            locale: "en-US",
            message: "Book not found",
          },
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("packs and unpacks standard details through Any messages", () => {
    const packed = packErrorDetails({
      errorInfo: {
        reason: "BOOK_NOT_FOUND",
        domain: "library.example.com",
      },
      retryInfo: {
        retryDelay: { seconds: 3n },
      },
      badRequest: {
        fieldViolations: [{ field: "name", description: "is required" }],
      },
      localizedMessage: {
        locale: "en-US",
        message: "Book not found",
      },
    });
    const schemas = [ErrorInfoSchema, RetryInfoSchema, BadRequestSchema, LocalizedMessageSchema];

    expect(packed).toHaveLength(schemas.length);
    for (const [index, schema] of schemas.entries()) {
      expect(anyIs(packed[index], schema)).toBe(true);
    }

    expect(unpackErrorDetails(packed)).toMatchObject({
      errorInfo: {
        reason: "BOOK_NOT_FOUND",
        domain: "library.example.com",
      },
      retryInfo: {
        retryDelay: { seconds: 3n },
      },
      badRequest: {
        fieldViolations: [{ field: "name", description: "is required" }],
      },
      localizedMessage: {
        locale: "en-US",
        message: "Book not found",
      },
    });
  });

  it("creates Status messages with packed AIP detail fields", () => {
    const value = status({
      code: Code.NOT_FOUND,
      message: "Book not found",
      errorInfo: {
        reason: "BOOK_NOT_FOUND",
        domain: "library.example.com",
      },
    });

    expect(value).toMatchObject({
      code: Code.NOT_FOUND,
      message: "Book not found",
    });
    expect(value.details).toHaveLength(1);
    expect(anyIs(value.details[0], ErrorInfoSchema)).toBe(true);
  });

  it("round-trips StatusError values through Status messages", () => {
    const error = new NotFoundError({
      message: "Book not found",
      errorInfo: {
        reason: "BOOK_NOT_FOUND",
        domain: "library.example.com",
      },
    });
    const statusMessage = error.toStatus();
    const parsed = StatusError.fromStatus(statusMessage);

    expect(statusMessage).toMatchObject({
      code: Code.NOT_FOUND,
      message: "Book not found",
    });
    expect(parsed).toMatchObject({
      code: Code.NOT_FOUND,
      message: "Book not found",
      details: {
        errorInfo: {
          reason: "BOOK_NOT_FOUND",
          domain: "library.example.com",
        },
      },
    });
  });

  it("parses specific StatusError subclasses from status codes", () => {
    const cases = [
      {
        value: status({ code: Code.NOT_FOUND, message: "not found" }),
        expected: NotFoundError,
      },
      {
        value: status({ code: Code.INVALID_ARGUMENT, message: "invalid" }),
        expected: InvalidArgumentError,
      },
      {
        value: status({ code: Code.PERMISSION_DENIED, message: "denied" }),
        expected: PermissionDeniedError,
      },
      {
        value: status({ code: Code.OK, message: "OK" }),
        expected: StatusError,
      },
    ];

    for (const tc of cases) {
      expect(parseStatus(tc.value)).toBeInstanceOf(tc.expected);
    }
  });

  it("exports an OK status using the shared core Code enum", () => {
    expect(OK_STATUS).toMatchObject({
      code: Code.OK,
      message: "OK",
      details: [],
    });
  });
});

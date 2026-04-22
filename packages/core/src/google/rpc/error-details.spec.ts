import { create } from "@bufbuild/protobuf";
import { DurationSchema } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  BadRequestSchema,
  DebugInfoSchema,
  ErrorInfoSchema,
  Help_LinkSchema,
  HelpSchema,
  LocalizedMessageSchema,
  PreconditionFailureSchema,
  QuotaFailureSchema,
  RequestInfoSchema,
  ResourceInfoSchema,
  RetryInfoSchema,
} from "../../gen/google/rpc/error_details_pb.js";
import { duration } from "../../wkt/duration.js";
import {
  assertValidBadRequest,
  assertValidBadRequestFieldViolation,
  assertValidDebugInfo,
  assertValidErrorInfo,
  assertValidHelp,
  assertValidHelpLink,
  assertValidLocalizedMessage,
  assertValidPreconditionFailure,
  assertValidQuotaFailure,
  assertValidRequestInfo,
  assertValidResourceInfo,
  assertValidRetryInfo,
  badRequest,
  badRequestFieldViolation,
  debugInfo,
  errorInfo,
  help,
  helpLink,
  isValidBadRequest,
  isValidDebugInfo,
  isValidErrorInfo,
  isValidHelp,
  isValidLocalizedMessage,
  isValidPreconditionFailure,
  isValidQuotaFailure,
  isValidRequestInfo,
  isValidResourceInfo,
  isValidRetryInfo,
  localizedMessage,
  preconditionFailure,
  preconditionFailureViolation,
  quotaFailure,
  quotaFailureViolation,
  requestInfo,
  resourceInfo,
  retryInfo,
} from "./error-details.js";

describe("google/rpc error detail helpers", () => {
  it("creates simple standard error detail messages", () => {
    const cases = [
      {
        value: errorInfo("BOOK_NOT_FOUND", "library.example.com", { resource: "books/1" }),
        expected: {
          reason: "BOOK_NOT_FOUND",
          domain: "library.example.com",
          metadata: { resource: "books/1" },
        },
      },
      {
        value: retryInfo(duration(3n)),
        expected: {
          retryDelay: duration(3n),
        },
      },
      {
        value: debugInfo(["handler.ts:10"], "trace"),
        expected: {
          stackEntries: ["handler.ts:10"],
          detail: "trace",
        },
      },
      {
        value: requestInfo("req-123", "served-by-primary"),
        expected: {
          requestId: "req-123",
          servingData: "served-by-primary",
        },
      },
      {
        value: resourceInfo("library.googleapis.com/Book", "publishers/1/books/2"),
        expected: {
          resourceType: "library.googleapis.com/Book",
          resourceName: "publishers/1/books/2",
          owner: "",
          description: "",
        },
      },
      {
        value: localizedMessage("en-US", "Book not found"),
        expected: {
          locale: "en-US",
          message: "Book not found",
        },
      },
    ];

    for (const tc of cases) {
      expect(tc.value).toMatchObject(tc.expected);
    }
  });

  it("creates nested standard error detail messages", () => {
    const fieldViolation = badRequestFieldViolation(
      "name",
      "is required",
      "FIELD_REQUIRED",
      localizedMessage("en-US", "Name is required"),
    );
    const preconditionViolation = preconditionFailureViolation(
      "STATE",
      "books/1",
      "book is archived",
    );
    const quotaViolation = quotaFailureViolation({
      subject: "projects/123",
      description: "quota exceeded",
      quotaMetric: "library.googleapis.com/read_requests",
      quotaDimensions: { region: "us-central1" },
      quotaValue: 100n,
      futureQuotaValue: 200n,
    });
    const link = helpLink("docs", "https://example.com/docs");

    expect(badRequest([fieldViolation])).toMatchObject({
      fieldViolations: [
        {
          field: "name",
          description: "is required",
          reason: "FIELD_REQUIRED",
          localizedMessage: {
            locale: "en-US",
            message: "Name is required",
          },
        },
      ],
    });
    expect(preconditionFailure([preconditionViolation])).toMatchObject({
      violations: [
        {
          type: "STATE",
          subject: "books/1",
          description: "book is archived",
        },
      ],
    });
    expect(quotaFailure([quotaViolation])).toMatchObject({
      violations: [
        {
          subject: "projects/123",
          description: "quota exceeded",
          quotaMetric: "library.googleapis.com/read_requests",
          quotaDimensions: { region: "us-central1" },
          quotaValue: 100n,
          futureQuotaValue: 200n,
        },
      ],
    });
    expect(help([link])).toMatchObject({
      links: [
        {
          description: "docs",
          url: "https://example.com/docs",
        },
      ],
    });
  });

  it("validates raw generated messages separately from helper construction", () => {
    const validCases = [
      {
        value: create(ErrorInfoSchema, { reason: "API_DISABLED", domain: "googleapis.com" }),
        assert: assertValidErrorInfo,
        isValid: isValidErrorInfo,
      },
      {
        value: create(RetryInfoSchema, { retryDelay: duration(1n) }),
        assert: assertValidRetryInfo,
        isValid: isValidRetryInfo,
      },
      {
        value: create(DebugInfoSchema, { stackEntries: ["a"], detail: "b" }),
        assert: assertValidDebugInfo,
        isValid: isValidDebugInfo,
      },
      {
        value: create(QuotaFailureSchema, {
          violations: [quotaFailureViolation({ subject: "s", description: "d" })],
        }),
        assert: assertValidQuotaFailure,
        isValid: isValidQuotaFailure,
      },
      {
        value: create(PreconditionFailureSchema, {
          violations: [preconditionFailureViolation("TOS", "terms", "not accepted")],
        }),
        assert: assertValidPreconditionFailure,
        isValid: isValidPreconditionFailure,
      },
      {
        value: create(BadRequestSchema, {
          fieldViolations: [badRequestFieldViolation("name", "is required")],
        }),
        assert: assertValidBadRequest,
        isValid: isValidBadRequest,
      },
      {
        value: create(RequestInfoSchema, { requestId: "req-1" }),
        assert: assertValidRequestInfo,
        isValid: isValidRequestInfo,
      },
      {
        value: create(ResourceInfoSchema, { resourceType: "Book", resourceName: "books/1" }),
        assert: assertValidResourceInfo,
        isValid: isValidResourceInfo,
      },
      {
        value: create(HelpSchema, { links: [helpLink("docs", "https://example.com")] }),
        assert: assertValidHelp,
        isValid: isValidHelp,
      },
      {
        value: create(LocalizedMessageSchema, { locale: "en-US", message: "Hello" }),
        assert: assertValidLocalizedMessage,
        isValid: isValidLocalizedMessage,
      },
    ];

    for (const tc of validCases) {
      expect(() => tc.assert(tc.value as never)).not.toThrow();
      expect(tc.isValid(tc.value as never)).toBe(true);
    }
  });

  it("rejects invalid raw error detail shapes", () => {
    const cases = [
      {
        assert: assertValidErrorInfo,
        value: { reason: "BAD", domain: "example.com", metadata: { count: 1 } },
        error: "metadata must contain only string values",
      },
      {
        assert: assertValidRetryInfo,
        value: create(RetryInfoSchema, {
          retryDelay: create(DurationSchema, { nanos: 1_000_000_000 }),
        }),
        error: "out-of-range nanos",
      },
      {
        assert: assertValidDebugInfo,
        value: { stackEntries: ["ok", 1], detail: "bad" },
        error: "stackEntries must contain only strings",
      },
      {
        assert: assertValidQuotaFailure,
        value: {
          violations: [{ $typeName: "google.rpc.BadRequest.FieldViolation" }],
        },
        error: "violations must contain only google.rpc.QuotaFailure.Violation values",
      },
      {
        assert: assertValidBadRequest,
        value: {
          fieldViolations: [{ $typeName: "google.rpc.QuotaFailure.Violation" }],
        },
        error: "fieldViolations must contain only google.rpc.BadRequest.FieldViolation values",
      },
      {
        assert: assertValidHelp,
        value: {
          links: [{ $typeName: "google.rpc.BadRequest.FieldViolation" }],
        },
        error: "links must contain only google.rpc.Help.Link values",
      },
      {
        assert: assertValidLocalizedMessage,
        value: create(LocalizedMessageSchema, { locale: "not a locale", message: "Hello" }),
        error: "languageCode must be a valid BCP 47 language tag",
      },
    ];

    for (const tc of cases) {
      expect(() => tc.assert(tc.value as never)).toThrow(tc.error);
    }
  });

  it("validates nested error detail messages directly", () => {
    const validCases = [
      {
        value: badRequestFieldViolation("name", "is required"),
        assert: assertValidBadRequestFieldViolation,
      },
      {
        value: helpLink("docs", "https://example.com/docs"),
        assert: assertValidHelpLink,
      },
    ];
    const invalidCases = [
      {
        value: {
          $typeName: "google.rpc.BadRequest.FieldViolation",
          field: "name",
          description: "is required",
          reason: "",
          localizedMessage: { $typeName: "google.rpc.Help.Link" },
        },
        assert: assertValidBadRequestFieldViolation,
        error: "localizedMessage must contain only google.rpc.LocalizedMessage values",
      },
      {
        value: create(Help_LinkSchema, { description: "docs", url: 1 as never }),
        assert: assertValidHelpLink,
        error: "url must be a string",
      },
    ];

    for (const tc of validCases) {
      expect(() => tc.assert(tc.value as never)).not.toThrow();
    }
    for (const tc of invalidCases) {
      expect(() => tc.assert(tc.value as never)).toThrow(tc.error);
    }
  });
});

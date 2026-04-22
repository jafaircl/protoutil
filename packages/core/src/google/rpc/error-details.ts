import { create, type MessageInitShape } from "@bufbuild/protobuf";
import type { Duration } from "@bufbuild/protobuf/wkt";
import { InvalidValueError } from "../../errors.js";
import {
  type BadRequest,
  type BadRequest_FieldViolation,
  BadRequest_FieldViolationSchema,
  BadRequestSchema,
  type DebugInfo,
  DebugInfoSchema,
  type ErrorInfo,
  ErrorInfoSchema,
  type Help,
  type Help_Link,
  Help_LinkSchema,
  HelpSchema,
  type LocalizedMessage,
  LocalizedMessageSchema,
  type PreconditionFailure,
  type PreconditionFailure_Violation,
  PreconditionFailure_ViolationSchema,
  PreconditionFailureSchema,
  type QuotaFailure,
  type QuotaFailure_Violation,
  QuotaFailure_ViolationSchema,
  QuotaFailureSchema,
  type RequestInfo,
  RequestInfoSchema,
  type ResourceInfo,
  ResourceInfoSchema,
  type RetryInfo,
  RetryInfoSchema,
} from "../../gen/google/rpc/error_details_pb.js";
import { assertValidInt64 } from "../../int64.js";
import { assertValidDuration } from "../../wkt/duration.js";
import { assertValidLanguageCode } from "../type/locale-codes.js";

/**
 * Creates a validated `google.rpc.ErrorInfo` value.
 */
export function errorInfo(reason: string, domain: string, metadata: Record<string, string> = {}) {
  const value = create(ErrorInfoSchema, { reason, domain, metadata });
  assertValidErrorInfo(value);
  return value;
}

/**
 * Asserts that a `google.rpc.ErrorInfo` is structurally valid.
 */
export function assertValidErrorInfo(value: ErrorInfo): asserts value is ErrorInfo {
  assertStringField("reason", value.reason);
  assertStringField("domain", value.domain);
  assertStringMap("metadata", value.metadata);
}

/**
 * Returns `true` when the value is a valid `google.rpc.ErrorInfo`.
 */
export function isValidErrorInfo(value: ErrorInfo): value is ErrorInfo {
  try {
    assertValidErrorInfo(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.RetryInfo` value.
 */
export function retryInfo(retryDelay?: Duration) {
  const value = create(RetryInfoSchema, { retryDelay });
  assertValidRetryInfo(value);
  return value;
}

/**
 * Asserts that a `google.rpc.RetryInfo` is structurally valid.
 */
export function assertValidRetryInfo(value: RetryInfo): asserts value is RetryInfo {
  if (value.retryDelay !== undefined) {
    assertValidDuration(value.retryDelay);
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.RetryInfo`.
 */
export function isValidRetryInfo(value: RetryInfo): value is RetryInfo {
  try {
    assertValidRetryInfo(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.DebugInfo` value.
 */
export function debugInfo(stackEntries: string[] = [], detail = "") {
  const value = create(DebugInfoSchema, { stackEntries, detail });
  assertValidDebugInfo(value);
  return value;
}

/**
 * Asserts that a `google.rpc.DebugInfo` is structurally valid.
 */
export function assertValidDebugInfo(value: DebugInfo): asserts value is DebugInfo {
  assertStringList("stackEntries", value.stackEntries);
  assertStringField("detail", value.detail);
}

/**
 * Returns `true` when the value is a valid `google.rpc.DebugInfo`.
 */
export function isValidDebugInfo(value: DebugInfo): value is DebugInfo {
  try {
    assertValidDebugInfo(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.QuotaFailure` value.
 */
export function quotaFailure(violations: QuotaFailure_Violation[] = []) {
  const value = create(QuotaFailureSchema, { violations });
  assertValidQuotaFailure(value);
  return value;
}

/**
 * Creates a validated `google.rpc.QuotaFailure.Violation` value.
 */
export function quotaFailureViolation(
  input: MessageInitShape<typeof QuotaFailure_ViolationSchema>,
) {
  const value = create(QuotaFailure_ViolationSchema, input);
  assertValidQuotaFailureViolation(value);
  return value;
}

/**
 * Asserts that a `google.rpc.QuotaFailure` is structurally valid.
 */
export function assertValidQuotaFailure(value: QuotaFailure): asserts value is QuotaFailure {
  assertMessageList("violations", value.violations, "google.rpc.QuotaFailure.Violation");
  for (const violation of value.violations) {
    assertValidQuotaFailureViolation(violation);
  }
}

/**
 * Asserts that a `google.rpc.QuotaFailure.Violation` is structurally valid.
 */
export function assertValidQuotaFailureViolation(
  value: QuotaFailure_Violation,
): asserts value is QuotaFailure_Violation {
  assertStringField("subject", value.subject);
  assertStringField("description", value.description);
  assertStringField("apiService", value.apiService);
  assertStringField("quotaMetric", value.quotaMetric);
  assertStringField("quotaId", value.quotaId);
  assertStringMap("quotaDimensions", value.quotaDimensions);
  assertValidInt64(value.quotaValue);
  if (value.futureQuotaValue !== undefined) {
    assertValidInt64(value.futureQuotaValue);
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.QuotaFailure`.
 */
export function isValidQuotaFailure(value: QuotaFailure): value is QuotaFailure {
  try {
    assertValidQuotaFailure(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.QuotaFailure.Violation`.
 */
export function isValidQuotaFailureViolation(
  value: QuotaFailure_Violation,
): value is QuotaFailure_Violation {
  try {
    assertValidQuotaFailureViolation(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.PreconditionFailure` value.
 */
export function preconditionFailure(violations: PreconditionFailure_Violation[] = []) {
  const value = create(PreconditionFailureSchema, { violations });
  assertValidPreconditionFailure(value);
  return value;
}

/**
 * Creates a validated `google.rpc.PreconditionFailure.Violation` value.
 */
export function preconditionFailureViolation(type: string, subject: string, description: string) {
  const value = create(PreconditionFailure_ViolationSchema, { type, subject, description });
  assertValidPreconditionFailureViolation(value);
  return value;
}

/**
 * Asserts that a `google.rpc.PreconditionFailure` is structurally valid.
 */
export function assertValidPreconditionFailure(
  value: PreconditionFailure,
): asserts value is PreconditionFailure {
  assertMessageList("violations", value.violations, "google.rpc.PreconditionFailure.Violation");
  for (const violation of value.violations) {
    assertValidPreconditionFailureViolation(violation);
  }
}

/**
 * Asserts that a `google.rpc.PreconditionFailure.Violation` is structurally valid.
 */
export function assertValidPreconditionFailureViolation(
  value: PreconditionFailure_Violation,
): asserts value is PreconditionFailure_Violation {
  assertStringField("type", value.type);
  assertStringField("subject", value.subject);
  assertStringField("description", value.description);
}

/**
 * Returns `true` when the value is a valid `google.rpc.PreconditionFailure`.
 */
export function isValidPreconditionFailure(
  value: PreconditionFailure,
): value is PreconditionFailure {
  try {
    assertValidPreconditionFailure(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.PreconditionFailure.Violation`.
 */
export function isValidPreconditionFailureViolation(
  value: PreconditionFailure_Violation,
): value is PreconditionFailure_Violation {
  try {
    assertValidPreconditionFailureViolation(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.BadRequest` value.
 */
export function badRequest(fieldViolations: BadRequest_FieldViolation[] = []) {
  const value = create(BadRequestSchema, { fieldViolations });
  assertValidBadRequest(value);
  return value;
}

/**
 * Creates a validated `google.rpc.BadRequest.FieldViolation` value.
 */
export function badRequestFieldViolation(
  field: string,
  description: string,
  reason = "",
  localizedMessage?: LocalizedMessage,
) {
  const value = create(BadRequest_FieldViolationSchema, {
    field,
    description,
    reason,
    localizedMessage,
  });
  assertValidBadRequestFieldViolation(value);
  return value;
}

/**
 * Asserts that a `google.rpc.BadRequest` is structurally valid.
 */
export function assertValidBadRequest(value: BadRequest): asserts value is BadRequest {
  assertMessageList(
    "fieldViolations",
    value.fieldViolations,
    "google.rpc.BadRequest.FieldViolation",
  );
  for (const violation of value.fieldViolations) {
    assertValidBadRequestFieldViolation(violation);
  }
}

/**
 * Asserts that a `google.rpc.BadRequest.FieldViolation` is structurally valid.
 */
export function assertValidBadRequestFieldViolation(
  value: BadRequest_FieldViolation,
): asserts value is BadRequest_FieldViolation {
  assertStringField("field", value.field);
  assertStringField("description", value.description);
  assertStringField("reason", value.reason);
  if (value.localizedMessage !== undefined) {
    assertExpectedMessage(
      value.localizedMessage,
      "localizedMessage",
      "google.rpc.LocalizedMessage",
    );
    assertValidLocalizedMessage(value.localizedMessage);
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.BadRequest`.
 */
export function isValidBadRequest(value: BadRequest): value is BadRequest {
  try {
    assertValidBadRequest(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.BadRequest.FieldViolation`.
 */
export function isValidBadRequestFieldViolation(
  value: BadRequest_FieldViolation,
): value is BadRequest_FieldViolation {
  try {
    assertValidBadRequestFieldViolation(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.RequestInfo` value.
 */
export function requestInfo(requestId: string, servingData = "") {
  const value = create(RequestInfoSchema, { requestId, servingData });
  assertValidRequestInfo(value);
  return value;
}

/**
 * Asserts that a `google.rpc.RequestInfo` is structurally valid.
 */
export function assertValidRequestInfo(value: RequestInfo): asserts value is RequestInfo {
  assertStringField("requestId", value.requestId);
  assertStringField("servingData", value.servingData);
}

/**
 * Returns `true` when the value is a valid `google.rpc.RequestInfo`.
 */
export function isValidRequestInfo(value: RequestInfo): value is RequestInfo {
  try {
    assertValidRequestInfo(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.ResourceInfo` value.
 */
export function resourceInfo(
  resourceType: string,
  resourceName: string,
  owner = "",
  description = "",
) {
  const value = create(ResourceInfoSchema, { resourceType, resourceName, owner, description });
  assertValidResourceInfo(value);
  return value;
}

/**
 * Asserts that a `google.rpc.ResourceInfo` is structurally valid.
 */
export function assertValidResourceInfo(value: ResourceInfo): asserts value is ResourceInfo {
  assertStringField("resourceType", value.resourceType);
  assertStringField("resourceName", value.resourceName);
  assertStringField("owner", value.owner);
  assertStringField("description", value.description);
}

/**
 * Returns `true` when the value is a valid `google.rpc.ResourceInfo`.
 */
export function isValidResourceInfo(value: ResourceInfo): value is ResourceInfo {
  try {
    assertValidResourceInfo(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.Help` value.
 */
export function help(links: Help_Link[] = []) {
  const value = create(HelpSchema, { links });
  assertValidHelp(value);
  return value;
}

/**
 * Creates a validated `google.rpc.Help.Link` value.
 */
export function helpLink(description: string, url: string) {
  const value = create(Help_LinkSchema, { description, url });
  assertValidHelpLink(value);
  return value;
}

/**
 * Asserts that a `google.rpc.Help` is structurally valid.
 */
export function assertValidHelp(value: Help): asserts value is Help {
  assertMessageList("links", value.links, "google.rpc.Help.Link");
  for (const link of value.links) {
    assertValidHelpLink(link);
  }
}

/**
 * Asserts that a `google.rpc.Help.Link` is structurally valid.
 */
export function assertValidHelpLink(value: Help_Link): asserts value is Help_Link {
  assertStringField("description", value.description);
  assertStringField("url", value.url);
}

/**
 * Returns `true` when the value is a valid `google.rpc.Help`.
 */
export function isValidHelp(value: Help): value is Help {
  try {
    assertValidHelp(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the value is a valid `google.rpc.Help.Link`.
 */
export function isValidHelpLink(value: Help_Link): value is Help_Link {
  try {
    assertValidHelpLink(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a validated `google.rpc.LocalizedMessage` value.
 */
export function localizedMessage(locale: string, message: string) {
  const value = create(LocalizedMessageSchema, { locale, message });
  assertValidLocalizedMessage(value);
  return value;
}

/**
 * Asserts that a `google.rpc.LocalizedMessage` is structurally valid.
 */
export function assertValidLocalizedMessage(
  value: LocalizedMessage,
): asserts value is LocalizedMessage {
  assertValidLanguageCode(value.locale);
  assertStringField("message", value.message);
}

/**
 * Returns `true` when the value is a valid `google.rpc.LocalizedMessage`.
 */
export function isValidLocalizedMessage(value: LocalizedMessage): value is LocalizedMessage {
  try {
    assertValidLocalizedMessage(value);
    return true;
  } catch {
    return false;
  }
}

function assertStringField(name: string, value: string) {
  if (typeof value !== "string") {
    throw new InvalidValueError(`${name} must be a string`, value);
  }
}

function assertStringList(name: string, value: string[]) {
  if (!Array.isArray(value)) {
    throw new InvalidValueError(`${name} must be an array of strings`, value);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new InvalidValueError(`${name} must contain only strings`, value);
    }
  }
}

function assertStringMap(name: string, value: Record<string, string>) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidValueError(`${name} must be a string map`, value);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key !== "string" || typeof entry !== "string") {
      throw new InvalidValueError(`${name} must contain only string values`, value);
    }
  }
}

function assertMessageList(name: string, value: unknown, typeName: string) {
  if (!Array.isArray(value)) {
    throw new InvalidValueError(`${name} must be an array of ${typeName}`, value);
  }
  for (const entry of value) {
    assertExpectedMessage(entry, name, typeName);
  }
}

function assertExpectedMessage(value: unknown, name: string, typeName: string) {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { $typeName?: string }).$typeName !== typeName
  ) {
    throw new InvalidValueError(`${name} must contain only ${typeName} values`, value);
  }
}

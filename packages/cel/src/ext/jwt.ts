import type { LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import { optionalTypes } from "../cel/library.js";
import { func, memberOverload, overload } from "../common/decls.js";
import { False, True } from "../common/types/bool.js";
import { type Duration, durationOf } from "../common/types/duration.js";
import { err, isError } from "../common/types/err.js";
import { Optional, OptionalNone, optionalOf } from "../common/types/optional.js";
import { minUnixTime } from "../common/types/overflow.js";
import type { Adapter, NativeObjectDescriptor } from "../common/types/provider.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import type { Type as RefType, Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import { parseTimestamp, type Timestamp, timestampOf } from "../common/types/timestamp.js";
import type { FieldTester, Indexer } from "../common/types/traits/index.js";
import {
  BoolType,
  DynType,
  listType,
  objectType,
  optionalType,
  StringType,
  TimestampType,
  type Type,
  TypeType,
} from "../common/types/types.js";
import { nativeField, nativeType } from "./native.js";

/** JwtTokenTypeName is the CEL type name of a parsed JWT. */
export const JwtTokenTypeName = "jwt.Token";

/** JwtTokenType is the CEL object type of a parsed JWT. */
export const JwtTokenType = objectType(JwtTokenTypeName);

/** MaxTokenSize is the largest token accepted by {@link parseToken}, in characters. */
export const MaxTokenSize = 10 * 1024 * 1024;

/**
 * zeroTimestamp is the CEL timestamp corresponding to an unset time claim.
 *
 * Upstream leaves an absent `nbf` as Go's zero `time.Time`, which is `0001-01-01T00:00:00Z` — the
 * earliest instant CEL can represent. A `jwt.Token` therefore always carries a timestamp for each
 * time claim, and an unset claim is the one which compares equal to this value.
 */
const zeroTimestamp = timestampOf(minUnixTime);

/**
 * JwtOptions configures the JWT extension.
 */
export interface JwtOptions {
  /**
   * adapter converts custom claim values read out of the token payload into CEL values.
   *
   * cel-go reads the adapter off the environment being configured; the port has no equivalent hook.
   * The default handles every value a token string can decode to, so this is only needed for a
   * token built by hand whose payload holds custom types.
   */
  readonly adapter?: Adapter;

  /** clock supplies the current time used by time validation. */
  readonly clock?: () => Date | Timestamp;

  /** clockLeeway is the tolerance applied when checking the `iat`, `nbf`, and `exp` claims. */
  readonly clockLeeway?: Duration;

  /**
   * validateTimes rejects tokens whose time claims are not valid at the current time.
   *
   * When disabled, which is the default, `jwt.parse` reports only structural problems.
   */
  readonly validateTimes?: boolean;

  /** version selects the JWT library version. */
  readonly version?: number;
}

/**
 * JwtLibrary describes the singleton JWT library.
 */
export type JwtLibrary = SingletonLibrary & LibraryVersioner;

/**
 * TokenOptions describes the claims carried by a {@link Token}.
 */
export interface TokenOptions {
  /** algorithm is the `alg` header value. */
  readonly algorithm?: string;
  /** audience is the `aud` claim, always held as a list. */
  readonly audience?: readonly string[];
  /** authorizedParty is the `azp` claim, or the empty string when absent. */
  readonly authorizedParty?: string;
  /** expiresAt is the `exp` claim, or the unset timestamp when absent. */
  readonly expiresAt?: Timestamp;
  /** id is the `jti` claim, or the empty string when absent. */
  readonly id?: string;
  /** issuedAt is the `iat` claim, or the unset timestamp when absent. */
  readonly issuedAt?: Timestamp;
  /** issuer is the `iss` claim. */
  readonly issuer?: string;
  /** keyId is the `kid` header value, or the empty string when absent. */
  readonly keyId?: string;
  /** notBefore is the `nbf` claim, or the unset timestamp when absent. */
  readonly notBefore?: Timestamp;
  /** payload contains the decoded claim set, including custom claims. */
  readonly payload?: Record<string, unknown>;
  /** subject is the `sub` claim. */
  readonly subject?: string;
}

/**
 * Token is a parsed JWT, and is itself the CEL value of a token.
 *
 * A token and its payload must be treated as read-only once created.
 *
 * Being a CEL value rather than a described plain object keeps a token's fields readable through
 * any adapter: cel-go reads the configured type adapter off the environment when a token is
 * returned, and the port has no equivalent hook.
 *
 * Signature verification is out of scope. Verify a token before handing it to CEL.
 */
export class Token implements Val, FieldTester, Indexer {
  /** algorithm is the `alg` header value. */
  public readonly algorithm: string;
  /** audience is the `aud` claim, always held as a list. */
  public readonly audience: readonly string[];
  /** authorizedParty is the `azp` claim, or the empty string when absent. */
  public readonly authorizedParty: string;
  /** expiresAt is the `exp` claim. */
  public readonly expiresAt: Timestamp;
  /** id is the `jti` claim, or the empty string when absent. */
  public readonly id: string;
  /** issuedAt is the `iat` claim. */
  public readonly issuedAt: Timestamp;
  /** issuer is the `iss` claim. */
  public readonly issuer: string;
  /** keyId is the `kid` header value, or the empty string when absent. */
  public readonly keyId: string;
  /** notBefore is the `nbf` claim, or the zero timestamp when absent. */
  public readonly notBefore: Timestamp;
  /** payload contains the decoded claim set, including custom claims. */
  public readonly payload: Record<string, unknown>;
  /** subject is the `sub` claim. */
  public readonly subject: string;

  constructor(options: TokenOptions = {}) {
    this.algorithm = options.algorithm ?? "";
    this.audience = options.audience ?? [];
    this.authorizedParty = options.authorizedParty ?? "";
    this.expiresAt = options.expiresAt ?? zeroTimestamp;
    this.id = options.id ?? "";
    this.issuedAt = options.issuedAt ?? zeroTimestamp;
    this.issuer = options.issuer ?? "";
    this.keyId = options.keyId ?? "";
    this.notBefore = options.notBefore ?? zeroTimestamp;
    this.payload = options.payload ?? {};
    this.subject = options.subject ?? "";
  }

  /** convertToNative returns the token itself, the only native representation it has. */
  public convertToNative(typeDesc: unknown): unknown {
    if (typeDesc === Object || typeDesc === undefined || typeDesc === Token) {
      return this;
    }
    throw new Error(`unsupported type conversion to '${String(typeDesc)}'`);
  }

  /** convertToType converts a token to its own type or to type metadata. */
  public convertToType(typeValue: RefType): Val {
    if (typeValue === TypeType) {
      return JwtTokenType;
    }
    if (typeValue.typeName() === JwtTokenTypeName) {
      return this;
    }
    return err("type conversion error from '%s' to '%s'", JwtTokenTypeName, typeValue.typeName());
  }

  /** equal reports whether another token carries the same claims. */
  public equal(other: Val): Val {
    if (!(other instanceof Token)) {
      return False;
    }
    const sameClaims =
      this.issuer === other.issuer &&
      this.subject === other.subject &&
      this.authorizedParty === other.authorizedParty &&
      this.id === other.id &&
      this.algorithm === other.algorithm &&
      this.keyId === other.keyId &&
      this.audience.length === other.audience.length &&
      this.audience.every((entry, index) => entry === other.audience[index]) &&
      sameInstant(this.expiresAt, other.expiresAt) &&
      sameInstant(this.issuedAt, other.issuedAt) &&
      sameInstant(this.notBefore, other.notBefore);
    return sameClaims ? True : False;
  }

  /** get returns a declared claim by its CEL field name. */
  public get(index: Val): Val {
    if (!(index instanceof CelString)) {
      return err("no such overload");
    }
    const field = tokenFields[index.value()];
    if (field === undefined) {
      return err("no such field: %s", index.value());
    }
    return field.read(this);
  }

  /** isSet reports whether a declared claim carries a value rather than its default. */
  public isSet(field: Val): Val {
    if (!(field instanceof CelString)) {
      return err("no such overload");
    }
    const declared = tokenFields[field.value()];
    if (declared === undefined) {
      return err("no such field: %s", field.value());
    }
    return declared.present(this) ? True : False;
  }

  /** type returns the CEL token type. */
  public type(): RefType {
    return JwtTokenType;
  }

  /** value returns the token itself. */
  public value(): unknown {
    return this;
  }

  /**
   * claim reads a claim from the token payload, returning an empty optional when it is absent or
   * JSON null.
   */
  public claim(adapter: Adapter, claimName: string): Val {
    const value = this.payload[claimName];
    if (value === undefined || value === null) {
      return OptionalNone;
    }
    const adapted = adapter.nativeToValue(value);
    if (isError(adapted)) {
      return adapted;
    }
    return optionalOf(adapted);
  }

  /**
   * isValidAt reports whether the token's time claims hold at the reference time, allowing the
   * given clock leeway in both directions.
   *
   * An unset claim is skipped, so a token carrying none of `iat`, `nbf`, and `exp` is always valid.
   */
  public isValidAt(refTime: Timestamp, leeway: Duration = durationOf(0n)): boolean {
    const now = epochNanos(refTime);
    const leewayNanos = leeway.value();
    const lateNow = now + leewayNanos;
    const earlyNow = now - leewayNanos;
    const issuedAt = isUnsetTime(this.issuedAt) ? undefined : epochNanos(this.issuedAt);
    const notBefore = isUnsetTime(this.notBefore) ? undefined : epochNanos(this.notBefore);
    const expiresAt = isUnsetTime(this.expiresAt) ? undefined : epochNanos(this.expiresAt);
    if (issuedAt !== undefined && issuedAt > lateNow) {
      return false;
    }
    if (notBefore !== undefined && notBefore > lateNow) {
      return false;
    }
    if (expiresAt !== undefined && expiresAt <= earlyNow) {
      return false;
    }
    // An inverted validity window can never be satisfied, so it is rejected regardless of leeway.
    if (notBefore !== undefined && expiresAt !== undefined && notBefore > expiresAt) {
      return false;
    }
    if (issuedAt !== undefined && expiresAt !== undefined && issuedAt > expiresAt) {
      return false;
    }
    return true;
  }

  /**
   * presentedBy reports whether a token from `issuer` was presented by `presenter`.
   *
   * A token carrying an `azp` claim is checked against that claim alone; otherwise the presenter
   * must appear in the `aud` claim.
   */
  public presentedBy(issuer: string, presenter: string): boolean {
    if (this.issuer !== issuer) {
      return false;
    }
    if (this.authorizedParty !== "") {
      return this.authorizedParty === presenter;
    }
    return this.audience.includes(presenter);
  }
}

/**
 * TokenField reads one declared claim off a token.
 */
interface TokenField {
  /** present reports whether the claim carries a value rather than its default. */
  readonly present: (token: Token) => boolean;
  /** property is the corresponding TypeScript property. */
  readonly property: string;
  /** read returns the claim as a CEL value. */
  readonly read: (token: Token) => Val;
  /** type is the CEL type used by the checker. */
  readonly type: Type;
}

/**
 * stringField declares a claim carried as a string, absent when empty.
 */
function stringField(property: keyof Token & string): TokenField {
  return {
    present: (token) => (token[property] as string) !== "",
    property,
    read: (token) => new CelString(token[property] as string),
    type: StringType,
  };
}

/**
 * timeField declares a claim carried as a timestamp, absent when unset.
 */
function timeField(property: keyof Token & string): TokenField {
  return {
    present: (token) => !isUnsetTime(token[property] as Timestamp),
    property,
    read: (token) => token[property] as Timestamp,
    type: TimestampType,
  };
}

/**
 * tokenFields declares the claims every token carries, keyed by CEL field name.
 *
 * The payload is deliberately absent: custom claims are reached through `claim()`, which keeps the
 * declared field set to the registered claims alone.
 */
const tokenFields: Record<string, TokenField> = {
  alg: stringField("algorithm"),
  aud: {
    present: (token) => token.audience.length > 0,
    property: "audience",
    read: (token) => DefaultTypeAdapter.nativeToValue([...token.audience]),
    type: listType(StringType),
  },
  azp: stringField("authorizedParty"),
  exp: timeField("expiresAt"),
  iat: timeField("issuedAt"),
  id: stringField("id"),
  issuer: stringField("issuer"),
  keyId: stringField("keyId"),
  nbf: timeField("notBefore"),
  subject: stringField("subject"),
};

/**
 * jwtTokenDescriptor describes the CEL fields of {@link Token} to the type checker.
 */
const jwtTokenDescriptor: NativeObjectDescriptor = nativeType({
  typeName: JwtTokenTypeName,
  fields: Object.entries(tokenFields).map(([celName, field]) =>
    nativeField({ celName, property: field.property, type: field.type }),
  ),
});

/**
 * jwt configures JWT parsing, claim inspection, and presenter validation.
 *
 * `jwt.parse(string)` decodes a token, stripping a leading `Bearer ` prefix, and yields an optional
 * `jwt.Token`. Both `claim()` and `presentedBy()` accept either a token or an optional token, so a
 * parse result can be used without unwrapping it first.
 *
 * Tokens are *not* verified. Verify the signature before evaluating an expression over the token.
 * Time claims are only checked when {@link JwtOptions.validateTimes} is enabled.
 *
 * This library configures the CEL optional type library.
 */
export function jwt(options: JwtOptions = {}): JwtLibrary {
  const adapter = options.adapter ?? DefaultTypeAdapter;
  const clock = options.clock ?? (() => new Date());
  const leeway = options.clockLeeway ?? durationOf(0n);
  const validateTimes = options.validateTimes ?? false;
  const tokenValid = (token: Token): boolean =>
    !validateTimes || token.isValidAt(parseTimestamp(clock()), leeway);
  return {
    libraryName: "cel.lib.ext.security.jwt",
    libraryVersion: options.version ?? Number.MAX_SAFE_INTEGER,
    compileOptions: {
      libraries: [optionalTypes()],
      nativeTypes: [jwtTokenDescriptor],
      functions: [
        func("jwt.parse", {
          overloads: [
            overload("jwt_parse_string", [StringType], optionalType(JwtTokenType), {
              unaryBinding: (value) => parse(value, tokenValid),
            }),
          ],
        }),
        func("claim", {
          overloads: [
            memberOverload(
              "jwt_token_claim_string",
              [JwtTokenType, StringType],
              optionalType(DynType),
              {
                binaryBinding: (target, claimName) => claimOf(target, claimName, adapter),
              },
            ),
            memberOverload(
              "jwt_token_opt_claim_string",
              [optionalType(JwtTokenType), StringType],
              optionalType(DynType),
              {
                binaryBinding: (target, claimName) => optionalClaimOf(target, claimName, adapter),
              },
            ),
          ],
        }),
        func("presentedBy", {
          overloads: [
            memberOverload(
              "jwt_token_presented_by_string_string",
              [JwtTokenType, StringType, StringType],
              BoolType,
              {
                functionBinding: (...args) => presentedByOf(args[0], args[1], args[2]),
              },
            ),
            memberOverload(
              "jwt_token_opt_presented_by_string_string",
              [optionalType(JwtTokenType), StringType, StringType],
              BoolType,
              {
                functionBinding: (...args) => optionalPresentedByOf(args[0], args[1], args[2]),
              },
            ),
          ],
        }),
      ],
    },
    programOptions: {},
  };
}

/**
 * newToken creates a token from the decoded header and payload of a JWT.
 *
 * Signature verification must happen before the token reaches CEL. Checking {@link
 * Token.isValidAt} and {@link Token.presentedBy} afterwards is recommended so the token matches the
 * assumptions an expression makes about it.
 *
 * @throws {Error} when a required header or claim is missing or malformed.
 */
export function newToken(header: Record<string, unknown>, payload: Record<string, unknown>): Token {
  const algorithm = optString(header, "alg");
  if (algorithm === "") {
    throw new Error("missing required header: 'alg'");
  }
  const issuer = optString(payload, "iss");
  if (issuer === "") {
    throw new Error("missing required claim: 'iss'");
  }
  const subject = optString(payload, "sub");
  if (subject === "") {
    throw new Error("missing required claim: 'sub'");
  }
  const audience = parseAudience(payload.aud);
  if (audience.length === 0) {
    throw new Error("missing required claim: 'aud'");
  }
  const expiresAt = parseRequiredTime(payload.exp, "exp");
  const issuedAt = parseRequiredTime(payload.iat, "iat");
  let notBefore = zeroTimestamp;
  if (payload.nbf !== undefined && payload.nbf !== null) {
    try {
      notBefore = parseTimestamp(payload.nbf);
    } catch (cause) {
      throw new Error(`invalid claim 'nbf': ${messageOf(cause)}`);
    }
  }
  return new Token({
    algorithm,
    audience,
    authorizedParty: optString(payload, "azp"),
    expiresAt,
    id: optString(payload, "jti"),
    issuedAt,
    issuer,
    keyId: optString(header, "kid"),
    notBefore,
    payload,
    subject,
  });
}

/**
 * parseToken decodes a JWT string into a {@link Token}.
 *
 * A leading `Bearer ` prefix is stripped. The signature segment, when present, is neither decoded
 * nor verified: verify the token before handing it to CEL.
 *
 * @throws {Error} when the token is oversized, malformed, or missing a required claim.
 */
export function parseToken(tokenStr: string): Token {
  const trimmed = trimBearerPrefix(tokenStr);
  if (trimmed.length > MaxTokenSize) {
    throw new Error(`token size exceeds maximum allowed limit of ${MaxTokenSize} bytes`);
  }
  const parts = splitSegments(trimmed);
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`invalid token format: expected 2 or 3 parts, got ${parts.length}`);
  }
  return newToken(claimSet(parts[0]!, "header"), claimSet(parts[1]!, "payload"));
}

/**
 * claimSet decodes and parses one token segment as a JSON object.
 */
function claimSet(segment: string, label: string): Record<string, unknown> {
  const text = decodeSegment(segment, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`failed to parse ${label} JSON: ${messageOf(cause)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`failed to parse ${label} JSON: expected an object`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * parse implements the `jwt.parse` binding.
 */
function parse(value: Val, tokenValid: (token: Token) => boolean): Val {
  if (!(value instanceof CelString)) {
    return err("parse token failed: expected string");
  }
  let token: Token;
  try {
    token = parseToken(value.value());
  } catch (cause) {
    return err("parse token failed: %s", messageOf(cause));
  }
  if (!tokenValid(token)) {
    return OptionalNone;
  }
  return optionalOf(token);
}

/**
 * claimOf implements the `claim` binding for a token receiver.
 */
function claimOf(target: Val, claimName: Val, adapter: Adapter): Val {
  const token = asToken(target);
  if (!(token instanceof Token)) {
    return token;
  }
  if (!(claimName instanceof CelString)) {
    return err("expected string claim name");
  }
  return token.claim(adapter, claimName.value());
}

/**
 * optionalClaimOf implements the `claim` binding for an optional token receiver.
 */
function optionalClaimOf(target: Val, claimName: Val, adapter: Adapter): Val {
  if (!(target instanceof Optional)) {
    return err("expected jwt.Token");
  }
  if (!target.hasValue()) {
    return OptionalNone;
  }
  return claimOf(target.getValue(), claimName, adapter);
}

/**
 * presentedByOf implements the `presentedBy` binding for a token receiver.
 */
function presentedByOf(target: Val, issuer: Val, presenter: Val): Val {
  const token = asToken(target);
  if (!(token instanceof Token)) {
    return token;
  }
  if (!(issuer instanceof CelString) || !(presenter instanceof CelString)) {
    return err("expected string issuer and presenter");
  }
  return token.presentedBy(issuer.value(), presenter.value()) ? True : False;
}

/**
 * optionalPresentedByOf implements the `presentedBy` binding for an optional token receiver.
 *
 * An empty optional was never presented by anyone, so it is false rather than an error.
 */
function optionalPresentedByOf(target: Val, issuer: Val, presenter: Val): Val {
  if (!(target instanceof Optional)) {
    return err("expected jwt.Token");
  }
  if (!target.hasValue()) {
    return False;
  }
  return presentedByOf(target.getValue(), issuer, presenter);
}

/**
 * asToken unwraps the adapted CEL value of a token, or returns the error to report instead.
 */
function asToken(target: Val): Token | Val {
  const native = target.value();
  if (native instanceof Token) {
    return native;
  }
  return err("expected jwt.Token");
}

/**
 * epochNanos converts a timestamp to nanoseconds since the Unix epoch.
 */
function epochNanos(value: Timestamp): bigint {
  return value.seconds() * 1_000_000_000n + BigInt(value.nanos());
}

/**
 * isUnsetTime reports whether a time claim carries the unset marker rather than a real instant.
 */
function isUnsetTime(value: Timestamp): boolean {
  return sameInstant(value, zeroTimestamp);
}

/**
 * sameInstant reports whether two timestamps describe the same instant.
 */
function sameInstant(left: Timestamp, right: Timestamp): boolean {
  return left.seconds() === right.seconds() && left.nanos() === right.nanos();
}

/**
 * optString reads a string entry, treating a missing or non-string entry as absent.
 */
function optString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

/**
 * parseAudience normalizes the `aud` claim, which may be a single string or a list of strings.
 */
function parseAudience(value: unknown): string[] {
  if (typeof value === "string") {
    return value === "" ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item !== "string" || item === "") {
        throw new Error(
          `invalid claim 'aud': expected non-empty string in audience list, got ${nativeTypeOf(item)}`,
        );
      }
      return item;
    });
  }
  if (value === undefined || value === null) {
    return [];
  }
  throw new Error(
    `invalid claim 'aud': expected string or array of strings, got ${nativeTypeOf(value)}`,
  );
}

/**
 * parseRequiredTime parses a required time claim, treating an unset instant as a missing claim.
 */
function parseRequiredTime(value: unknown, claimName: string): Timestamp {
  let parsed: Timestamp;
  try {
    parsed = parseTimestamp(value);
  } catch {
    throw new Error(`missing required claim: '${claimName}'`);
  }
  if (isUnsetTime(parsed)) {
    throw new Error(`missing required claim: '${claimName}'`);
  }
  return parsed;
}

/**
 * splitSegments splits a token into at most four segments, keeping any remainder in the last one so
 * an over-segmented token is reported as a format error rather than silently truncated.
 */
function splitSegments(tokenStr: string): string[] {
  const segments = tokenStr.split(".");
  if (segments.length <= 4) {
    return segments;
  }
  return [...segments.slice(0, 3), segments.slice(3).join(".")];
}

/**
 * trimBearerPrefix removes a leading `Bearer ` prefix, in any capitalization.
 */
function trimBearerPrefix(tokenStr: string): string {
  const trimmed = tokenStr.trim();
  if (trimmed.slice(0, 7).toLowerCase() === "bearer ") {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

/**
 * decodeSegment decodes one token segment as UTF-8 text.
 *
 * Both the URL-safe and standard base64 alphabets are accepted, padded or unpadded, matching the
 * decoders upstream tries in turn. Mixing the two alphabets is rejected.
 */
function decodeSegment(segment: string, label: string): string {
  const urlSafe = /[-_]/.test(segment);
  const standard = /[+/]/.test(segment);
  const illegal = (): Error => new Error(`failed to decode ${label}: illegal base64 data`);
  if (urlSafe && standard) {
    throw illegal();
  }
  const normalized = urlSafe ? segment.replace(/-/g, "+").replace(/_/g, "/") : segment;
  const body = normalized.replace(/=+$/, "");
  const padded = normalized.length !== body.length;
  // An unpadded segment may end mid-quantum, but never with a single leftover character; a padded
  // one must carry the full quantum.
  const wellFormed = padded ? normalized.length % 4 === 0 : body.length % 4 !== 1;
  if (!wellFormed || !/^[A-Za-z0-9+/]*$/.test(body)) {
    throw illegal();
  }
  try {
    const binary = globalThis.atob(body.padEnd(body.length + ((4 - (body.length % 4)) % 4), "="));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    throw illegal();
  }
}

/**
 * nativeTypeOf names a JSON value's runtime type for use in claim errors.
 */
function nativeTypeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

/**
 * messageOf renders a thrown value as a message.
 */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

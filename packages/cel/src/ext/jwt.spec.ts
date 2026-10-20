import { describe, expect, it } from "vitest";
import { env, unwrapAst } from "../cel/env.js";
import { variable } from "../common/decls.js";
import { syncedCases } from "../common/spec-helpers.js";
import { durationOf } from "../common/types/duration.js";
import { isError } from "../common/types/err.js";
import { Optional, OptionalNone } from "../common/types/optional.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import { parseTimestamp, type Timestamp, timestampOf } from "../common/types/timestamp.js";
import { StringType } from "../common/types/types.js";
import { type JwtOptions, JwtTokenType, jwt, newToken, parseToken, Token } from "./jwt.js";

/** ExprRef is a synchronized fixture value which held a Go expression upstream. */
interface ExprRef {
  /** $expr contains the upstream Go source text. */
  readonly $expr: string;
}

/** JwtExprCase describes a synchronized expression evaluated against a token variable. */
interface JwtExprCase {
  /** expr contains the CEL source expression. */
  readonly expr: string;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** tokenStr selects the token bound to the expression's variable. */
  readonly tokenStr?: ExprRef;
  /** want contains the expected native result. */
  readonly want: unknown;
}

/** JwtFieldCase describes a synchronized field read from a parsed token. */
interface JwtFieldCase {
  /** got names the upstream token accessor. */
  readonly got: ExprRef;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** want contains the expected native value. */
  readonly want: unknown;
}

/** JwtClaimCase describes a synchronized custom-claim lookup. */
interface JwtClaimCase {
  /** claimName is the claim queried on the payload. */
  readonly claimName: string;
  /** name identifies the upstream table row. */
  readonly name: string;
}

/** JwtTimestampCase describes a synchronized time-claim representation. */
interface JwtTimestampCase {
  /** name identifies the upstream table row. */
  readonly name: string;
  /** payload contains the claim set encoded into the token. */
  readonly payload: Record<string, unknown>;
  /** wantExp is the expected `exp` claim in Unix seconds. */
  readonly wantExp: number;
  /** wantIat is the expected `iat` claim in Unix seconds. */
  readonly wantIat: number;
  /** wantNbf is the expected `nbf` claim in Unix seconds, or zero when unset. */
  readonly wantNbf: number;
}

/** JwtValidateTimesCase describes a synchronized time-validation configuration. */
interface JwtValidateTimesCase {
  /** name identifies the upstream table row. */
  readonly name: string;
  /** options contains the upstream library options. */
  readonly options: ExprRef[] | null;
  /** tokenStr selects the token evaluated by the case. */
  readonly tokenStr: ExprRef;
  /** wantPass reports whether the parse is expected to yield a value. */
  readonly wantPass: boolean;
}

/** JwtChainingCase describes a synchronized optional-receiver expression. */
interface JwtChainingCase {
  /** expr contains the CEL source expression. */
  readonly expr: string;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** want contains the expected native result. */
  readonly want: unknown;
}

/** JwtParseErrorCase describes a synchronized parse failure. */
interface JwtParseErrorCase {
  /** errMsg is the expected error fragment. */
  readonly errMsg: string;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** tokenStr contains the token, or the Go expression which builds it. */
  readonly tokenStr: string | ExprRef;
}

/** JwtValidAtCase describes a synchronized time-window validity check. */
interface JwtValidAtCase {
  /** leeway is the clock tolerance in nanoseconds, or the shared `leeway` reference. */
  readonly leeway: number | ExprRef;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** refTime is the reference instant. */
  readonly refTime: ExprRef;
  /** token contains the Go composite literal describing the token. */
  readonly token: ExprRef;
  /** wantValid reports whether the token is expected to be valid. */
  readonly wantValid: boolean;
}

const nanosPerSecond = 1_000_000_000n;

describe("ext/security/jwt/jwt_test.go/TestJWTParseAndPresentedBy", () => {
  it("evaluates every synchronized parse, field, and presenter case", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenStr = testToken(
      { alg: "RS256", typ: "JWT", kid: "key-123" },
      {
        iss: "https://auth.example.com",
        sub: "user_12345",
        aud: ["https://api.example.com", "https://admin.example.com"],
        exp: nowSeconds + 3600,
        nbf: nowSeconds - 60,
        iat: nowSeconds - 60,
        jti: "token-unique-id-999",
        roles: ["admin", "editor"],
        tenant: "tenant_abc",
      },
    );
    const celEnv = env({
      libraries: [jwt()],
      variables: [
        variable("tokenStr", StringType),
        variable("bearerToken", StringType),
        variable("upperBearerToken", StringType),
      ],
    });
    const activation = {
      tokenStr,
      bearerToken: `Bearer ${tokenStr}`,
      upperBearerToken: `BEARER   ${tokenStr}`,
    };
    for (const testCase of syncedCases<JwtExprCase>(
      "ext/security/jwt/jwt_test.go/TestJWTParseAndPresentedBy",
    )) {
      expect(evaluate(celEnv, testCase.expr, activation), testCase.name).toEqual(testCase.want);
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestParseUnverifiedTokenAndFieldVariations", () => {
  it("reads every synchronized claim off a parsed token", () => {
    const token = parseToken(
      testToken(
        { alg: "ES256", kid: "k-42" },
        {
          iss: "https://accounts.google.com",
          sub: "10987654321",
          aud: "my-client-id",
          exp: 1700000000,
          nbf: "1699990000",
          iat: 1699990000.5,
        },
      ),
    );
    const accessors: Record<string, () => unknown> = {
      "tok.Algorithm": () => token.algorithm,
      "tok.Issuer": () => token.issuer,
      "tok.Subject": () => token.subject,
      "tok.KeyID": () => token.keyId,
      "tok.Audience": () => [...token.audience],
      "tok.ExpiresAt.Unix()": () => Number(token.expiresAt.seconds()),
      "tok.NotBefore.Unix()": () => Number(token.notBefore.seconds()),
      "tok.IssuedAt.Unix()": () => Number(token.issuedAt.seconds()),
    };
    for (const testCase of syncedCases<JwtFieldCase>(
      "ext/security/jwt/jwt_test.go/TestParseUnverifiedTokenAndFieldVariations",
    )) {
      const accessor = accessors[testCase.got.$expr];
      expect(accessor, testCase.name).toBeDefined();
      expect(accessor!(), testCase.name).toEqual(goValue(testCase.want));
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestClaimsCustomTypes", () => {
  it("adapts every synchronized custom claim which has a TypeScript analogue", () => {
    // The payload reaches CEL as parsed JSON, so Go's `json.Number` and `json.RawMessage` rows have
    // no analogue: a claim which would fail their deferred decoding cannot survive `JSON.parse`.
    const goOnly = new Set(["raw_msg_bad_conversion_error", "bad_num_conversion_error"]);
    const token = new Token({
      payload: {
        intNum: 42,
        floatNum: 3.14,
        strNum: "NaN",
        rawJSON: { nested: "value" },
        simpleStr: "hello",
      },
    });
    const expected: Record<string, (value: ReturnType<Token["claim"]>) => void> = {
      json_number_int: (value) => expect(optionalValue(value)).toEqual(42n),
      json_number_float: (value) => expect(optionalValue(value)).toEqual(3.14),
      json_number_nan_string: (value) => expect(value).not.toBe(OptionalNone),
      raw_json_message: (value) => expect(value).not.toBe(OptionalNone),
      simple_string: (value) => expect(optionalValue(value)).toEqual("hello"),
      nonexistent_claim: (value) => expect(value).toBe(OptionalNone),
    };
    for (const testCase of syncedCases<JwtClaimCase>(
      "ext/security/jwt/jwt_test.go/TestClaimsCustomTypes",
    )) {
      if (goOnly.has(testCase.name)) {
        continue;
      }
      const assertion = expected[testCase.name];
      expect(assertion, testCase.name).toBeDefined();
      assertion!(token.claim(DefaultTypeAdapter, testCase.claimName));
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTTimestampTypes", () => {
  it("parses every synchronized time-claim representation", () => {
    for (const testCase of syncedCases<JwtTimestampCase>(
      "ext/security/jwt/jwt_test.go/TestJWTTimestampTypes",
    )) {
      const payload = Object.fromEntries(
        Object.entries(testCase.payload).map(([key, value]) => [key, goValue(value)]),
      );
      const token = parseToken(testToken({ alg: "RS256", typ: "JWT" }, payload));
      expect(token.expiresAt.seconds(), testCase.name).toBe(BigInt(testCase.wantExp));
      expect(token.issuedAt.seconds(), testCase.name).toBe(BigInt(testCase.wantIat));
      if (testCase.wantNbf !== 0) {
        expect(token.notBefore.seconds(), testCase.name).toBe(BigInt(testCase.wantNbf));
      }
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTValidateTimesOption", () => {
  it("applies every synchronized time-validation configuration", () => {
    const fixedNow = timestampOf(1700000000n);
    const realNow = BigInt(Math.floor(Date.now() / 1000));
    const tokens: Record<string, string> = {
      tokValid: validatedToken(1700000000n - 3600n, 1700000000n - 3600n, 1700000000n + 3600n),
      tokExpired: validatedToken(1700000000n - 7200n, undefined, 1700000000n - 600n),
      tokFutureNbf: validatedToken(1700000000n - 3600n, 1700000000n + 600n, 1700000000n + 3600n),
      tokFutureIat: validatedToken(1700000000n + 600n, undefined, 1700000000n + 3600n),
      tokInvertedWindow: validatedToken(
        1700000000n - 1800n,
        1700000000n - 600n,
        1700000000n - 1200n,
      ),
      tokValidRealTime: validatedToken(realNow - 3600n, realNow - 3600n, realNow + 3600n),
      tokExpiredRealTime: validatedToken(realNow - 7200n, undefined, realNow - 3600n),
    };
    for (const testCase of syncedCases<JwtValidateTimesCase>(
      "ext/security/jwt/jwt_test.go/TestJWTValidateTimesOption",
    )) {
      const celEnv = env({
        libraries: [jwt(jwtOptions(testCase.options, fixedNow))],
        variables: [variable("tok", StringType)],
      });
      expect(
        evaluate(celEnv, "jwt.parse(tok).hasValue()", { tok: tokens[testCase.tokenStr.$expr] }),
        testCase.name,
      ).toBe(testCase.wantPass);
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTOptionalReceiverChaining", () => {
  it("evaluates every synchronized case against an empty parse result", () => {
    const celEnv = env({
      libraries: [jwt({ validateTimes: true, clock: () => timestampOf(2000000000n) })],
      variables: [variable("tok", StringType)],
    });
    const tok = testToken(
      { alg: "RS256", typ: "JWT" },
      {
        iss: "https://auth.example.com",
        sub: "user-123",
        aud: "my-client",
        tag: "prod",
        exp: 1700000000,
        iat: 1699900000,
      },
    );
    for (const testCase of syncedCases<JwtChainingCase>(
      "ext/security/jwt/jwt_test.go/TestJWTOptionalReceiverChaining",
    )) {
      expect(evaluate(celEnv, testCase.expr, { tok }), testCase.name).toEqual(testCase.want);
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTDirectTokenVariables", () => {
  it("evaluates every synchronized case against a token-typed variable", () => {
    const token = parseToken(
      testToken(
        { alg: "RS256", typ: "JWT" },
        {
          iss: "https://auth.example.com",
          sub: "user-123",
          aud: "my-client",
          tag: "prod",
          exp: 1700000000,
          iat: 1699900000,
        },
      ),
    );
    const celEnv = env({
      libraries: [jwt()],
      variables: [variable("t", JwtTokenType)],
    });
    for (const testCase of syncedCases<JwtExprCase>(
      "ext/security/jwt/jwt_test.go/TestJWTDirectTokenVariables",
    )) {
      expect(evaluate(celEnv, testCase.expr, { t: token }), testCase.name).toEqual(testCase.want);
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTPresentedByWithAuthorizedPartyAZP", () => {
  it("prefers the authorized party over the audience in every synchronized case", () => {
    const header = { alg: "RS256", typ: "JWT" };
    const tokens: Record<string, string> = {
      tokStr: testToken(header, {
        iss: "https://accounts.google.com",
        sub: "user-456",
        aud: "https://api.example.com",
        azp: "frontend-client-app-id",
        exp: 1700000000,
        iat: 1699900000,
      }),
      tokNoAZP: testToken(header, {
        iss: "https://accounts.google.com",
        sub: "user-456",
        aud: "https://api.example.com",
        exp: 1700000000,
        iat: 1699900000,
      }),
    };
    const celEnv = env({
      libraries: [jwt()],
      variables: [variable("tokStr", StringType)],
    });
    for (const testCase of syncedCases<JwtExprCase>(
      "ext/security/jwt/jwt_test.go/TestJWTPresentedByWithAuthorizedPartyAZP",
    )) {
      expect(
        evaluate(celEnv, testCase.expr, { tokStr: tokens[testCase.tokenStr!.$expr] }),
        testCase.name,
      ).toEqual(testCase.want);
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestJWTParsingErrorsAndEncodings", () => {
  it("rejects every synchronized malformed token", () => {
    const header = { alg: "RS256", typ: "JWT" };
    const validPayload = {
      iss: "https://auth.example.com",
      sub: "user-123",
      aud: "my-client",
      exp: 1700000000,
      iat: 1699900000,
    };
    const goodHeaderB64 = base64Url('{"alg":"RS256"}');
    const validPayloadB64 = base64Url(JSON.stringify(validPayload));
    const badJSONB64 = base64Url("not-json");
    const tokens: Record<string, string> = {
      'badJSONB64 + "." + validPayloadB64 + ".sig"': `${badJSONB64}.${validPayloadB64}.sig`,
      'base64.RawURLEncoding.EncodeToString([]byte(`{"typ":"JWT"}`)) + "." + validPayloadB64 + ".sig"': `${base64Url('{"typ":"JWT"}')}.${validPayloadB64}.sig`,
      'goodHeaderB64 + ".!bad!.sig"': `${goodHeaderB64}.!bad!.sig`,
      'goodHeaderB64 + "." + badJSONB64 + ".sig"': `${goodHeaderB64}.${badJSONB64}.sig`,
      'strings.Repeat("a", 11*1024*1024)': "a".repeat(11 * 1024 * 1024),
      'strings.Repeat(".", 100)': ".".repeat(100),
    };
    for (const testCase of syncedCases<JwtParseErrorCase>(
      "ext/security/jwt/jwt_test.go/TestJWTParsingErrorsAndEncodings",
    )) {
      let tokenStr: string | undefined;
      if (typeof testCase.tokenStr === "string") {
        tokenStr = testCase.tokenStr;
      } else if (testCase.tokenStr.$expr.startsWith("createTestJWT(")) {
        tokenStr = testToken(header, goPayloadLiteral(testCase.tokenStr.$expr));
      } else {
        tokenStr = tokens[testCase.tokenStr.$expr];
      }
      expect(tokenStr, testCase.name).toBeDefined();
      expect(() => parseToken(tokenStr!), testCase.name).toThrow(testCase.errMsg);
    }
  });

  it("requires every claim upstream marks required", () => {
    const validPayload: Record<string, unknown> = {
      iss: "https://auth.example.com",
      sub: "user-123",
      aud: "my-client",
      exp: 1700000000,
      iat: 1699900000,
    };
    for (const claim of ["iss", "sub", "aud", "exp", "iat"]) {
      const payload = Object.fromEntries(
        Object.entries(validPayload).filter(([key]) => key !== claim),
      );
      expect(() => parseToken(testToken({ alg: "RS256", typ: "JWT" }, payload)), claim).toThrow(
        `missing required claim: '${claim}'`,
      );
    }
  });
});

describe("ext/security/jwt/jwt_test.go/TestTokenIsValidAt", () => {
  it("checks every synchronized validity window", () => {
    const now = parseTimestamp(new Date("2026-08-10T12:00:00Z"));
    const leeway = durationOf(5n * 60n * nanosPerSecond);
    for (const testCase of syncedCases<JwtValidAtCase>(
      "ext/security/jwt/jwt_test.go/TestTokenIsValidAt",
    )) {
      const token = goTokenLiteral(testCase.token.$expr, now);
      const caseLeeway =
        typeof testCase.leeway === "number" ? durationOf(BigInt(testCase.leeway)) : leeway;
      expect(token.isValidAt(now, caseLeeway), testCase.name).toBe(testCase.wantValid);
    }
  });
});

describe("ext/security/jwt/jwt.go", () => {
  it("adds a token's claims to the checked type", () => {
    const celEnv = env({ libraries: [jwt()], variables: [variable("t", JwtTokenType)] });
    expect(celEnv.compile("t.unknownClaim").errors?.toDisplayString()).toContain("undefined field");
  });

  it("reports a parse failure as an error rather than an empty optional", () => {
    const celEnv = env({ libraries: [jwt()], variables: [variable("tok", StringType)] });
    const program = celEnv.program(unwrapAst(celEnv.compile("jwt.parse(tok)")));
    const result = program.eval({ tok: "not-a-token" });
    expect(isError(result)).toBe(true);
    expect(String(result)).toContain("parse token failed");
  });

  it("accepts a token whose segments use the standard base64 alphabet", () => {
    const payload = {
      iss: "https://auth.example.com?a=1&b=2",
      sub: "user-123",
      aud: "my-client",
      exp: 1700000000,
      iat: 1699900000,
    };
    const standard = `${base64Std(JSON.stringify({ alg: "RS256" }))}.${base64Std(JSON.stringify(payload))}.sig`;
    expect(parseToken(standard).issuer).toBe(payload.iss);
  });

  it("configures the optional library it depends on", () => {
    const celEnv = env({ libraries: [jwt()], variables: [variable("tok", StringType)] });
    expect(evaluate(celEnv, "optional.none().orValue('fallback')", {})).toBe("fallback");
  });
});

/**
 * evaluate compiles and evaluates an expression, returning its native result.
 */
function evaluate(celEnv: ReturnType<typeof env>, expr: string, activation: object): unknown {
  return celEnv
    .program(unwrapAst(celEnv.compile(expr)))
    .eval(activation)
    .value();
}

/**
 * optionalValue unwraps the value held by an optional result.
 */
function optionalValue(value: unknown): unknown {
  expect(value).toBeInstanceOf(Optional);
  return (value as Optional).getValue().value();
}

/**
 * testToken encodes a header and payload as an unsigned JWT with a placeholder signature.
 */
function testToken(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return [
    base64Url(JSON.stringify(header)),
    base64Url(JSON.stringify(payload)),
    base64Url("signature-placeholder"),
  ].join(".");
}

/**
 * validatedToken builds a token carrying only the time claims a validity case needs.
 */
function validatedToken(
  issuedAt: bigint,
  notBefore: bigint | undefined,
  expiresAt: bigint,
): string {
  return testToken(
    { alg: "RS256", typ: "JWT" },
    {
      iss: "https://auth.example.com",
      sub: "user-123",
      aud: "my-aud",
      iat: Number(issuedAt),
      ...(notBefore === undefined ? {} : { nbf: Number(notBefore) }),
      exp: Number(expiresAt),
    },
  );
}

/**
 * base64Url encodes text as unpadded URL-safe base64.
 */
function base64Url(text: string): string {
  return base64Std(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * base64Std encodes text as padded standard base64.
 */
function base64Std(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

/**
 * goValue resolves a synchronized Go conversion expression to its TypeScript equivalent.
 *
 * Every numeric width upstream distinguishes reaches the token as one JSON number, and Go's
 * `json.Number` is a numeric literal in JSON as well.
 */
function goValue(value: unknown): unknown {
  const expression = (value as Partial<ExprRef> | undefined)?.$expr;
  if (expression === undefined) {
    return value;
  }
  const numeric = /^(u?int(?:8|16|32|64)?|float(?:32|64)|json\.Number)\("?(-?[0-9.]+)"?\)$/.exec(
    expression,
  );
  if (!numeric) {
    throw new Error(`unsupported synchronized expression: ${expression}`);
  }
  return Number(numeric[2]!);
}

/**
 * jwtOptions resolves the synchronized upstream library options.
 */
function jwtOptions(options: ExprRef[] | null, fixedNow: Timestamp): JwtOptions {
  let resolved: JwtOptions = {};
  for (const option of options ?? []) {
    const validateTimes = /^jwt\.ValidateTimes\((?:(\d+) \* time\.Minute)?\)$/.exec(option.$expr);
    if (validateTimes) {
      resolved = {
        ...resolved,
        validateTimes: true,
        ...(validateTimes[1] === undefined
          ? {}
          : { clockLeeway: durationOf(BigInt(validateTimes[1]) * 60n * nanosPerSecond) }),
      };
      continue;
    }
    if (option.$expr === "jwt.Clock(func() time.Time { return fixedNow })") {
      resolved = { ...resolved, clock: () => fixedNow };
      continue;
    }
    throw new Error(`unsupported synchronized option: ${option.$expr}`);
  }
  return resolved;
}

/**
 * goPayloadLiteral reads the payload out of a synchronized `createTestJWT` call.
 */
function goPayloadLiteral(expression: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const entries = /map\[string\]any\{([\s\S]*)\}\s*\)$/.exec(expression);
  if (!entries) {
    throw new Error(`unsupported synchronized token expression: ${expression}`);
  }
  const pattern = /"([a-z]+)":\s*(\[\]any\{[^}]*\}|"[^"]*"|-?\d+)/g;
  for (let match = pattern.exec(entries[1]!); match; match = pattern.exec(entries[1]!)) {
    payload[match[1]!] = goLiteral(match[2]!);
  }
  return payload;
}

/**
 * goLiteral resolves one Go literal from a synchronized payload.
 */
function goLiteral(literal: string): unknown {
  if (literal.startsWith("[]any{")) {
    return literal
      .slice("[]any{".length, -1)
      .split(",")
      .map((item) => goLiteral(item.trim()));
  }
  if (literal.startsWith('"')) {
    return literal.slice(1, -1);
  }
  return Number(literal);
}

/**
 * goTokenLiteral builds a token from a synchronized `jwt.Token` composite literal.
 *
 * The literal sets time claims relative to the test's reference instant, so the offsets are
 * resolved against the same instant here.
 */
function goTokenLiteral(expression: string, now: Timestamp): Token {
  const options: {
    expiresAt?: Timestamp;
    issuedAt?: Timestamp;
    issuer?: string;
    notBefore?: Timestamp;
  } = {};
  const pattern = /(IssuedAt|NotBefore|ExpiresAt|Issuer):\s*(now(?:\.Add\([^)]*\))?|"[^"]*")/g;
  for (let match = pattern.exec(expression); match; match = pattern.exec(expression)) {
    const field = match[1]!;
    const value = match[2]!;
    if (field === "Issuer") {
      options.issuer = value.slice(1, -1);
      continue;
    }
    const instant = goInstant(value, now);
    if (field === "IssuedAt") {
      options.issuedAt = instant;
    } else if (field === "NotBefore") {
      options.notBefore = instant;
    } else {
      options.expiresAt = instant;
    }
  }
  return new Token(options);
}

/**
 * goInstant resolves `now` or `now.Add(n * time.Unit)` against the reference instant.
 */
function goInstant(value: string, now: Timestamp): Timestamp {
  if (value === "now") {
    return now;
  }
  const offset = /^now\.Add\((-?\d+) \* time\.(Hour|Minute)\)$/.exec(value);
  if (!offset) {
    throw new Error(`unsupported synchronized instant: ${value}`);
  }
  const unitSeconds = offset[2] === "Hour" ? 3600n : 60n;
  return timestampOf(now.seconds() + BigInt(offset[1]!) * unitSeconds, now.nanos());
}

/**
 * newToken is exercised directly so a token may be built from an already decoded JWT.
 */
describe("ext/security/jwt/jwt.go/NewToken", () => {
  it("builds a token from a decoded header and payload", () => {
    const token = newToken(
      { alg: "RS256", kid: "kid-1" },
      {
        iss: "https://auth.example.com",
        sub: "user-1",
        aud: ["a", "b"],
        azp: "a",
        jti: "id-1",
        exp: 1700000000,
        iat: 1699900000,
      },
    );
    expect(token.audience).toEqual(["a", "b"]);
    expect(token.keyId).toBe("kid-1");
    expect(token.id).toBe("id-1");
    expect(token.presentedBy("https://auth.example.com", "a")).toBe(true);
    expect(token.presentedBy("https://auth.example.com", "b")).toBe(false);
  });

  it("rejects a header without an algorithm", () => {
    expect(() => newToken({}, {})).toThrow("missing required header: 'alg'");
  });
});

/** Stable error codes produced by the repo package itself. */
export const RepoErrorCode = {
  UNEXPECTED_INTERCEPTOR_CONTEXT: "UNEXPECTED_INTERCEPTOR_CONTEXT",
  UNSUPPORTED_QUERY_TYPE: "UNSUPPORTED_QUERY_TYPE",
} as const;

/** Union of all repo package error codes. */
export type RepoErrorCode = (typeof RepoErrorCode)[keyof typeof RepoErrorCode];

/** Base error for repo package-defined failures. */
export class RepoError extends Error {
  /** Stable machine-readable error code. */
  public readonly code: RepoErrorCode;

  public constructor(code: RepoErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "RepoError";
  }
}

/** Raised when interceptor helpers receive the wrong operation context. */
export class UnexpectedInterceptorContextError extends RepoError {
  public readonly expected: string;
  public readonly actual: string;

  public constructor(expected: string, actual: string) {
    super(
      RepoErrorCode.UNEXPECTED_INTERCEPTOR_CONTEXT,
      `Unexpected interceptor context: expected ${expected}, got ${actual}`,
    );
    this.expected = expected;
    this.actual = actual;
    this.name = "UnexpectedInterceptorContextError";
  }
}

/** Raised when an engine execute() receives an unsupported query value type. */
export class UnsupportedQueryTypeRepoError extends RepoError {
  public readonly engine: string;
  public readonly expected: string;
  public readonly received: string;

  public constructor(engine: string, expected: string, received: string, message: string) {
    super(RepoErrorCode.UNSUPPORTED_QUERY_TYPE, message);
    this.engine = engine;
    this.expected = expected;
    this.received = received;
    this.name = "UnsupportedQueryTypeRepoError";
  }
}

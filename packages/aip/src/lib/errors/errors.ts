import { Code } from '../gen/google/rpc/code_pb.js';
import { Status } from '../gen/google/rpc/status_pb.js';
import { errorDetails, ErrorDetails, status, StatusInit, unpackErrorDetails } from './status.js';

/**
 * An `Error` class that helps construct and unpack google.rpc.Status errors.
 *
 * See: https://google.aip.dev/193
 */
export class StatusError extends Error {
  public readonly code: Code;
  public readonly details: ErrorDetails;
  public readonly httpCode?: number;

  constructor(init: StatusInit & { httpCode?: number }) {
    const { code, message, httpCode, ...details } = init;
    super(message);
    this.name = 'StatusError';
    this.code = code;
    this.httpCode = httpCode ?? 500;
    this.details = errorDetails(details);
  }

  /**
   * Creates a `StatusError` from a google.rpc.Status message.
   */
  static fromStatus(status: Status) {
    const details = unpackErrorDetails(status.details);
    return new StatusError({
      message: status.message,
      code: status.code,
      ...details,
    });
  }

  /**
   * Creates a google.rpc.Status message from this `StatusError`.
   */
  toStatus(): Status {
    return status({
      code: this.code,
      message: this.message,
      ...this.details,
    });
  }
}

/**
 * The operation was cancelled, typically by the caller.
 */
export class CancelledError extends StatusError {
  public static code = Code.CANCELLED;
  public static httpCode = 499;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: CancelledError.code,
      httpCode: CancelledError.httpCode,
      ...init,
    });
    this.name = 'CancelledError';
  }
}

/**
 * Unknown error.  For example, this error may be returned when a `Status`
 * value received from another address space belongs to an error space that is
 * not known in this address space.  Also errors raised by APIs that do not
 * return enough error information may be converted to this error.
 */
export class UnknownError extends StatusError {
  public static code = Code.UNKNOWN;
  public static httpCode = 500;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: UnknownError.code,
      httpCode: UnknownError.httpCode,
      ...init,
    });
    this.name = 'UnknownError';
  }
}

/**
 * The client specified an invalid argument.  Note that this differs from
 * `FAILED_PRECONDITION`.  `INVALID_ARGUMENT` indicates arguments that are
 * problematic regardless of the state of the system (e.g., a malformed file
 * name).
 */
export class InvalidArgumentError extends StatusError {
  public static code = Code.INVALID_ARGUMENT;
  public static httpCode = 400;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: InvalidArgumentError.code,
      httpCode: InvalidArgumentError.httpCode,
      ...init,
    });
    this.name = 'InvalidArgumentError';
  }
}

/**
 * The deadline expired before the operation could complete. For operations
 * that change the state of the system, this error may be returned even if the
 * operation has completed successfully.  For example, a successful response
 * from a server could have been delayed long enough for the deadline to expire.
 */
export class DeadlineExceededError extends StatusError {
  public static code = Code.DEADLINE_EXCEEDED;
  public static httpCode = 504;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: DeadlineExceededError.code,
      httpCode: DeadlineExceededError.httpCode,
      ...init,
    });
    this.name = 'DeadlineExceededError';
  }
}

/**
 * Some requested entity (e.g., file or directory) was not found.
 *
 * Note to server developers: if a request is denied for an entire class of
 * users, such as gradual feature rollout or undocumented allowlist,
 * `NOT_FOUND` may be used. If a request is denied for some users within a
 * class of users, such as user-based access control, `PERMISSION_DENIED` must
 * be used.
 */
export class NotFoundError extends StatusError {
  public static code = Code.NOT_FOUND;
  public static httpCode = 404;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: NotFoundError.code,
      httpCode: NotFoundError.httpCode,
      ...init,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * The entity that a client attempted to create (e.g., file or directory)
 * already exists.
 */
export class AlreadyExistsError extends StatusError {
  public static code = Code.ALREADY_EXISTS;
  public static httpCode = 409;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: AlreadyExistsError.code,
      httpCode: AlreadyExistsError.httpCode,
      ...init,
    });
    this.name = 'AlreadyExistsError';
  }
}

/**
 * The caller does not have permission to execute the specified operation.
 * `PERMISSION_DENIED` must not be used for rejections caused by exhausting
 * some resource (use `RESOURCE_EXHAUSTED` instead for those errors).
 * `PERMISSION_DENIED` must not be used if the caller can not be identified
 * (use `UNAUTHENTICATED` instead for those errors). This error code does not
 * imply the request is valid or the requested entity exists or satisfies other
 * pre-conditions.
 */
export class PermissionDeniedError extends StatusError {
  public static code = Code.PERMISSION_DENIED;
  public static httpCode = 403;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: PermissionDeniedError.code,
      httpCode: PermissionDeniedError.httpCode,
      ...init,
    });
    this.name = 'PermissionDeniedError';
  }
}

/**
 * The request does not have valid authentication credentials for the operation.
 */
export class UnauthenticatedError extends StatusError {
  public static code = Code.UNAUTHENTICATED;
  public static httpCode = 401;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: UnauthenticatedError.code,
      httpCode: UnauthenticatedError.httpCode,
      ...init,
    });
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Some resource has been exhausted, perhaps a per-user quota, or perhaps the
 * entire file system is out of space.
 */
export class ResourceExhaustedError extends StatusError {
  public static code = Code.RESOURCE_EXHAUSTED;
  public static httpCode = 429;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: ResourceExhaustedError.code,
      httpCode: ResourceExhaustedError.httpCode,
      ...init,
    });
    this.name = 'ResourceExhaustedError';
  }
}

/**
 * The operation was rejected because the system is not in a state required for
 * the operation's execution.  For example, the directory to be deleted is
 * non-empty, an rmdir operation is applied to a non-directory, etc.
 *
 * Service implementors can use the following guidelines to decide between
 * `FAILED_PRECONDITION`, `ABORTED`, and `UNAVAILABLE`:
 *    (a) Use `UNAVAILABLE` if the client can retry just the failing call.
 *    (b) Use `ABORTED` if the client should retry at a higher level. For
 *        example, when a client-specified test-and-set fails, indicating the
 *        client should restart a read-modify-write sequence.
 *    (c) Use `FAILED_PRECONDITION` if the client should not retry until the
 *        system state has been explicitly fixed. For example, if an "rmdir"
 *        fails because the directory is non-empty, `FAILED_PRECONDITION`
 *        should be returned since the client should not retry unless the files
 *        are deleted from the directory.
 */
export class FailedPreconditionError extends StatusError {
  public static code = Code.FAILED_PRECONDITION;
  public static httpCode = 400;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: FailedPreconditionError.code,
      httpCode: FailedPreconditionError.httpCode,
      ...init,
    });
    this.name = 'FailedPreconditionError';
  }
}

/**
 * The operation was aborted, typically due to a concurrency issue such as a
 * sequencer check failure or transaction abort.
 */
export class AbortedError extends StatusError {
  public static code = Code.ABORTED;
  public static httpCode = 409;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: AbortedError.code,
      httpCode: AbortedError.httpCode,
      ...init,
    });
    this.name = 'AbortedError';
  }
}

/**
 * The operation was attempted past the valid range.  E.g., seeking or reading
 * past end-of-file.
 *
 * Unlike `INVALID_ARGUMENT`, this error indicates a problem that may be fixed
 * if the system state changes. For example, a 32-bit file system will generate
 * `INVALID_ARGUMENT` if asked to read at an offset that is not in the range [0
 * 2^32-1], but it will generate `OUT_OF_RANGE` if asked to read from an offset
 * past the current file size.
 *
 * There is a fair bit of overlap between `FAILED_PRECONDITION` and
 * `OUT_OF_RANGE`.  We recommend using `OUT_OF_RANGE` (the more specific error)
 * when it applies so that callers who are iterating through a space can easily
 * look for an `OUT_OF_RANGE` error to detect when they are done.
 */
export class OutOfRangeError extends StatusError {
  public static code = Code.OUT_OF_RANGE;
  public static httpCode = 400;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: OutOfRangeError.code,
      httpCode: OutOfRangeError.httpCode,
      ...init,
    });
    this.name = 'OutOfRangeError';
  }
}

/**
 * The operation is not implemented or is not supported/enabled in this
 * service.
 */
export class UnimplementedError extends StatusError {
  public static code = Code.UNIMPLEMENTED;
  public static httpCode = 501;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: UnimplementedError.code,
      httpCode: UnimplementedError.httpCode,
      ...init,
    });
    this.name = 'UnimplementedError';
  }
}

/**
 * Internal errors.  This means that some invariants expected by the underlying
 * system have been broken.  This error code is reserved for serious errors.
 */
export class InternalError extends StatusError {
  public static code = Code.INTERNAL;
  public static httpCode = 500;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: InternalError.code,
      httpCode: InternalError.httpCode,
      ...init,
    });
    this.name = 'InternalError';
  }
}

/**
 * The operation is unavailable.  This indicates a transient condition and may
 * be corrected by retrying with a backoff.  Note that it is not always safe to
 * retry the same operation.
 */
export class UnavailableError extends StatusError {
  public static code = Code.UNAVAILABLE;
  public static httpCode = 503;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: UnavailableError.code,
      httpCode: UnavailableError.httpCode,
      ...init,
    });
    this.name = 'UnavailableError';
  }
}

/**
 * Unrecoverable data loss or corruption.
 */
export class DataLossError extends StatusError {
  public static code = Code.DATA_LOSS;
  public static httpCode = 500;

  constructor(init: Omit<StatusInit, 'code'>) {
    super({
      code: DataLossError.code,
      httpCode: DataLossError.httpCode,
      ...init,
    });
    this.name = 'DataLossError';
  }
}

/**
 * Build a `StatusError` or one of its more specific subclasses from a
 * google.rpc.Status message. Possible subclasses include:
 * - `CancelledError`
 * - `UnknownError`
 * - `InvalidArgumentError`
 * - `DeadlineExceededError`
 * - `NotFoundError`
 * - `AlreadyExistsError`
 * - `PermissionDeniedError`
 * - `UnauthenticatedError`
 * - `ResourceExhaustedError`
 * - `FailedPreconditionError`
 * - `AbortedError`
 * - `OutOfRangeError`
 * - `UnimplementedError`
 * - `InternalError`
 * - `UnavailableError`
 * - `DataLossError`
 */
export function parseStatusError(status: Status) {
  switch (status.code) {
    case Code.CANCELLED:
      return CancelledError.fromStatus(status);
    case Code.UNKNOWN:
      return UnknownError.fromStatus(status);
    case Code.INVALID_ARGUMENT:
      return InvalidArgumentError.fromStatus(status);
    case Code.DEADLINE_EXCEEDED:
      return DeadlineExceededError.fromStatus(status);
    case Code.NOT_FOUND:
      return NotFoundError.fromStatus(status);
    case Code.ALREADY_EXISTS:
      return AlreadyExistsError.fromStatus(status);
    case Code.PERMISSION_DENIED:
      return PermissionDeniedError.fromStatus(status);
    case Code.UNAUTHENTICATED:
      return UnauthenticatedError.fromStatus(status);
    case Code.RESOURCE_EXHAUSTED:
      return ResourceExhaustedError.fromStatus(status);
    case Code.FAILED_PRECONDITION:
      return FailedPreconditionError.fromStatus(status);
    case Code.ABORTED:
      return AbortedError.fromStatus(status);
    case Code.OUT_OF_RANGE:
      return OutOfRangeError.fromStatus(status);
    case Code.UNIMPLEMENTED:
      return UnimplementedError.fromStatus(status);
    case Code.INTERNAL:
      return InternalError.fromStatus(status);
    case Code.UNAVAILABLE:
      return UnavailableError.fromStatus(status);
    case Code.DATA_LOSS:
      return DataLossError.fromStatus(status);
    default:
      return StatusError.fromStatus(status);
  }
}

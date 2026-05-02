/** Stable error codes produced by the pubsub package. */
export const PubSubErrorCode = {
  TRANSIENT: "TRANSIENT",
  INVALID_INPUT: "INVALID_INPUT",
  UNRECOVERABLE: "UNRECOVERABLE",
  ABORTED: "ABORTED",
  INVALID_STATE: "INVALID_STATE",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  SCHEDULER_REQUIRED: "SCHEDULER_REQUIRED",
  UNKNOWN_SERVICE_METHOD: "UNKNOWN_SERVICE_METHOD",
  NO_SUBSCRIBER: "NO_SUBSCRIBER",
} as const;

/** Union of all pubsub error codes. */
export type PubSubErrorCode = (typeof PubSubErrorCode)[keyof typeof PubSubErrorCode];

/** Base error for pubsub handler and routing failures. */
export class PubSubError extends Error {
  /** Stable machine-readable error code. */
  public readonly code: PubSubErrorCode;

  /** Create a pubsub error. */
  public constructor(code: PubSubErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "PubSubError";
  }
}

/** Error for failures that should be retried. */
export class TransientPubSubError extends PubSubError {
  /** Create a transient pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.TRANSIENT, message, options);
    this.name = "TransientPubSubError";
  }
}

/** Error for invalid payloads or unsupported input that should be rejected. */
export class InvalidInputPubSubError extends PubSubError {
  /** Create an invalid-input pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.INVALID_INPUT, message, options);
    this.name = "InvalidInputPubSubError";
  }
}

/** Error for unrecoverable failures that should be dead-lettered. */
export class UnrecoverablePubSubError extends PubSubError {
  /** Create an unrecoverable pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.UNRECOVERABLE, message, options);
    this.name = "UnrecoverablePubSubError";
  }
}

/** Error for operations attempted after an abort signal. */
export class AbortedPubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.ABORTED, message, options);
    this.name = "AbortedPubSubError";
  }
}

/** Error for invalid transport or scheduler runtime state. */
export class InvalidStatePubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.INVALID_STATE, message, options);
    this.name = "InvalidStatePubSubError";
  }
}

/** Error for invalid pubsub configuration or method arguments. */
export class InvalidArgumentPubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.INVALID_ARGUMENT, message, options);
    this.name = "InvalidArgumentPubSubError";
  }
}

/** Error when delayed publish/retry is requested without a scheduler. */
export class SchedulerRequiredPubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.SCHEDULER_REQUIRED, message, options);
    this.name = "SchedulerRequiredPubSubError";
  }
}

/** Error for unknown service method lookups. */
export class UnknownServiceMethodPubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.UNKNOWN_SERVICE_METHOD, message, options);
    this.name = "UnknownServiceMethodPubSubError";
  }
}

/** Error for in-memory delivery when no subscriber has been registered. */
export class NoSubscriberPubSubError extends PubSubError {
  public constructor(message: string, options?: ErrorOptions) {
    super(PubSubErrorCode.NO_SUBSCRIBER, message, options);
    this.name = "NoSubscriberPubSubError";
  }
}

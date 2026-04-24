/** Base error for pubsub handler and routing failures. */
export class PubSubError extends Error {
  /** Create a pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PubSubError";
  }
}

/** Error for failures that should be retried. */
export class TransientPubSubError extends PubSubError {
  /** Create a transient pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransientPubSubError";
  }
}

/** Error for invalid payloads or unsupported input that should be rejected. */
export class InvalidInputPubSubError extends PubSubError {
  /** Create an invalid-input pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidInputPubSubError";
  }
}

/** Error for unrecoverable failures that should be dead-lettered. */
export class UnrecoverablePubSubError extends PubSubError {
  /** Create an unrecoverable pubsub error. */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnrecoverablePubSubError";
  }
}

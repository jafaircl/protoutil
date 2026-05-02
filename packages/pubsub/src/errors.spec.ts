import { describe, expect, it } from "vitest";
import {
  AbortedPubSubError,
  InvalidArgumentPubSubError,
  InvalidInputPubSubError,
  InvalidStatePubSubError,
  NoSubscriberPubSubError,
  PubSubErrorCode,
  SchedulerRequiredPubSubError,
  TransientPubSubError,
  UnknownServiceMethodPubSubError,
  UnrecoverablePubSubError,
} from "./errors.js";

describe("pubsub errors", () => {
  it("assigns stable codes to each pubsub error type", () => {
    expect(new TransientPubSubError("retry").code).toBe(PubSubErrorCode.TRANSIENT);
    expect(new InvalidInputPubSubError("bad input").code).toBe(PubSubErrorCode.INVALID_INPUT);
    expect(new UnrecoverablePubSubError("dead letter").code).toBe(PubSubErrorCode.UNRECOVERABLE);
    expect(new AbortedPubSubError("aborted").code).toBe(PubSubErrorCode.ABORTED);
    expect(new InvalidStatePubSubError("state").code).toBe(PubSubErrorCode.INVALID_STATE);
    expect(new InvalidArgumentPubSubError("argument").code).toBe(PubSubErrorCode.INVALID_ARGUMENT);
    expect(new SchedulerRequiredPubSubError("scheduler").code).toBe(
      PubSubErrorCode.SCHEDULER_REQUIRED,
    );
    expect(new UnknownServiceMethodPubSubError("method").code).toBe(
      PubSubErrorCode.UNKNOWN_SERVICE_METHOD,
    );
    expect(new NoSubscriberPubSubError("subscriber").code).toBe(PubSubErrorCode.NO_SUBSCRIBER);
  });
});

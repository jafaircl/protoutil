import { create } from "@bufbuild/protobuf";
import { anyPack } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  InvalidInputPubSubError,
  TransientPubSubError,
  UnrecoverablePubSubError,
} from "./errors.js";
import { CloudEventSchema } from "./gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  AlphaEventSchema,
  BetaEventSchema,
  ConformanceEvents,
} from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { InMemoryPubSubTransport } from "./memory-transport.js";
import { createRouter } from "./router.js";

describe("pubsub dispositions", () => {
  it("uses explicit handler context dispositions including delayed retry", async () => {
    const router = createRouter(ConformanceEvents, new InMemoryPubSubTransport());
    router.service({
      async betaHappened(_request, context) {
        await context.retry({ delay: { seconds: 3n } });
      },
    });

    const disposition = await router.dispatch({
      event: create(CloudEventSchema, {
        id: "event-2",
        source: "billing-service",
        specVersion: "1.0",
        type: "protoutil.pubsub.testing.v1.ConformanceEvents.BetaHappened",
        data: {
          case: "protoData",
          value: anyPack(
            BetaEventSchema,
            create(BetaEventSchema, { eventId: "evt_123", detail: "beta-detail" }),
          ),
        },
      }),
    });

    expect(disposition).toEqual({ kind: "retry", delay: { seconds: 3n } });
  });

  it("normalizes thrown errors and invalid payloads to dispositions", async () => {
    const router = createRouter(ConformanceEvents, new InMemoryPubSubTransport());
    router.service({
      async alphaHappened() {
        throw new TransientPubSubError("try again");
      },
      async betaHappened() {
        throw new UnrecoverablePubSubError("stop");
      },
    });

    await expect(
      router.dispatch({
        event: alphaEvent("event-4", "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened"),
      }),
    ).resolves.toMatchObject({
      kind: "retry",
    });
    await expect(
      router.dispatch({
        event: betaEvent("event-5", "protoutil.pubsub.testing.v1.ConformanceEvents.BetaHappened"),
      }),
    ).resolves.toMatchObject({
      kind: "dead_letter",
    });

    const invalid = await router.dispatch({
      event: create(CloudEventSchema, {
        id: "event-6",
        source: "billing-service",
        specVersion: "1.0",
        type: "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
        data: { case: "textData", value: "nope" },
      }),
    });
    expect(invalid.kind).toBe("reject");
    expect(invalid.error).toBeInstanceOf(InvalidInputPubSubError);
  });
});

/** Build a valid AlphaHappened CloudEvent for disposition tests. */
function alphaEvent(id: string, type: string) {
  return create(CloudEventSchema, {
    id,
    source: "billing-service",
    specVersion: "1.0",
    type,
    data: {
      case: "protoData",
      value: anyPack(
        AlphaEventSchema,
        create(AlphaEventSchema, { eventId: "evt_123", name: "alpha" }),
      ),
    },
  });
}

/** Build a valid BetaHappened CloudEvent for disposition tests. */
function betaEvent(id: string, type: string) {
  return create(CloudEventSchema, {
    id,
    source: "billing-service",
    specVersion: "1.0",
    type,
    data: {
      case: "protoData",
      value: anyPack(
        BetaEventSchema,
        create(BetaEventSchema, { eventId: "evt_123", detail: "beta-detail" }),
      ),
    },
  });
}

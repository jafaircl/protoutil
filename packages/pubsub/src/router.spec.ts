import { create } from "@bufbuild/protobuf";
import { anyPack } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { CloudEventSchema } from "./gen/io/cloudevents/v1/cloudevents_pb.js";
import {
  AlphaEventSchema,
  ConformanceEvents,
} from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { InMemoryPubSubTransport } from "./memory-transport.js";
import { createPublisher } from "./publisher.js";
import { createRouter } from "./router.js";

describe("pubsub router", () => {
  it("routes by CloudEvent type, decodes protobuf Any payload, and maps success to ACK", async () => {
    const transport = new InMemoryPubSubTransport();
    const router = createRouter(ConformanceEvents, transport);
    let seenInvoiceId = "";

    router.service({
      async alphaHappened(request, context) {
        seenInvoiceId = request.eventId;
        expect(context.event.type).toBe(
          "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
        );
      },
    });
    await router.subscribe({ consumerGroup: "billing-workers", concurrency: 10 });

    const client = createPublisher(ConformanceEvents, transport, { source: "billing-service" });
    await client.alphaHappened({ eventId: "evt_123", name: "alpha" });

    expect(seenInvoiceId).toBe("evt_123");
    expect(transport.dispositions[0]).toEqual({ kind: "ack" });
  });

  it("dead letters unknown routes", async () => {
    const router = createRouter(ConformanceEvents, new InMemoryPubSubTransport());
    const event = create(CloudEventSchema, {
      id: "event-unknown",
      source: "billing-service",
      specVersion: "1.0",
      type: "Missing",
      data: {
        case: "protoData",
        value: anyPack(AlphaEventSchema, create(AlphaEventSchema, { eventId: "evt_123" })),
      },
    });

    await expect(router.dispatch({ event })).resolves.toEqual({ kind: "dead_letter" });
  });

  it("uses router topic config for subscribe requests without changing CloudEvent type", async () => {
    const transport = new InMemoryPubSubTransport();
    const router = createRouter(ConformanceEvents, transport, {
      topic: { alphaHappened: "billing.invoice.created" },
    });
    let seenTopic = "";
    let seenType = "";

    router.service({
      async alphaHappened(_request, context) {
        seenType = context.event.type;
      },
    });
    await router.subscribe({ consumerGroup: "billing-workers" });

    const client = createPublisher(ConformanceEvents, transport, {
      topic: { alphaHappened: "billing.invoice.created" },
      source: "billing-service",
    });
    await client.alphaHappened({ eventId: "evt_123", name: "alpha" });
    seenTopic = transport.published[0]?.topic ?? "";

    expect(seenTopic).toBe("billing.invoice.created");
    expect(seenType).toBe("protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened");
  });
});

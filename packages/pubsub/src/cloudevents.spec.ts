import { anyUnpack, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import {
  AlphaEventSchema,
  ConformanceEvents,
} from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { InMemoryPubSubTransport } from "./memory-transport.js";
import { createPublisher } from "./publisher.js";

describe("CloudEvent publishing", () => {
  it("materializes every publish as a generated CloudEvent protobuf message", async () => {
    const transport = new InMemoryPubSubTransport();
    const client = createPublisher(ConformanceEvents, transport, { source: "billing-service" });
    const notBefore = timestampFromDate(new Date("2026-04-22T12:00:05.000Z"));

    await client.alphaHappened(
      { eventId: "evt_123", name: "alpha" },
      {
        id: "event-1",
        topic: "custom.topic",
        metadata: { tenantid: "t1" },
        notBefore,
        time: "2026-04-22T12:00:00.000Z",
      },
    );

    const published = transport.published[0];
    expect(published.topic).toBe("custom.topic");
    expect(published.notBefore).toEqual(notBefore);
    expect(published.event).toMatchObject({
      $typeName: "io.cloudevents.v1.CloudEvent",
      id: "event-1",
      source: "billing-service",
      specVersion: "1.0",
      type: "AlphaHappened",
    });
    expect(published.event.attributes.datacontenttype.attr).toEqual({
      case: "ceString",
      value: "application/protobuf",
    });
    expect(published.event.attributes.dataschema.attr).toEqual({
      case: "ceString",
      value: "protoutil.pubsub.testing.v1.AlphaEvent",
    });
    expect(published.event.attributes.tenantid.attr).toEqual({
      case: "ceString",
      value: "t1",
    });
    expect(published.event.attributes.notbefore.attr).toEqual({
      case: "ceTimestamp",
      value: notBefore,
    });
    expect(published.event.data.case).toBe("protoData");
    if (published.event.data.case === "protoData") {
      expect(anyUnpack(published.event.data.value, AlphaEventSchema)).toMatchObject({
        eventId: "evt_123",
        name: "alpha",
      });
    }
  });
});

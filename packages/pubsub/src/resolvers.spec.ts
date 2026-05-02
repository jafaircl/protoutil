import { describe, expect, it } from "vitest";
import { ConformanceEvents } from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import {
  resolveCloudEventSource,
  resolveCloudEventType,
  resolvePublisherOptions,
  resolveTopic,
} from "./index.js";
import { InMemoryPubSubTransport } from "./memory-transport.js";

const alphaHappened = ConformanceEvents.method.alphaHappened;

describe("pubsub resolvers", () => {
  it("resolves topic with explicit or fully qualified method defaults", () => {
    expect(resolveTopic(alphaHappened)).toBe(
      "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
    );
    expect(resolveTopic(alphaHappened, { topic: "custom.topic" })).toBe("custom.topic");
  });

  it("resolves CloudEvent type with explicit or fully qualified method defaults", () => {
    expect(resolveCloudEventType(alphaHappened)).toBe(
      "protoutil.pubsub.testing.v1.ConformanceEvents.AlphaHappened",
    );
    expect(resolveCloudEventType(alphaHappened, { type: "com.example.AlphaHappened.v2" })).toBe(
      "com.example.AlphaHappened.v2",
    );
  });

  it("resolves publisher topic precedence with per-call override first", () => {
    const transport = new InMemoryPubSubTransport({ defaultSource: "transport-source" });

    expect(
      resolvePublisherOptions(
        alphaHappened,
        transport,
        { topic: { alphaHappened: "billing.invoice.created" } },
        undefined,
      ).topic,
    ).toBe("billing.invoice.created");
    expect(
      resolvePublisherOptions(
        alphaHappened,
        transport,
        { topic: "billing.events" },
        { topic: "replay.events" },
      ).topic,
    ).toBe("replay.events");
  });

  it("resolves source with call, client, transport, then library precedence", () => {
    const transport = new InMemoryPubSubTransport({ defaultSource: "transport-source" });

    expect(resolveCloudEventSource(transport)).toBe("transport-source");
    expect(resolveCloudEventSource(transport, { source: "client-source" })).toBe("client-source");
    expect(
      resolveCloudEventSource(transport, { source: "client-source" }, { source: "call-source" }),
    ).toBe("call-source");
  });
});

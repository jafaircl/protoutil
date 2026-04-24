import { describe, expect, it } from "vitest";
import { ConformanceEvents } from "./gen/protoutil/pubsub/testing/v1/events_pb.js";
import { InMemoryPubSubTransport } from "./memory-transport.js";
import { resolveCloudEventSource, resolveCloudEventType, resolveTopic } from "./resolvers.js";

const alphaHappened = ConformanceEvents.method.alphaHappened;

describe("pubsub resolvers", () => {
  it("resolves topic with explicit, method, then message precedence", () => {
    expect(resolveTopic(alphaHappened)).toBe("AlphaHappened");
    expect(resolveTopic(alphaHappened, { topic: "custom.topic" })).toBe("custom.topic");
  });

  it("resolves CloudEvent type with explicit, method, then message precedence", () => {
    expect(resolveCloudEventType(alphaHappened)).toBe("AlphaHappened");
    expect(resolveCloudEventType(alphaHappened, { type: "com.example.AlphaHappened.v2" })).toBe(
      "com.example.AlphaHappened.v2",
    );
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

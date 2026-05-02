/**
 * RabbitMQ pubsub transport for the fastify server.
 *
 * In production, configure RABBITMQ_URL via environment variable.
 * Uses docker-compose port 5675 so the example app does not collide with the
 * pubsub conformance and benchmark infrastructure.
 */

import type { HandlerContext, PubSubTransport } from "@protoutil/pubsub";
import { createPublisher, createRouter } from "@protoutil/pubsub";
import { createRabbitMqTransport } from "@protoutil/pubsub/rabbitmq";
import type {
  BookCreatedEvent,
  BookDeletedEvent,
  ShelfCreatedEvent,
} from "./gen/library/v1/library_pb.js";
import { LibraryEvents } from "./gen/library/v1/library_pb.js";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5675";

/** RabbitMQ-backed transport for event publishing/subscribing. */
let transport: PubSubTransport | null = null;

/**
 * A shared AbortController signal that can be used to trigger shutdown of the pubsub
 */
const shutdownController = new AbortController();

/** Initialize the RabbitMQ transport. */
export async function initPubsub(): Promise<void> {
  transport = createRabbitMqTransport({
    url: RABBITMQ_URL,
    defaultSource: "library-service",
    signal: shutdownController.signal,
  });

  console.log("[pubsub] connecting to RabbitMQ...", { url: RABBITMQ_URL });
}

/** Create a publisher for LibraryEvents. */
export function getEventsPublisher() {
  if (!transport) {
    throw new Error("pubsub not initialized - call initPubsub() first");
  }
  return createPublisher(LibraryEvents, transport, {
    source: "library-service",
  });
}

/** Subscribe to event notifications. */
export async function startEventSubscription(): Promise<void> {
  if (!transport) {
    throw new Error("pubsub not initialized - call initPubsub() first");
  }

  const router = createRouter(LibraryEvents, transport);

  router.service({
    async bookCreated(request: BookCreatedEvent, ctx: HandlerContext): Promise<void> {
      console.log(`[event] book created: ${request.name} (${request.title} by ${request.author})`);
      await ctx.ack();
    },
    async bookDeleted(request: BookDeletedEvent, ctx: HandlerContext): Promise<void> {
      console.log(`[event] book deleted: ${request.name}`);
      await ctx.ack();
    },
    async shelfCreated(request: ShelfCreatedEvent, ctx: HandlerContext): Promise<void> {
      console.log(`[event] shelf created: ${request.name} (${request.theme})`);
      await ctx.ack();
    },
  });

  await router.subscribe({
    consumerGroup: "library-service",
    signal: shutdownController.signal,
  });
  console.log("[pubsub] subscribed to library events");
}

/** Close the pubsub transport and subscription. */
export async function closePubsub(): Promise<void> {
  shutdownController.abort();
  console.log("[pubsub] shutting down...");
}

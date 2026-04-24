import type { DescMethodUnary, Message, MessageInitShape, MessageShape } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import type { CloudEvent } from "./gen/io/cloudevents/v1/cloudevents_pb.js";

/**
 * The generated CloudEvents protobuf message type used by pubsub transports.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/formats/protobuf-format.md | CloudEvents protobuf format}
 */
export type { CloudEvent };

/**
 * Primitive value types that can be written as CloudEvent extension attributes.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#extension-context-attributes | CloudEvents extension attributes}
 */
export type CloudEventMetadataValue = string | number | boolean | Uint8Array;

/**
 * Options for publishing a protobuf event as a CloudEvent.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export interface PublishOptions {
  /** Transport delivery topic. Defaults to the protobuf method name, then message type name. */
  topic?: string;
  /** Semantic CloudEvent type. Defaults to the protobuf method name, then message type name. */
  type?: string;
  /** CloudEvent source for this publish call. Overrides publisher and transport defaults. */
  source?: string;
  /** CloudEvent id. Defaults to a generated UUID. */
  id?: string;
  /** CloudEvent time. Defaults to the current time. */
  time?: Date | string;
  /** Additional CloudEvent extension attributes. */
  metadata?: Record<string, CloudEventMetadataValue>;
  /**
   * Durable one-shot delayed delivery deadline.
   *
   * Production transports must persist the delay before accepting the publish and must not
   * deliver before this timestamp.
   *
   * @see {@link https://protobuf.dev/reference/protobuf/google.protobuf/#timestamp | google.protobuf.Timestamp}
   */
  notBefore?: Timestamp;
}

/** Defaults applied to every publish call made by a publisher. */
export interface PublisherOptions {
  /** Default CloudEvent source when a publish call does not provide one. */
  source?: string;
}

/** Transport-neutral subscription options passed through to subscriber transports. */
export interface SubscribeOptions {
  /** Consumer group or durable subscription identifier owned by the transport. */
  consumerGroup?: string;
  /** Maximum concurrent deliveries requested from the transport. */
  concurrency?: number;
  /**
   * Maximum one-based delivery attempts before a retry disposition is converted
   * to a dead-letter disposition by the transport. Unset means no transport-enforced limit.
   */
  maxAttempts?: number;
  /** Optional cancellation signal for stopping long-running subscriptions. */
  signal?: AbortSignal;
}

/** Options for explicitly retrying a delivery from a handler. */
export interface RetryOptions {
  /**
   * Durable retry delay.
   *
   * Production transports must persist the retry before accepting the disposition and must not
   * redeliver earlier than this duration from now.
   *
   * @see {@link https://protobuf.dev/reference/protobuf/google.protobuf/#duration | google.protobuf.Duration}
   */
  delay?: Duration;
}

/** Normalized handler disposition names understood by transports. */
export type DispositionKind = "ack" | "retry" | "reject" | "dead_letter";

/** Normalized outcome for a consumed CloudEvent. */
export interface Disposition {
  /** The action a transport should take for the delivery. */
  kind: DispositionKind;
  /** Optional retry delay when `kind` is `retry`. */
  delay?: Duration;
  /** Optional error captured while normalizing handler failure. */
  error?: unknown;
}

/** Publish request handed from the core publisher to a transport. */
export interface PublishRequest {
  /** Transport delivery topic. */
  topic: string;
  /** CloudEvent containing the protobuf payload. */
  event: CloudEvent;
  /** Optional durable delayed delivery timestamp copied from publish options. */
  notBefore?: Timestamp;
}

/** CloudEvent delivery received from a subscriber transport. */
export interface Delivery {
  /** Delivered CloudEvent. */
  event: CloudEvent;
  /** Transport topic the event was delivered from, when available. */
  topic?: string;
  /** One-based delivery attempt count reported by the transport. Defaults to 1. */
  attempt?: number;
}

/** Callback used by subscriber transports to deliver events to a router. */
export type DeliveryHandler = (delivery: Delivery) => Promise<Disposition> | Disposition;

/** Active subscription returned from subscriber transports. */
export interface Subscription {
  /** Stop receiving messages for this subscription. */
  unsubscribe(): Promise<void>;
}

/** Shared observer hooks for transport operations across all backends. */
export interface PubSubTransportObserver {
  /** Called after a delayed publish or retry is durably accepted. */
  scheduled?(event: PubSubTransportObserverEvent): void;
  /** Called after a consumed event is durably scheduled for retry. */
  retried?(event: PubSubTransportObserverEvent): void;
  /** Called when a retry is converted to dead-letter because max attempts was reached. */
  retryExhausted?(event: PubSubTransportObserverEvent): void;
  /** Called after a rejected or dead-lettered event is produced to the dead-letter topic. */
  deadLettered?(event: PubSubTransportObserverEvent): void;
  /** Called after a delayed event is recovered from durable transport state. */
  recovered?(event: PubSubTransportObserverEvent): void;
  /** Called after a delayed event is delivered to its target topic. */
  delivered?(event: PubSubTransportObserverEvent): void;
  /** Called after a delayed event is durably cleared from active scheduling state. */
  tombstoned?(event: PubSubTransportObserverEvent): void;
  /** Called when delayed delivery fails after the transport has accepted scheduling state. */
  deliveryFailed?(event: PubSubTransportObserverFailure): void;
  /** Called when a subscribed or scheduled record cannot be parsed as a CloudEvent. */
  parseFailed?(event: PubSubTransportObserverFailure): void;
  /** Called after a subscriber commits or acknowledges a handled delivery. */
  committed?(event: PubSubTransportObserverEvent): void;
}

/** Shared metadata passed to transport observer hooks. */
export interface PubSubTransportObserverEvent {
  /** CloudEvent id or broker message id. */
  id: string;
  /** Transport topic associated with the event. */
  topic: string;
  /** One-based delivery attempt count when available. */
  attempt?: number;
}

/** Shared failure metadata passed to transport observer hooks. */
export interface PubSubTransportObserverFailure extends PubSubTransportObserverEvent {
  /** Failure cause. */
  error: unknown;
}

/** Transport interface for publishing CloudEvents. */
export interface PublisherTransport {
  /** Transport-level default CloudEvent source used when publisher options do not provide one. */
  defaultSource?: string;
  /** Publish a CloudEvent to the transport-specific topic. */
  publish(request: PublishRequest): Promise<void>;
}

/** Transport interface for subscribing to CloudEvents. */
export interface SubscriberTransport {
  /** Register a delivery handler with the transport. */
  subscribe(handler: DeliveryHandler, options?: SubscribeOptions): Promise<Subscription>;
}

/** Combined transport that can publish, subscribe, and close owned resources. */
export interface PubSubTransport extends PublisherTransport, SubscriberTransport {
  /** Close resources owned by this transport. */
  close(): Promise<void>;
}

/** Handler context used to explicitly control delivery disposition. */
export interface HandlerContext {
  /** The raw CloudEvent currently being handled. */
  readonly event: CloudEvent;
  /** One-based delivery attempt count reported by the transport. */
  readonly attempt: number;
  /** Mark the delivery as successfully processed. */
  ack(): Promise<void>;
  /** Request a retry, optionally delayed durably by the transport. */
  retry(options?: RetryOptions): Promise<void>;
  /** Send the delivery to a dead-letter path. */
  deadLetter(): Promise<void>;
  /** Reject the delivery as invalid input or unsupported data. */
  reject(): Promise<void>;
}

/** Method-shaped event handler for a protobuf payload. */
export type EventHandler<T extends Message = Message> = (
  request: T,
  context: HandlerContext,
) => Promise<void> | void;

/** Partial implementation map from generated service method names to event handlers. */
export type EventHandlers<TService extends GenService<GenServiceMethods>> = Partial<{
  [K in keyof TService["method"]]: TService["method"][K] extends DescMethodUnary
    ? EventHandler<MessageShape<TService["method"][K]["input"]>>
    : never;
}>;

/** Method-shaped publisher generated from a protobuf service descriptor. */
export type EventPublisher<TService extends GenService<GenServiceMethods>> = {
  [K in keyof TService["method"]]: TService["method"][K] extends DescMethodUnary
    ? (
        payload: MessageInitShape<TService["method"][K]["input"]>,
        options?: PublishOptions,
      ) => Promise<void>
    : never;
};

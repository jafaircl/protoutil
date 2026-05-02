import type { DescMethodUnary, Message } from "@bufbuild/protobuf";
import type { GenMessage, GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { parseCloudEventData } from "./cloudevents.js";
import type { ContextValues } from "./context-values.js";
import { createContextValues } from "./context-values.js";
import { ACK, DEAD_LETTER, normalizeThrown, retry } from "./disposition.js";
import { InvalidInputPubSubError, UnrecoverablePubSubError } from "./errors.js";
import { resolveRouterOptions, resolveSubscribeRequest } from "./options.js";
import { unaryMethods } from "./service.js";
import type {
  CloudEvent,
  CreateRouterOptions,
  Delivery,
  Disposition,
  EventHandler,
  EventHandlers,
  HandlerContext,
  SubscribeOptions,
  SubscriberTransport,
  Subscription,
} from "./types.js";

interface Route {
  service: GenService<GenServiceMethods>;
  method: DescMethodUnary;
  topic: string;
  deadLetterTopic: string;
  handler: EventHandler;
}

/**
 * Router that maps CloudEvent types to protobuf service method handlers.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export interface Router<TService extends GenService<GenServiceMethods>> {
  /** Register handlers for unary methods on the generated protobuf service. */
  service(implementation: EventHandlers<TService>): Router<TService>;
  /** Subscribe the router with its configured transport. */
  subscribe(options?: SubscribeOptions): Promise<Subscription>;
  /** Dispatch a transport delivery and return the normalized disposition. */
  dispatch(delivery: Delivery): Promise<Disposition>;
}

/**
 * Create a transport-neutral pubsub router bound to a subscriber transport.
 *
 * @see {@link https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md | CloudEvents specification}
 */
export function createRouter<TService extends GenService<GenServiceMethods>>(
  service: TService,
  transport: SubscriberTransport,
  options?: CreateRouterOptions<TService>,
): Router<TService> {
  return new DefaultRouter(service, transport, options);
}

class DefaultRouter<TService extends GenService<GenServiceMethods>> implements Router<TService> {
  readonly #routes = new Map<string, Route>();

  /** Create a router bound to one subscriber transport instance. */
  public constructor(
    private readonly serviceDefinition: TService,
    private readonly transport: SubscriberTransport,
    private readonly options?: CreateRouterOptions<TService>,
  ) {}

  /** Register handlers for each implemented unary service method. */
  public service(implementation: EventHandlers<TService>): Router<TService> {
    for (const method of unaryMethods(this.serviceDefinition)) {
      // Generated service descriptors are the contract surface. Each registered
      // unary method becomes one CloudEvent type route.
      const handler = implementation[method.localName as keyof typeof implementation] as
        | EventHandler
        | undefined;
      if (!handler) {
        continue;
      }
      const resolved = resolveRouterOptions(this.serviceDefinition, method, this.options);
      this.#routes.set(resolved.type, {
        service: this.serviceDefinition,
        method,
        topic: resolved.topic,
        deadLetterTopic: resolved.deadLetterTopic,
        handler,
      });
    }
    return this;
  }

  /** Subscribe the bound transport and route all deliveries through dispatch(). */
  public async subscribe(options?: SubscribeOptions): Promise<Subscription> {
    return this.transport.subscribe(
      (delivery) => this.dispatch(delivery),
      resolveSubscribeRequest(this.#routes.values(), options),
    );
  }

  /** Decode one delivery and invoke the matching handler, if any. */
  public async dispatch(delivery: Delivery): Promise<Disposition> {
    const event = delivery.event;
    const route = this.#routes.get(event.type);
    if (!route) {
      // Unknown semantic event types are unrecoverable for this router. The
      // transport decides whether that means a broker DLQ, commit, or both.
      return DEAD_LETTER;
    }

    let request: Message;
    try {
      // CloudEvents stays the envelope. The router only unwraps the protobuf
      // message after it has selected the method contract by CloudEvent type.
      request = parseCloudEventData(route.method.input as GenMessage<Message>, event);
    } catch (error) {
      return {
        kind: "reject",
        error: new InvalidInputPubSubError("invalid protobuf payload", { cause: error }),
      };
    }

    const context = new HandlerContextImpl(event, delivery.attempt ?? 1, delivery.contextValues);
    try {
      await route.handler(request, context);
      // A handler that returns without an explicit ctx action is successful.
      return context.disposition ?? ACK;
    } catch (error) {
      if (error instanceof UnrecoverablePubSubError) {
        return { kind: "dead_letter", error };
      }
      return normalizeThrown(error);
    }
  }
}

class HandlerContextImpl implements HandlerContext {
  public disposition?: Disposition;
  public readonly contextValues;

  /** Create a handler context for one routed CloudEvent delivery.
   *
   * The contextValues bag is shared between interceptors and the handler, enabling
   * things like trace IDs, user info, or reentry guards to flow through
   * the delivery chain without being encoded in the CloudEvent itself.
   */
  public constructor(
    public readonly event: CloudEvent,
    public readonly attempt: number,
    contextValues?: ContextValues,
  ) {
    this.contextValues = contextValues ?? createContextValues();
  }

  /** Mark the delivery as successfully handled. */
  public async ack(): Promise<void> {
    // Explicit ctx actions override the default “returned successfully” path.
    this.disposition = ACK;
  }

  /** Request a retry disposition, optionally with a durable delay. */
  public async retry(options?: Parameters<typeof retry>[0]): Promise<void> {
    this.disposition = retry(options);
  }

  /** Route the delivery to the transport dead-letter path. */
  public async deadLetter(): Promise<void> {
    this.disposition = DEAD_LETTER;
  }

  /** Reject the delivery as invalid or unsupported input. */
  public async reject(): Promise<void> {
    this.disposition = { kind: "reject" };
  }
}

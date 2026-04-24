import type {
  DeliveryHandler,
  Disposition,
  PublishRequest,
  PubSubTransport,
  SubscribeOptions,
  Subscription,
} from "./types.js";

/**
 * In-memory transport for tests, examples, and conformance execution.
 *
 * This transport is not durable and must not be used as a production implementation for
 * delayed publish or delayed retry semantics.
 */
export class InMemoryPubSubTransport implements PubSubTransport {
  /** Requests published through this transport, in publish order. */
  public readonly published: PublishRequest[] = [];
  /** Dispositions returned by deliveries this transport has invoked. */
  public readonly dispositions: Disposition[] = [];
  /** Optional transport-level default CloudEvent source. */
  public defaultSource?: string;
  #handler?: DeliveryHandler;

  /** Create an in-memory transport with optional transport defaults. */
  public constructor(options?: { defaultSource?: string }) {
    this.defaultSource = options?.defaultSource;
  }

  /** Record a publish request and immediately deliver it when subscribed. */
  public async publish(request: PublishRequest): Promise<void> {
    this.published.push(request);
    if (this.#handler) {
      // In-memory delivery is synchronous so tests can assert against transport
      // behavior without needing an external broker.
      this.dispositions.push(await this.#handler({ event: request.event, topic: request.topic }));
    }
  }

  /** Register the handler that receives future in-memory deliveries. */
  public async subscribe(
    handler: DeliveryHandler,
    _options?: SubscribeOptions,
  ): Promise<Subscription> {
    this.#handler = handler;
    return {
      unsubscribe: async () => {
        this.#handler = undefined;
      },
    };
  }

  /** Clear the registered handler. */
  public async close(): Promise<void> {
    this.#handler = undefined;
  }

  /** Deliver a recorded publish request to the registered handler. */
  public async deliver(index = this.published.length - 1): Promise<Disposition> {
    if (!this.#handler) {
      throw new Error("no subscriber registered");
    }
    // deliver() lets tests replay a recorded publish deterministically.
    const request = this.published[index];
    const disposition = await this.#handler({ event: request.event, topic: request.topic });
    this.dispositions.push(disposition);
    return disposition;
  }
}

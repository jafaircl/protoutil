declare module "amqplib" {
  export interface Options {
    assertExchange?: {
      durable?: boolean;
      autoDelete?: boolean;
      arguments?: Record<string, unknown>;
    };
    assertQueue?: {
      durable?: boolean;
      exclusive?: boolean;
      autoDelete?: boolean;
      arguments?: Record<string, unknown>;
    };
    consume?: {
      consumerTag?: string;
      noAck?: boolean;
    };
    publish?: {
      contentType?: string;
      contentEncoding?: string;
      headers?: Record<string, unknown>;
      expiration?: string;
      persistent?: boolean;
      messageId?: string;
      timestamp?: number;
      type?: string;
      appId?: string;
    };
  }

  export interface Replies {
    consume: {
      consumerTag: string;
    };
  }

  export interface Message {
    content: Buffer;
    fields: {
      routingKey: string;
      exchange: string;
      consumerTag: string;
      deliveryTag: number;
      redelivered: boolean;
    };
    properties: {
      contentType?: string;
      headers: Record<string, unknown>;
      messageId?: string;
      timestamp?: number;
      type?: string;
      appId?: string;
      expiration?: string;
    };
  }

  export interface Channel {
    assertExchange(
      exchange: string,
      type: string,
      options?: Options["assertExchange"],
    ): Promise<unknown>;
    assertQueue(queue?: string, options?: Options["assertQueue"]): Promise<{ queue: string }>;
    bindQueue(queue: string, source: string, pattern: string): Promise<unknown>;
    prefetch(count: number): Promise<unknown>;
    consume(
      queue: string,
      onMessage: (message: Message | null) => void | Promise<void>,
      options?: Options["consume"],
    ): Promise<Replies["consume"]>;
    ack(message: Message, allUpTo?: boolean): void;
    nack(message: Message, allUpTo?: boolean, requeue?: boolean): void;
    cancel(consumerTag: string): Promise<unknown>;
    close(): Promise<void>;
  }

  export interface ConfirmChannel extends Channel {
    publish(
      exchange: string,
      routingKey: string,
      content: Buffer,
      options?: Options["publish"],
      callback?: (error: Error | null, ok: unknown) => void,
    ): boolean;
    sendToQueue(
      queue: string,
      content: Buffer,
      options?: Options["publish"],
      callback?: (error: Error | null, ok: unknown) => void,
    ): boolean;
  }

  export interface Connection {
    createChannel(): Promise<Channel>;
    createConfirmChannel(): Promise<ConfirmChannel>;
    close(): Promise<void>;
  }

  export function connect(url: string): Promise<Connection>;
}

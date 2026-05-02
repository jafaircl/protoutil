import type { JsMsg } from "nats";

/** Build a NATS-safe identifier segment from an arbitrary topic-like string. */
export function durableNamePart(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");
}

/** Ack one JetStream message and swallow close races during shutdown. */
export function safeAck(message: JsMsg): void {
  try {
    message.ack();
  } catch {
    // Connection shutdown can race an ack after work already completed.
  }
}

/** NAK one JetStream message and swallow close races during shutdown. */
export function safeNak(message: JsMsg, delayMs: number): void {
  try {
    message.nak(delayMs);
  } catch {
    // Connection shutdown can race a NAK while the scheduler is unwinding.
  }
}

import type { KafkaJS } from "@confluentinc/kafka-javascript";

/** Send a Kafka producer record, optionally bounded by a timeout. */
export async function sendWithTimeout(
  producer: KafkaJS.Producer,
  record: KafkaJS.ProducerRecord,
  timeoutMs: number | undefined,
): Promise<void> {
  const send = producer.send(record);
  if (!timeoutMs) {
    await send;
    return;
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    // Bound the broker round-trip explicitly so hung produces do not stall the
    // publish path forever.
    await Promise.race([
      send,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Kafka producer send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/** Send a Kafka producer batch, optionally bounded by a timeout. */
export async function sendBatchWithTimeout(
  producer: KafkaJS.Producer,
  batch: KafkaJS.ProducerBatch,
  timeoutMs: number | undefined,
): Promise<void> {
  const send = producer.sendBatch(batch);
  if (!timeoutMs) {
    await send;
    return;
  }
  let timeout: NodeJS.Timeout | undefined;
  try {
    // Keep scheduler batch flushes and normal publish sends on the same timeout
    // behavior so their failure modes are consistent.
    await Promise.race([
      send,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Kafka producer sendBatch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

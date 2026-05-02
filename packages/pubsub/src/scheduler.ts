import { durationMs } from "@bufbuild/protobuf/wkt";
import { SchedulerRequiredPubSubError } from "./errors.js";
import type { Disposition, PublishRequest, PubSubScheduler } from "./types.js";

const DELAYED_PUBLISH_ERROR =
  "Delayed publish requires a scheduler. Create one with createKafkaScheduler/createRabbitMqScheduler/createNatsScheduler and pass it to the transport.";

const DELAYED_RETRY_ERROR =
  "Delayed retry requires a scheduler. Create one with createKafkaScheduler/createRabbitMqScheduler/createNatsScheduler and pass it to the transport.";

/** Assert a scheduler is available for delayed publish or retry flows. */
export function assertSchedulerAvailable(
  scheduler: PubSubScheduler | undefined,
  operation: "publish" | "retry",
): PubSubScheduler {
  if (scheduler) {
    return scheduler;
  }
  throw new SchedulerRequiredPubSubError(
    operation === "publish" ? DELAYED_PUBLISH_ERROR : DELAYED_RETRY_ERROR,
  );
}

/** Schedule a delayed publish or throw a helpful error when none is configured. */
export async function scheduleOrThrow(
  scheduler: PubSubScheduler | undefined,
  request: PublishRequest,
): Promise<void> {
  await assertSchedulerAvailable(scheduler, "publish").publishLater(request);
}

/** Schedule a delayed retry or throw a helpful error when none is configured. */
export async function retryLaterOrThrow(
  scheduler: PubSubScheduler | undefined,
  topic: string,
  event: PublishRequest["event"],
  disposition: Disposition,
  attempt: number,
): Promise<void> {
  await assertSchedulerAvailable(scheduler, "retry").retryLater(
    topic,
    event,
    disposition.delay ? durationMs(disposition.delay) : 0,
    attempt,
  );
}

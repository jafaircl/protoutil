import type { KafkaSchedulerOptions, KafkaTopicSpec } from "./types.js";

const REQUIRED_SCHEDULE_CONFIG: Record<string, string> = {
  "cleanup.policy": "compact",
  "retention.ms": "-1",
};

/** Build the Kafka topics required by the configured transport request. */
export function topologyTopics(
  schedulerOptions: KafkaSchedulerOptions | undefined,
  subscribeTopics: string[] = [],
  deadLetterTopic?: string,
): KafkaTopicSpec[] {
  const topics = schedulerOptions ? schedulerTopics(schedulerOptions) : [];
  for (const topic of subscribeTopics) {
    topics.push({ topic });
  }
  if (deadLetterTopic) {
    topics.push({ topic: deadLetterTopic });
  }
  return uniqueTopics(topics);
}

/** Build the scheduler-owned topics that support delayed publish and retry. */
export function schedulerTopics(options: KafkaSchedulerOptions): KafkaTopicSpec[] {
  const partitions = options.partitions ?? 1;
  const replicationFactor = options.replicationFactor ?? 1;
  return [
    {
      topic: options.schedulesTopic,
      numPartitions: partitions,
      replicationFactor,
      // Compaction makes the schedule topic the durable “latest schedule by id”
      // store that restart recovery replays.
      configEntries: Object.entries(REQUIRED_SCHEDULE_CONFIG).map(([name, value]) => ({
        name,
        value,
      })),
    },
    {
      topic: options.historyTopic,
      numPartitions: partitions,
      replicationFactor,
      configEntries:
        options.historyRetentionMs === undefined
          ? undefined
          : [{ name: "retention.ms", value: String(options.historyRetentionMs) }],
    },
  ];
}

/** Remove duplicate topic specs while preserving the first occurrence of each topic. */
function uniqueTopics(topics: KafkaTopicSpec[]): KafkaTopicSpec[] {
  const seen = new Set<string>();
  // Subscribe, dead-letter, and scheduler configuration can point at the same
  // topic names in tests, so deduplicate before topic creation.
  return topics.filter((topic) => {
    if (seen.has(topic.topic)) {
      return false;
    }
    seen.add(topic.topic);
    return true;
  });
}

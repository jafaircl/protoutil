import type { KafkaSchedulerOptions, KafkaTopicSpec, KafkaTransportOptions } from "./types.js";

const REQUIRED_SCHEDULE_CONFIG: Record<string, string> = {
  "cleanup.policy": "compact",
  "retention.ms": "-1",
};

/** Build the Kafka topics required by the configured transport. */
export function topologyTopics(options: KafkaTransportOptions): KafkaTopicSpec[] {
  const topics = schedulerTopics(options.scheduler);
  for (const topic of options.subscribeTopics ?? []) {
    topics.push({ topic });
  }
  if (options.deadLetterTopic) {
    topics.push({ topic: options.deadLetterTopic });
  }
  return uniqueTopics(topics);
}

/** Build the scheduler-owned topics that support delayed publish and retry. */
function schedulerTopics(options: KafkaSchedulerOptions): KafkaTopicSpec[] {
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

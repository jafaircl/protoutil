# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-04-29T00:37:18.084Z`

## Methodology

These benchmark scenarios are end-to-end application benchmarks, not raw broker client microbenchmarks. This file currently contains results for: kafka, rabbitmq, nats. They include transport lazy startup, topic setup, consumer group join, CloudEvent and protobuf serialization, router dispatch, and scheduler persistence for delayed delivery.

Each scenario is measured twice: once on a cold path and once after a warm-up event has already exercised the same transport path. Small runs exaggerate fixed startup costs. Scheduled latency also includes the configured `notBefore` delay.

## Configuration

| Variable | Value |
| --- | --- |
| `KAFKA_BOOTSTRAP_SERVER` | `localhost:19092` |
| `PUBSUB_BENCHMARK_EVENT_COUNT` | `1000` |
| `PUBSUB_BENCHMARK_PUBLISH_CONCURRENCY` | `50` |
| `PUBSUB_BENCHMARK_SUBSCRIBE_CONCURRENCY` | `32` |
| `PUBSUB_BENCHMARK_NOT_BEFORE_MS` | `1000` |
| `PUBSUB_BENCHMARK_SCHEDULER_ONLY_NOT_BEFORE_MS` | `0` |
| `PUBSUB_BENCHMARK_TIMEOUT_MS` | `120000` |
| `PUBSUB_BENCHMARK_TEST_TIMEOUT_MS` | `300000` |

## Results

Note: Scheduled scenario durations include the configured notBefore delay; subtract it to get scheduler overhead (~100-300ms for most transports).

| Transport | Scenario | Mode | Messages | Publish Concurrency | Subscribe Concurrency | Duration ms | Msg/s | p50 ms | p95 ms | p99 ms | Duplicates |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 253 | 3945.38 | 30.77 | 40.61 | 92.36 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 163 | 6130.78 | 15.53 | 17.40 | 17.85 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1751 | 570.97 | 1311.56 | 1651.32 | 1702.62 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1734 | 576.84 | 1297.14 | 1625.50 | 1686.62 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 486 | 2058.24 | 230.64 | 401.03 | 444.34 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 364 | 2744.36 | 105.54 | 270.34 | 310.35 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 111 | 9009.97 | 4.02 | 7.88 | 10.39 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 106 | 9468.77 | 3.60 | 5.80 | 6.64 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1120 | 893.12 | 1035.47 | 1039.35 | 1040.46 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1098 | 911.12 | 998.16 | 1001.97 | 1007.06 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 143 | 6971.71 | 9.77 | 12.99 | 13.11 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 144 | 6944.69 | 8.49 | 11.29 | 11.57 | 0 |
| nats | immediate publish/consume | cold start | 1000 | 50 | 32 | 111 | 8987.17 | 32.29 | 46.31 | 46.69 | 0 |
| nats | immediate publish/consume | warmed up | 1000 | 50 | 32 | 102 | 9848.51 | 26.15 | 36.78 | 37.80 | 0 |
| nats | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1258 | 794.83 | 1072.44 | 1115.50 | 1117.75 | 0 |
| nats | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1406 | 711.07 | 1113.74 | 1220.66 | 1225.40 | 0 |
| nats | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 748 | 1336.44 | 131.28 | 170.99 | 173.70 | 0 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 921 | 1086.04 | 173.62 | 195.89 | 203.89 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 245.86 | 0.00 | 228.41 | 25.05 | 81.40 |
| kafka | immediate publish/consume | warmed up | 170.32 | 89.72 | 136.91 | 26.20 | 12.08 |
| kafka | scheduled publish/consume | cold start | 357.05 | 0.00 | 166.04 | 1585.36 | 1020.16 |
| kafka | scheduled publish/consume | warmed up | 354.41 | 1034.71 | 147.01 | 1586.56 | 1017.24 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 361.00 | 0.00 | 161.17 | 324.68 | 130.61 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 387.78 | 136.36 | 136.19 | 228.19 | 28.44 |
| rabbitmq | immediate publish/consume | cold start | 19.75 | 0.00 | 110.98 | 0.00 | 5.94 |
| rabbitmq | immediate publish/consume | warmed up | 9.49 | 1.56 | 105.61 | 0.01 | 2.24 |
| rabbitmq | scheduled publish/consume | cold start | 15.54 | 0.00 | 76.98 | 1042.68 | 1017.71 |
| rabbitmq | scheduled publish/consume | warmed up | 17.15 | 1011.23 | 90.20 | 1007.35 | 1006.75 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 17.10 | 0.00 | 117.73 | 25.71 | 7.55 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 15.31 | 27.08 | 118.24 | 25.75 | 6.08 |
| nats | immediate publish/consume | cold start | 12.80 | 0.00 | 85.43 | 25.84 | 8.36 |
| nats | immediate publish/consume | warmed up | 3.87 | 25.85 | 75.52 | 26.01 | 4.99 |
| nats | scheduled publish/consume | cold start | 3.28 | 0.00 | 132.37 | 1125.76 | 1035.94 |
| nats | scheduled publish/consume | warmed up | 2.74 | 1031.87 | 175.32 | 1231.02 | 1038.47 |
| nats | scheduled publish/consume (scheduler only) | cold start | 3.44 | 0.00 | 624.74 | 123.52 | 71.86 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 4.67 | 70.76 | 756.29 | 164.48 | 38.48 |

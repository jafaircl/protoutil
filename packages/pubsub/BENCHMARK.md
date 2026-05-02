# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-05-02T00:32:02.383Z`

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
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 267 | 3738.52 | 25.63 | 42.69 | 112.75 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 165 | 6063.54 | 14.41 | 17.41 | 18.42 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1708 | 585.60 | 1279.72 | 1591.48 | 1651.54 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1708 | 585.32 | 1288.15 | 1591.62 | 1645.62 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 430 | 2324.04 | 191.32 | 359.49 | 399.35 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 320 | 3124.46 | 75.01 | 247.05 | 282.74 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 135 | 7401.30 | 3.87 | 6.98 | 9.48 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 93 | 10789.16 | 3.56 | 6.11 | 6.88 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1123 | 890.43 | 1034.68 | 1037.62 | 1038.10 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1086 | 920.44 | 967.15 | 1001.86 | 1014.52 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 143 | 7010.72 | 9.59 | 13.53 | 14.99 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 142 | 7036.38 | 9.35 | 12.57 | 13.87 | 0 |
| nats | immediate publish/consume | cold start | 1000 | 50 | 32 | 121 | 8237.40 | 29.60 | 44.97 | 46.20 | 0 |
| nats | immediate publish/consume | warmed up | 1000 | 50 | 32 | 107 | 9328.59 | 30.47 | 42.12 | 44.91 | 0 |
| nats | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1227 | 814.95 | 1033.89 | 1076.69 | 1079.02 | 0 |
| nats | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1407 | 710.84 | 1117.68 | 1231.98 | 1236.73 | 0 |
| nats | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 763 | 1311.18 | 126.42 | 164.05 | 170.61 | 0 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 915 | 1092.67 | 177.06 | 225.24 | 232.51 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 2318.09 | 0.00 | 241.92 | 25.56 | 94.70 |
| kafka | immediate publish/consume | warmed up | 178.92 | 93.80 | 140.52 | 24.40 | 14.10 |
| kafka | scheduled publish/consume | cold start | 370.18 | 0.00 | 164.73 | 1542.92 | 1016.53 |
| kafka | scheduled publish/consume | warmed up | 381.24 | 1028.00 | 145.90 | 1562.56 | 1019.52 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 359.39 | 0.00 | 155.33 | 274.96 | 137.21 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 365.15 | 136.64 | 145.49 | 174.56 | 34.91 |
| rabbitmq | immediate publish/consume | cold start | 19.07 | 0.00 | 109.83 | 25.28 | 5.97 |
| rabbitmq | immediate publish/consume | warmed up | 11.06 | 1.68 | 92.68 | 0.01 | 2.72 |
| rabbitmq | scheduled publish/consume | cold start | 15.18 | 0.00 | 79.01 | 1044.03 | 1020.83 |
| rabbitmq | scheduled publish/consume | warmed up | 16.54 | 1019.98 | 127.11 | 959.32 | 1008.92 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 17.37 | 0.00 | 116.53 | 26.11 | 7.22 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 17.37 | 27.73 | 116.22 | 25.90 | 9.37 |
| nats | immediate publish/consume | cold start | 14.25 | 0.00 | 96.26 | 25.14 | 6.68 |
| nats | immediate publish/consume | warmed up | 3.70 | 26.99 | 82.12 | 25.08 | 3.29 |
| nats | scheduled publish/consume | cold start | 3.49 | 0.00 | 141.26 | 1085.82 | 1017.08 |
| nats | scheduled publish/consume | warmed up | 3.09 | 1022.67 | 157.78 | 1249.01 | 1027.37 |
| nats | scheduled publish/consume (scheduler only) | cold start | 4.35 | 0.00 | 629.49 | 133.18 | 70.80 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 4.48 | 84.33 | 739.19 | 176.00 | 39.22 |

# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-04-28T23:47:05.754Z`

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
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 251 | 3985.70 | 26.24 | 43.22 | 106.04 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 163 | 6145.44 | 12.36 | 15.61 | 16.73 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1698 | 589.06 | 1296.81 | 1598.31 | 1655.00 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1718 | 582.11 | 1287.78 | 1600.53 | 1651.29 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 407 | 2457.37 | 184.65 | 335.39 | 367.89 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 299 | 3344.49 | 88.92 | 237.30 | 265.51 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 114 | 8780.49 | 3.98 | 7.27 | 10.81 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 115 | 8662.09 | 4.08 | 6.77 | 7.24 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1119 | 893.74 | 1016.30 | 1019.64 | 1020.17 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1108 | 902.30 | 996.23 | 1013.91 | 1016.23 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 136 | 7360.66 | 9.17 | 12.61 | 13.69 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 152 | 6585.43 | 9.64 | 14.92 | 16.31 | 0 |
| nats | immediate publish/consume | cold start | 1000 | 50 | 32 | 115 | 8662.87 | 28.17 | 41.09 | 42.90 | 0 |
| nats | immediate publish/consume | warmed up | 1000 | 50 | 32 | 106 | 9478.28 | 30.82 | 41.68 | 42.16 | 0 |
| nats | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1254 | 797.46 | 1041.06 | 1091.65 | 1092.89 | 0 |
| nats | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1393 | 718.01 | 1079.64 | 1183.89 | 1189.16 | 0 |
| nats | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 817 | 1223.69 | 342.32 | 397.82 | 403.05 | 0 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 940 | 1064.30 | 355.04 | 443.21 | 457.64 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 2317.64 | 0.00 | 226.16 | 24.74 | 85.72 |
| kafka | immediate publish/consume | warmed up | 174.54 | 93.47 | 137.60 | 25.12 | 10.89 |
| kafka | scheduled publish/consume | cold start | 372.14 | 0.00 | 166.00 | 1531.61 | 1015.50 |
| kafka | scheduled publish/consume | warmed up | 365.60 | 1025.63 | 157.86 | 1560.04 | 1013.18 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 362.98 | 0.00 | 157.53 | 249.41 | 131.70 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 357.17 | 135.11 | 149.20 | 149.80 | 30.07 |
| rabbitmq | immediate publish/consume | cold start | 18.55 | 0.00 | 113.88 | 0.00 | 6.72 |
| rabbitmq | immediate publish/consume | warmed up | 9.47 | 1.83 | 115.44 | 0.01 | 2.68 |
| rabbitmq | scheduled publish/consume | cold start | 14.76 | 0.00 | 87.03 | 1031.87 | 1011.93 |
| rabbitmq | scheduled publish/consume | warmed up | 16.60 | 1014.48 | 121.02 | 987.26 | 1011.49 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 16.41 | 0.00 | 111.35 | 24.51 | 5.13 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 16.29 | 27.32 | 125.17 | 26.68 | 9.99 |
| nats | immediate publish/consume | cold start | 13.50 | 0.00 | 89.66 | 25.77 | 5.66 |
| nats | immediate publish/consume | warmed up | 5.75 | 26.69 | 80.44 | 25.07 | 6.34 |
| nats | scheduled publish/consume | cold start | 6.06 | 0.00 | 146.51 | 1107.47 | 1022.33 |
| nats | scheduled publish/consume | warmed up | 6.12 | 1027.50 | 179.78 | 1212.96 | 1030.14 |
| nats | scheduled publish/consume (scheduler only) | cold start | 6.17 | 0.00 | 434.52 | 382.68 | 115.46 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 7.40 | 132.71 | 498.42 | 441.16 | 70.59 |

# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-04-24T01:34:10.931Z`

## Methodology

These benchmark scenarios are end-to-end application benchmarks, not raw broker client microbenchmarks. This file currently contains results for: kafka, rabbitmq. They include transport lazy startup, topic setup, consumer group join, CloudEvent and protobuf serialization, router dispatch, and scheduler persistence for delayed delivery.

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

| Transport | Scenario | Mode | Messages | Publish Concurrency | Subscribe Concurrency | Duration ms | Msg/s | p50 ms | p95 ms | p99 ms | Duplicates |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 335 | 2987.82 | 115.93 | 130.44 | 157.71 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 245 | 4081.94 | 17.07 | 30.31 | 39.71 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1624 | 615.88 | 1324.13 | 1522.60 | 1559.67 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1882 | 531.48 | 1421.75 | 1753.24 | 1815.79 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 399 | 2506.20 | 128.23 | 299.23 | 333.42 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 458 | 2183.61 | 110.88 | 333.47 | 389.45 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 219 | 4569.03 | 6.10 | 12.21 | 16.95 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 148 | 6770.68 | 5.34 | 9.44 | 10.88 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1232 | 811.95 | 1068.09 | 1111.30 | 1115.22 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1188 | 842.04 | 719.61 | 965.17 | 1017.57 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 270 | 3710.36 | 13.87 | 26.64 | 31.56 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 232 | 4312.74 | 13.64 | 20.16 | 21.73 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 2875.10 | 0.00 | 259.68 | 75.01 | 148.64 |
| kafka | immediate publish/consume | warmed up | 398.56 | 121.32 | 220.76 | 24.22 | 10.64 |
| kafka | scheduled publish/consume | cold start | 317.59 | 0.00 | 159.54 | 1464.15 | 1011.03 |
| kafka | scheduled publish/consume | warmed up | 326.82 | 1018.82 | 162.72 | 1718.83 | 1104.49 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 309.24 | 0.00 | 174.27 | 224.75 | 85.95 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 317.91 | 109.68 | 179.72 | 278.24 | 23.88 |
| rabbitmq | immediate publish/consume | cold start | 47.20 | 0.00 | 192.82 | 26.04 | 8.93 |
| rabbitmq | immediate publish/consume | warmed up | 25.23 | 3.10 | 147.69 | 0.01 | 3.57 |
| rabbitmq | scheduled publish/consume | cold start | 19.91 | 0.00 | 261.92 | 969.68 | 1024.13 |
| rabbitmq | scheduled publish/consume | warmed up | 27.55 | 1281.16 | 570.07 | 617.53 | 1010.33 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 32.40 | 0.00 | 243.35 | 26.17 | 7.40 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 19.72 | 29.04 | 206.53 | 25.34 | 14.62 |

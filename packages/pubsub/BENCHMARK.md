# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-04-27T23:10:18.866Z`

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

| Transport | Scenario | Mode | Messages | Publish Concurrency | Subscribe Concurrency | Duration ms | Msg/s | p50 ms | p95 ms | p99 ms | Duplicates |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 252 | 3969.73 | 91.68 | 141.16 | 150.78 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 177 | 5647.38 | 20.03 | 25.88 | 26.49 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1758 | 568.98 | 1304.18 | 1622.55 | 1680.55 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1734 | 576.82 | 1284.34 | 1618.81 | 1663.55 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 341 | 2932.22 | 110.25 | 262.48 | 304.67 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 289 | 3465.82 | 81.48 | 217.94 | 252.68 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 97 | 10314.76 | 5.93 | 8.31 | 11.27 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 92 | 10872.33 | 3.84 | 6.27 | 6.59 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1119 | 893.52 | 1035.21 | 1044.98 | 1045.51 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1135 | 881.37 | 1000.78 | 1013.49 | 1016.94 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 142 | 7037.57 | 10.32 | 12.57 | 14.54 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 154 | 6480.26 | 10.02 | 16.25 | 18.69 | 0 |
| nats | immediate publish/consume | cold start | 1000 | 50 | 32 | 125 | 7972.51 | 28.90 | 41.01 | 42.36 | 0 |
| nats | immediate publish/consume | warmed up | 1000 | 50 | 32 | 102 | 9772.10 | 32.36 | 42.01 | 43.18 | 0 |
| nats | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1536 | 651.15 | 1172.12 | 1345.89 | 1353.78 | 0 |
| nats | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1626 | 614.89 | 1129.52 | 1367.05 | 1392.22 | 0 |
| nats | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 1023 | 977.67 | 430.60 | 577.32 | 591.16 | 0 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 1240 | 806.15 | 548.84 | 674.05 | 695.80 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 2423.86 | 0.00 | 201.93 | 49.98 | 136.29 |
| kafka | immediate publish/consume | warmed up | 333.29 | 112.72 | 152.20 | 24.87 | 11.45 |
| kafka | scheduled publish/consume | cold start | 306.60 | 0.00 | 144.72 | 1612.82 | 1012.00 |
| kafka | scheduled publish/consume | warmed up | 299.63 | 1022.69 | 148.34 | 1585.30 | 1013.71 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 304.43 | 0.00 | 141.57 | 199.47 | 82.96 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 306.61 | 111.00 | 138.44 | 150.09 | 28.64 |
| rabbitmq | immediate publish/consume | cold start | 21.31 | 0.00 | 96.94 | 0.00 | 6.51 |
| rabbitmq | immediate publish/consume | warmed up | 12.28 | 1.82 | 91.97 | 0.01 | 2.54 |
| rabbitmq | scheduled publish/consume | cold start | 11.54 | 0.00 | 77.00 | 1042.17 | 1023.00 |
| rabbitmq | scheduled publish/consume | warmed up | 12.72 | 1018.50 | 122.12 | 1012.48 | 1014.88 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 12.61 | 0.00 | 117.14 | 24.96 | 7.43 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 12.10 | 27.88 | 127.80 | 26.52 | 6.17 |
| nats | immediate publish/consume | cold start | 26.03 | 0.00 | 100.03 | 25.40 | 10.37 |
| nats | immediate publish/consume | warmed up | 11.61 | 26.76 | 77.76 | 24.58 | 3.81 |
| nats | scheduled publish/consume | cold start | 9.03 | 0.00 | 174.82 | 1360.93 | 1043.00 |
| nats | scheduled publish/consume | warmed up | 52.96 | 1028.43 | 229.48 | 1396.83 | 1049.24 |
| nats | scheduled publish/consume (scheduler only) | cold start | 51.92 | 0.00 | 442.88 | 579.96 | 62.26 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 60.18 | 36.54 | 533.16 | 707.30 | 105.32 |

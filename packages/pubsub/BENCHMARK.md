# PubSub Transport Benchmarking

This file is rewritten by:

```sh
pnpm moon run pubsub:benchmark
```

Generated at: `2026-04-28T01:32:46.376Z`

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
| kafka | immediate publish/consume | cold start | 1000 | 50 | 32 | 222 | 4513.02 | 90.52 | 119.32 | 127.36 | 0 |
| kafka | immediate publish/consume | warmed up | 1000 | 50 | 32 | 164 | 6086.05 | 14.54 | 17.79 | 18.83 | 0 |
| kafka | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1786 | 560.00 | 1311.59 | 1660.51 | 1713.42 | 0 |
| kafka | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1789 | 559.06 | 1314.46 | 1654.42 | 1715.96 | 0 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 345 | 2899.24 | 117.26 | 261.73 | 301.99 | 0 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 345 | 2900.41 | 95.45 | 250.12 | 298.47 | 0 |
| rabbitmq | immediate publish/consume | cold start | 1000 | 50 | 32 | 111 | 8969.85 | 4.34 | 7.33 | 9.79 | 0 |
| rabbitmq | immediate publish/consume | warmed up | 1000 | 50 | 32 | 107 | 9314.25 | 3.79 | 6.23 | 6.91 | 0 |
| rabbitmq | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1125 | 889.03 | 1037.55 | 1041.31 | 1043.66 | 0 |
| rabbitmq | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1112 | 899.04 | 1002.17 | 1010.86 | 1015.11 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 155 | 6468.53 | 9.32 | 13.52 | 16.78 | 0 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 156 | 6393.50 | 9.76 | 12.94 | 13.95 | 0 |
| nats | immediate publish/consume | cold start | 1000 | 50 | 32 | 112 | 8955.12 | 28.06 | 38.42 | 40.16 | 0 |
| nats | immediate publish/consume | warmed up | 1000 | 50 | 32 | 111 | 9010.17 | 27.33 | 37.22 | 38.39 | 0 |
| nats | scheduled publish/consume | cold start | 1000 | 50 | 32 | 1577 | 633.96 | 1194.92 | 1392.05 | 1407.84 | 0 |
| nats | scheduled publish/consume | warmed up | 1000 | 50 | 32 | 1621 | 616.89 | 1155.56 | 1393.19 | 1404.58 | 0 |
| nats | scheduled publish/consume (scheduler only) | cold start | 1000 | 50 | 32 | 1093 | 915.27 | 521.63 | 664.84 | 694.74 | 0 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 1000 | 50 | 32 | 1273 | 785.43 | 544.37 | 709.15 | 734.75 | 0 |

| Phase Breakdown |
| --- |

| Transport | Scenario | Mode | Subscribe Setup ms | Warmup ms | Publish Phase ms | Delivery Drain ms | First Delivery ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| kafka | immediate publish/consume | cold start | 2428.85 | 0.00 | 171.09 | 50.49 | 116.49 |
| kafka | immediate publish/consume | warmed up | 308.51 | 110.59 | 140.14 | 24.17 | 12.79 |
| kafka | scheduled publish/consume | cold start | 306.33 | 0.00 | 149.55 | 1636.16 | 1012.73 |
| kafka | scheduled publish/consume | warmed up | 310.39 | 1021.24 | 151.66 | 1637.06 | 1011.74 |
| kafka | scheduled publish/consume (scheduler only) | cold start | 301.81 | 0.00 | 145.04 | 199.87 | 85.89 |
| kafka | scheduled publish/consume (scheduler only) | warmed up | 300.06 | 110.03 | 143.84 | 200.94 | 31.92 |
| rabbitmq | immediate publish/consume | cold start | 26.33 | 0.00 | 111.48 | 0.00 | 5.79 |
| rabbitmq | immediate publish/consume | warmed up | 14.56 | 1.92 | 107.36 | 0.01 | 2.95 |
| rabbitmq | scheduled publish/consume | cold start | 11.81 | 0.00 | 84.82 | 1040.00 | 1022.63 |
| rabbitmq | scheduled publish/consume | warmed up | 16.46 | 1016.45 | 105.13 | 1007.16 | 1011.04 |
| rabbitmq | scheduled publish/consume (scheduler only) | cold start | 11.92 | 0.00 | 127.94 | 26.66 | 7.39 |
| rabbitmq | scheduled publish/consume (scheduler only) | warmed up | 11.73 | 28.00 | 130.62 | 25.79 | 9.58 |
| nats | immediate publish/consume | cold start | 25.21 | 0.00 | 86.01 | 25.66 | 9.50 |
| nats | immediate publish/consume | warmed up | 11.81 | 26.76 | 85.59 | 25.40 | 6.91 |
| nats | scheduled publish/consume | cold start | 10.39 | 0.00 | 170.20 | 1407.19 | 1026.09 |
| nats | scheduled publish/consume | warmed up | 56.37 | 1022.31 | 210.29 | 1410.74 | 1015.59 |
| nats | scheduled publish/consume (scheduler only) | cold start | 53.66 | 0.00 | 440.41 | 652.17 | 61.76 |
| nats | scheduled publish/consume (scheduler only) | warmed up | 68.17 | 33.90 | 535.25 | 737.94 | 76.72 |

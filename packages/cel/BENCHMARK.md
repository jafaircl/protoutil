# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-02T02:59:45.540Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the `cel-go` reference implementation on the same machine. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. Each policy program primes every prepared activation in round-robin order before policy evaluation samples begin. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

- Runtime: `node v22.15.0`
- Go: `go1.26.0`
- Platform: `darwin`
- Arch: `arm64`
- Samples per scenario: `8`
- Warmup samples per scenario: `2`
- Base iterations per sample: `250` (scaled by operation cost)

## Diagnostic operations

- `eval` measures value-only execution.
- `eval-details` measures the public details-returning path without state observers.
- `eval-state` enables expression-state observation.
- `partial-eval` evaluates with explicit unknown attribute patterns and state tracking.
- `residual` reuses captured state to isolate pruning, rendering, parsing, and checking.
- `residual-roundtrip` combines partial evaluation and residual construction.

## Results

| Operation | Scenario | Implementation | Iterations | Mean us/op | Median us/op | Std dev | Ops/sec | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 250 | 11.02 | 10.88 | 0.18 ms | 90,715.63 | 7.33x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.50 | 1.33 | 0.11 ms | 664,838.36 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 47.47 | 45.85 | 1.07 ms | 21,064.77 | 5.20x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 9.12 | 9.27 | 0.16 ms | 109,604.07 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 36.45 | 36.88 | 0.49 ms | 27,434.12 | 10.20x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.57 | 3.26 | 0.13 ms | 279,837.69 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 19.95 | 19.44 | 0.87 ms | 50,115.63 | 4.29x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.65 | 4.22 | 0.20 ms | 215,150.14 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 10.62 | 10.25 | 0.20 ms | 94,153.27 | 1.21x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 250 | 12.87 | 12.74 | 0.19 ms | 77,677.32 | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 35.63 | 34.86 | 0.41 ms | 28,064.60 | 1.21x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 250 | 29.56 | 29.58 | 0.25 ms | 33,832.15 | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 31.98 | 31.79 | 0.22 ms | 31,269.03 | 1.83x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 250 | 17.52 | 17.17 | 0.21 ms | 57,081.90 | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 17.59 | 17.54 | 0.41 ms | 56,863.42 | 1.28x slower | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 13.77 | 13.85 | 0.17 ms | 72,640.54 | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.24 | 0.23 | 0.12 ms | 4,169,616.67 | 4.76x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,859,316.60 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.41 | 0.40 | 0.17 ms | 2,439,222.80 | 4.38x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.08 | 0.10 ms | 10,672,122.26 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 33.68 | 33.72 | 0.13 ms | 29,695.19 | 4.78x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 500 | 7.05 | 6.99 | 0.11 ms | 141,865.76 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 64.04 | 64.01 | 0.19 ms | 15,614.98 | 5.03x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 500 | 12.74 | 12.63 | 0.16 ms | 78,522.92 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.13 | 0.13 | 0.01 ms | 7,740,438.33 | 3.50x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,101,831.75 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.36 | 0.35 | 0.07 ms | 2,815,885.11 | 7.24x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,388,211.94 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.06 | 0.05 | 0.13 ms | 15,732,540.52 | 3.34x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 52,602,785.84 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.29 | 0.28 | 0.14 ms | 3,418,754.62 | 4.35x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.00 ms | 14,883,499.41 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.84 | 0.84 | 0.09 ms | 1,184,588.43 | 5.85x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 5000 | 0.14 | 0.14 | 0.02 ms | 6,928,157.26 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.40 | 0.38 | 0.17 ms | 2,484,651.99 | 1.65x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 5000 | 0.24 | 0.26 | 0.15 ms | 4,110,697.38 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.60 | 0.59 | 0.10 ms | 1,679,745.80 | 1.85x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.32 | 0.33 | 0.15 ms | 3,111,064.86 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 47.78 | 47.71 | 0.30 ms | 20,931.10 | 3.75x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 500 | 12.74 | 12.63 | 0.19 ms | 78,521.44 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 89.49 | 89.36 | 0.19 ms | 11,174.45 | 3.82x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 500 | 23.40 | 23.37 | 0.26 ms | 42,738.96 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.23 | 0.22 | 0.11 ms | 4,424,329.97 | 1.05x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 5000 | 0.21 | 0.23 | 0.16 ms | 4,665,698.07 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.56 | 0.55 | 0.13 ms | 1,783,882.78 | 2.13x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 5000 | 0.26 | 0.28 | 0.16 ms | 3,792,022.72 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.15 | 0.15 | 0.10 ms | 6,532,613.09 | 1.28x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 5000 | 0.20 | 0.20 | 0.15 ms | 5,084,368.74 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.46 | 0.45 | 0.08 ms | 2,178,243.84 | 1.72x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 5000 | 0.27 | 0.27 | 0.15 ms | 3,741,756.33 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.30 | 1.30 | 0.14 ms | 769,331.88 | 2.56x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 5000 | 0.51 | 0.51 | 0.12 ms | 1,972,994.54 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.25 | 7.69 | 1.04 ms | 121,258.36 | 4.14x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 1.99 | 1.94 | 0.13 ms | 502,124.87 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.15 | 1.16 | 0.20 ms | 866,479.91 | 4.87x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.24 | 0.23 | 0.12 ms | 4,221,004.63 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.24 | 0.24 | 0.12 ms | 4,086,341.54 | 4.79x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,554,729.04 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.40 | 0.39 | 0.07 ms | 2,504,715.75 | 4.11x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.10 | 0.09 | 0.12 ms | 10,301,430.15 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 33.82 | 33.74 | 0.14 ms | 29,568.44 | 4.80x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 500 | 7.04 | 7.01 | 0.16 ms | 142,025.49 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 64.12 | 63.98 | 0.17 ms | 15,595.85 | 5.00x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 500 | 12.83 | 12.81 | 0.10 ms | 77,933.97 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.15 | 0.15 | 0.15 ms | 6,701,523.52 | 3.87x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 25,966,320.38 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.36 | 0.34 | 0.16 ms | 2,806,665.18 | 7.27x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,403,405.94 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.03 | 0.03 | 0.03 ms | 28,638,709.08 | 1.78x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.01 ms | 51,080,088.47 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.31 | 0.29 | 0.31 ms | 3,219,369.79 | 4.48x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,419,184.44 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.85 | 0.85 | 0.13 ms | 1,179,139.61 | 5.84x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.14 | 0.02 ms | 6,886,504.55 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 33.28 | 33.30 | 0.25 ms | 30,050.08 | 4.85x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 6.86 | 6.74 | 0.14 ms | 145,749.34 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 33.02 | 33.09 | 0.12 ms | 30,287.36 | 4.78x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 6.90 | 6.82 | 0.15 ms | 144,880.95 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 213.45 | 213.54 | 0.31 ms | 4,684.95 | 6.20x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 34.41 | 33.72 | 0.44 ms | 29,064.01 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 0.83 | 0.82 | 0.16 ms | 1,202,570.54 | 5.71x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.15 | 0.14 | 0.02 ms | 6,870,440.50 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 0.81 | 0.81 | 0.10 ms | 1,237,354.16 | 5.56x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.15 | 0.14 | 0.03 ms | 6,875,953.50 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.23 | 0.22 | 0.17 ms | 4,401,609.93 | 4.61x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,309,300.49 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.21 | 0.20 | 0.09 ms | 4,777,689.34 | 4.30x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,555,005.71 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 4.36 | 4.08 | 0.73 ms | 229,114.76 | 2.58x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 11.28 | 11.20 | 0.54 ms | 88,669.19 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 9.43 | 9.15 | 0.72 ms | 106,083.27 | 1.95x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 18.38 | 18.47 | 0.30 ms | 54,401.75 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 4.99 | 4.96 | 0.13 ms | 200,429.47 | 2.49x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 12.41 | 12.46 | 0.31 ms | 80,550.97 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 4.39 | 3.41 | 1.89 ms | 227,704.26 | 1.96x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 8.60 | 8.67 | 0.21 ms | 116,308.65 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 250 | 4.01 | 3.87 | 0.15 ms | 249,507.47 | 3.79x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 250 | 1.06 | 0.88 | 0.11 ms | 945,756.60 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 250 | 9.73 | 9.35 | 0.56 ms | 102,760.41 | 2.59x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 250 | 3.76 | 3.11 | 0.39 ms | 265,774.87 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 250 | 5.34 | 5.29 | 0.18 ms | 187,259.31 | 4.08x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 250 | 1.31 | 1.14 | 0.11 ms | 763,528.68 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 14.60 | 14.53 | 0.56 ms | 68,491.69 | 2.11x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 6.92 | 6.92 | 0.23 ms | 144,563.51 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 16.85 | 16.62 | 0.82 ms | 59,350.21 | 1.67x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 10.08 | 10.04 | 0.23 ms | 99,250.56 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 16.37 | 16.10 | 0.74 ms | 61,078.57 | 2.00x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.20 | 8.22 | 0.16 ms | 121,992.67 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 17.03 | 17.01 | 0.28 ms | 58,726.01 | 1.91x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.91 | 8.94 | 0.12 ms | 112,170.57 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 19.29 | 19.11 | 0.63 ms | 51,839.24 | 2.12x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 9.09 | 9.18 | 0.28 ms | 110,019.57 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 15.73 | 15.62 | 0.89 ms | 63,579.93 | 2.03x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.73 | 7.69 | 0.17 ms | 129,332.82 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 15.91 | 15.91 | 0.28 ms | 62,872.61 | 1.95x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.17 | 8.13 | 0.13 ms | 122,353.70 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 14.75 | 14.57 | 0.71 ms | 67,779.52 | 2.04x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 7.23 | 7.24 | 0.16 ms | 138,266.37 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 14.51 | 14.46 | 0.67 ms | 68,895.11 | 1.93x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.52 | 7.58 | 0.22 ms | 132,894.97 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 250 | 411.35 | 410.66 | 1.06 ms | 2,431.02 | 1.52x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 250 | 270.36 | 269.91 | 0.51 ms | 3,698.75 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 250 | 1,995.50 | 1,999.70 | 4.55 ms | 501.13 | 1.63x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 250 | 1,227.83 | 1,217.52 | 8.90 ms | 814.44 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 250 | 2,109.53 | 2,106.87 | 5.53 ms | 474.04 | 2.06x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 250 | 1,025.27 | 1,020.78 | 2.81 ms | 975.35 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 250 | 2.56 | 2.57 | 0.12 ms | 391,261.72 | 11.48x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 250 | 0.22 | 0.22 | 0.00 ms | 4,489,751.02 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 250 | 2.83 | 2.66 | 0.13 ms | 353,497.48 | 10.63x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 250 | 0.27 | 0.26 | 0.01 ms | 3,758,225.82 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 250 | 0.84 | 0.82 | 0.01 ms | 1,185,946.30 | 6.29x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 250 | 0.13 | 0.13 | 0.01 ms | 7,461,461.55 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 250 | 0.85 | 0.82 | 0.02 ms | 1,181,481.46 | 6.56x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 250 | 0.13 | 0.12 | 0.01 ms | 7,746,893.50 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 250 | 12.49 | 12.50 | 0.13 ms | 80,063.39 | 4.17x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 250 | 3.00 | 2.90 | 0.10 ms | 333,778.32 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 250 | 6.74 | 6.46 | 0.13 ms | 148,284.99 | 3.89x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 250 | 1.73 | 1.61 | 0.11 ms | 577,430.05 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 250 | 6.31 | 6.34 | 0.02 ms | 158,447.73 | 4.21x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 250 | 1.50 | 1.50 | 0.01 ms | 666,592.45 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 250 | 10.59 | 10.42 | 0.12 ms | 94,448.96 | 4.33x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 250 | 2.45 | 2.35 | 0.06 ms | 408,785.37 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 250 | 10.30 | 10.22 | 0.12 ms | 97,119.40 | 3.43x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 250 | 3.00 | 2.84 | 0.12 ms | 333,021.07 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 250 | 16.82 | 16.58 | 0.21 ms | 59,462.68 | 3.60x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 250 | 4.68 | 4.25 | 0.17 ms | 213,831.34 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 250 | 5.40 | 5.23 | 0.10 ms | 185,109.48 | 3.64x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 250 | 1.48 | 1.35 | 0.07 ms | 673,618.18 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 250 | 8.93 | 8.85 | 0.09 ms | 112,027.30 | 3.45x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 250 | 2.59 | 2.41 | 0.13 ms | 385,979.23 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 250 | 12.93 | 12.69 | 0.12 ms | 77,327.56 | 3.33x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 250 | 3.88 | 3.50 | 0.17 ms | 257,542.55 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 1000 | 19.83 | 19.81 | 0.26 ms | 50,419.09 | 1.76x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 1000 | 34.97 | 35.08 | 0.46 ms | 28,597.52 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 1000 | 24.23 | 23.99 | 0.70 ms | 41,274.21 | 1.77x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 1000 | 42.92 | 39.14 | 6.91 ms | 23,301.24 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 1000 | 20.32 | 19.87 | 1.03 ms | 49,209.38 | 1.70x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 1000 | 34.56 | 34.47 | 0.53 ms | 28,937.19 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 250 | 26.18 | 26.27 | 0.12 ms | 38,199.80 | 1.55x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 250 | 16.93 | 16.90 | 0.29 ms | 59,064.71 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 250 | 52.78 | 52.97 | 0.33 ms | 18,945.11 | 1.84x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 250 | 28.72 | 28.47 | 0.19 ms | 34,815.18 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 250 | 58.28 | 58.67 | 0.96 ms | 17,159.48 | 1.51x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 250 | 38.53 | 38.63 | 0.20 ms | 25,952.50 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 250 | 26.57 | 26.65 | 0.32 ms | 37,640.12 | 1.67x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 250 | 15.95 | 16.18 | 0.18 ms | 62,683.65 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 250 | 71.28 | 71.18 | 0.29 ms | 14,028.55 | 1.88x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 250 | 37.91 | 37.67 | 0.19 ms | 26,375.55 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 250 | 48.03 | 47.78 | 0.58 ms | 20,819.52 | 2.02x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 250 | 23.74 | 24.00 | 0.18 ms | 42,120.74 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 250 | 27.12 | 26.73 | 0.62 ms | 36,874.71 | 1.83x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 250 | 14.81 | 14.94 | 0.21 ms | 67,529.45 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 250 | 64.94 | 64.21 | 0.68 ms | 15,399.43 | 1.92x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 250 | 33.85 | 34.26 | 0.19 ms | 29,545.68 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 250 | 43.82 | 43.79 | 0.36 ms | 22,820.68 | 2.00x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 250 | 21.89 | 21.86 | 0.10 ms | 45,681.96 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.87 | 0.86 | 0.12 ms | 1,147,673.27 | 3.07x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.28 | 0.27 | 0.16 ms | 3,522,018.43 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.30 | 1.30 | 0.17 ms | 770,078.58 | 5.04x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.26 | 0.25 | 0.12 ms | 3,882,269.78 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.11 | 1.11 | 0.14 ms | 901,903.84 | 1.68x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.66 | 0.65 | 0.17 ms | 1,514,033.20 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.63 | 0.62 | 0.13 ms | 1,581,230.79 | 4.08x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.16 | 0.15 | 0.15 ms | 6,448,622.61 | baseline | Reuses one parsed AST to isolate unparser cost. |

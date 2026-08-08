# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-08T12:42:13.122Z`

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
| `check` | constant regex | `@protoutil/cel` | 250 | 10.72 | 10.67 | 0.23 ms | 93,308.79 | 7.28x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.47 | 1.25 | 0.13 ms | 679,655.80 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 46.42 | 46.31 | 1.34 ms | 21,544.10 | 4.78x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 9.71 | 9.62 | 0.26 ms | 102,963.63 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 36.98 | 36.74 | 0.46 ms | 27,044.49 | 10.21x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.62 | 3.34 | 0.15 ms | 276,131.84 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 19.87 | 19.35 | 1.00 ms | 50,333.35 | 4.49x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.43 | 4.33 | 0.17 ms | 225,845.18 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 10.86 | 10.45 | 0.21 ms | 92,112.30 | 1.15x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 250 | 12.46 | 12.43 | 0.13 ms | 80,274.80 | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 33.81 | 33.39 | 0.36 ms | 29,577.47 | 1.19x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 250 | 28.31 | 28.41 | 0.23 ms | 35,325.99 | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 32.05 | 32.29 | 0.22 ms | 31,205.47 | 1.84x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 250 | 17.44 | 17.55 | 0.18 ms | 57,323.56 | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 17.72 | 17.45 | 0.40 ms | 56,440.64 | 1.33x slower | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 13.35 | 13.21 | 0.15 ms | 74,889.42 | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.23 | 0.22 | 0.11 ms | 4,294,936.74 | 4.69x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,145,196.50 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.41 | 0.40 | 0.18 ms | 2,420,666.29 | 4.89x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.08 | 0.08 | 0.00 ms | 11,841,473.46 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 33.13 | 33.20 | 0.16 ms | 30,181.89 | 4.61x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 500 | 7.19 | 7.09 | 0.16 ms | 139,078.44 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 62.52 | 62.52 | 0.31 ms | 15,994.44 | 4.84x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 500 | 12.93 | 12.88 | 0.14 ms | 77,340.02 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.14 | 0.14 | 0.01 ms | 6,953,749.91 | 3.97x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,591,782.34 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.38 | 0.37 | 0.17 ms | 2,640,859.66 | 7.31x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,310,452.70 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.06 | 0.06 | 0.02 ms | 17,913,803.26 | 2.77x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.01 ms | 49,543,272.95 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.34 | 0.29 | 0.39 ms | 2,908,632.30 | 5.05x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.02 ms | 14,688,337.35 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.83 | 0.81 | 0.14 ms | 1,207,200.92 | 5.57x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.15 | 0.02 ms | 6,724,761.88 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.40 | 0.38 | 0.20 ms | 2,496,424.65 | 1.50x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 5000 | 0.27 | 0.27 | 0.18 ms | 3,744,266.24 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.63 | 0.62 | 0.15 ms | 1,580,319.71 | 1.89x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.33 | 0.34 | 0.15 ms | 2,985,279.14 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 49.30 | 49.36 | 0.36 ms | 20,283.12 | 3.72x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 500 | 13.25 | 12.90 | 0.49 ms | 75,493.95 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 87.87 | 88.13 | 0.30 ms | 11,380.88 | 2.96x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 500 | 29.67 | 24.11 | 5.11 ms | 33,700.35 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.25 | 0.24 | 0.12 ms | 3,989,477.35 | 1.12x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 5000 | 0.22 | 0.23 | 0.17 ms | 4,485,414.72 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.61 | 0.60 | 0.19 ms | 1,637,702.60 | 2.25x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 5000 | 0.27 | 0.26 | 0.24 ms | 3,687,825.91 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.15 | 0.14 | 0.17 ms | 6,698,063.84 | 1.40x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 5000 | 0.21 | 0.22 | 0.21 ms | 4,799,952.96 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.47 | 0.45 | 0.17 ms | 2,150,060.69 | 1.68x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 5000 | 0.28 | 0.29 | 0.15 ms | 3,613,369.79 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.27 | 1.26 | 0.08 ms | 789,203.06 | 2.49x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 5000 | 0.51 | 0.50 | 0.14 ms | 1,961,296.85 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.34 | 7.72 | 1.17 ms | 119,939.28 | 3.87x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 2.16 | 2.07 | 0.33 ms | 463,640.47 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.16 | 1.17 | 0.14 ms | 861,168.08 | 4.77x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.24 | 0.23 | 0.14 ms | 4,107,971.04 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.22 | 0.22 | 0.03 ms | 4,556,371.72 | 4.55x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,711,984.83 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.42 | 0.41 | 0.14 ms | 2,383,671.90 | 4.91x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.09 | 0.01 ms | 11,695,058.37 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 33.19 | 33.14 | 0.18 ms | 30,131.14 | 4.71x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 500 | 7.05 | 6.99 | 0.16 ms | 141,936.67 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 62.69 | 62.94 | 0.35 ms | 15,951.76 | 4.89x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 500 | 12.82 | 12.84 | 0.10 ms | 78,022.26 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.18 | 0.17 | 0.15 ms | 5,712,145.29 | 4.79x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,348,089.91 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.38 | 0.37 | 0.13 ms | 2,665,719.27 | 7.19x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,175,069.34 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.05 | 0.03 | 0.14 ms | 21,906,812.80 | 2.38x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 52,190,909.13 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.30 | 0.30 | 0.11 ms | 3,304,078.74 | 4.48x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,807,279.55 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.83 | 0.81 | 0.13 ms | 1,209,601.21 | 5.71x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 5000 | 0.14 | 0.14 | 0.02 ms | 6,901,461.28 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 32.13 | 32.14 | 0.19 ms | 31,120.96 | 4.59x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 6.99 | 6.91 | 0.10 ms | 142,961.60 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 32.47 | 32.39 | 0.13 ms | 30,801.41 | 4.47x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 7.27 | 7.15 | 0.22 ms | 137,579.18 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 218.46 | 215.89 | 1.66 ms | 4,577.44 | 6.46x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 33.82 | 33.54 | 0.24 ms | 29,569.81 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 0.81 | 0.81 | 0.17 ms | 1,228,829.87 | 5.72x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 7,034,927.54 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 0.78 | 0.78 | 0.07 ms | 1,278,673.62 | 5.50x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 7,032,604.74 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.22 | 0.22 | 0.14 ms | 4,533,027.87 | 4.47x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,262,151.72 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.21 | 0.21 | 0.02 ms | 4,810,005.97 | 3.93x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 18,883,503.42 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 4.36 | 4.05 | 0.69 ms | 229,270.99 | 2.54x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 11.06 | 11.11 | 0.41 ms | 90,424.43 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 9.37 | 9.13 | 0.49 ms | 106,778.31 | 1.97x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 18.49 | 18.28 | 0.88 ms | 54,086.88 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 5.08 | 4.96 | 0.24 ms | 196,912.18 | 2.47x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 12.54 | 12.48 | 0.27 ms | 79,735.78 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 4.51 | 3.90 | 1.85 ms | 221,716.44 | 1.84x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 8.32 | 8.26 | 0.30 ms | 120,197.50 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 250 | 3.91 | 4.02 | 0.09 ms | 255,960.42 | 3.77x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 250 | 1.04 | 0.88 | 0.12 ms | 966,067.37 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 250 | 9.69 | 8.85 | 0.44 ms | 103,196.50 | 2.05x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 250 | 4.73 | 3.19 | 0.58 ms | 211,477.03 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 250 | 5.41 | 5.27 | 0.14 ms | 184,746.84 | 4.04x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 250 | 1.34 | 1.21 | 0.10 ms | 745,584.83 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 14.51 | 14.29 | 0.52 ms | 68,935.33 | 2.06x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 7.04 | 7.01 | 0.18 ms | 142,032.52 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 16.66 | 16.59 | 0.74 ms | 60,011.59 | 1.65x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 10.13 | 10.02 | 0.28 ms | 98,725.01 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 16.11 | 16.31 | 0.55 ms | 62,073.39 | 1.92x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.37 | 8.20 | 0.45 ms | 119,434.25 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 16.66 | 16.70 | 0.39 ms | 60,039.10 | 1.88x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.87 | 8.97 | 0.26 ms | 112,730.51 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 18.85 | 18.82 | 0.62 ms | 53,063.17 | 2.08x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 9.05 | 9.07 | 0.15 ms | 110,444.16 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 15.82 | 15.72 | 0.99 ms | 63,224.30 | 2.07x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.64 | 7.62 | 0.23 ms | 130,876.85 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 15.41 | 15.33 | 0.57 ms | 64,873.41 | 1.83x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.41 | 8.40 | 0.27 ms | 118,876.84 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 14.42 | 14.20 | 0.78 ms | 69,368.45 | 2.12x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 6.79 | 6.77 | 0.18 ms | 147,332.71 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 13.72 | 13.60 | 0.49 ms | 72,862.23 | 1.75x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.82 | 7.89 | 0.35 ms | 127,817.56 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 250 | 416.69 | 414.78 | 1.35 ms | 2,399.86 | 1.59x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 250 | 261.61 | 262.02 | 0.59 ms | 3,822.50 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 250 | 1,928.01 | 1,924.21 | 11.45 ms | 518.67 | 1.63x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 250 | 1,183.22 | 1,173.29 | 4.34 ms | 845.15 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 250 | 2,163.42 | 2,169.76 | 35.09 ms | 462.23 | 2.16x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 250 | 1,001.38 | 996.46 | 2.17 ms | 998.62 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 250 | 1.85 | 1.68 | 0.10 ms | 539,168.58 | 9.11x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 250 | 0.20 | 0.20 | 0.00 ms | 4,913,509.94 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 250 | 1.83 | 1.81 | 0.01 ms | 546,890.08 | 7.47x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 250 | 0.24 | 0.24 | 0.00 ms | 4,086,828.76 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 250 | 0.75 | 0.75 | 0.00 ms | 1,328,608.80 | 3.12x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 250 | 0.24 | 0.16 | 0.06 ms | 4,142,579.29 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 250 | 0.75 | 0.75 | 0.00 ms | 1,331,262.78 | 4.50x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 250 | 0.17 | 0.12 | 0.03 ms | 5,991,737.39 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 250 | 12.72 | 12.66 | 0.11 ms | 78,610.68 | 4.03x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 250 | 3.15 | 2.78 | 0.17 ms | 316,994.84 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 250 | 6.60 | 6.57 | 0.06 ms | 151,500.33 | 4.12x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 250 | 1.60 | 1.47 | 0.09 ms | 624,251.87 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 250 | 6.54 | 6.50 | 0.06 ms | 152,874.04 | 4.13x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 250 | 1.58 | 1.41 | 0.11 ms | 631,080.46 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 250 | 10.37 | 10.27 | 0.08 ms | 96,391.35 | 4.28x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 250 | 2.42 | 2.27 | 0.11 ms | 412,658.38 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 250 | 9.72 | 9.58 | 0.09 ms | 102,908.45 | 3.36x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 250 | 2.89 | 2.75 | 0.10 ms | 346,255.41 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 250 | 16.73 | 16.63 | 0.10 ms | 59,781.87 | 3.84x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 250 | 4.36 | 4.26 | 0.10 ms | 229,445.52 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 250 | 5.48 | 5.42 | 0.03 ms | 182,504.61 | 4.01x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 250 | 1.37 | 1.34 | 0.02 ms | 731,796.56 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 250 | 8.63 | 8.57 | 0.04 ms | 115,911.78 | 3.46x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 250 | 2.50 | 2.41 | 0.08 ms | 400,701.15 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 250 | 12.91 | 12.74 | 0.14 ms | 77,437.34 | 3.35x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 250 | 3.86 | 3.57 | 0.13 ms | 259,337.48 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 1000 | 19.82 | 19.86 | 0.27 ms | 50,461.17 | 1.71x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 1000 | 33.95 | 33.92 | 0.33 ms | 29,453.42 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 1000 | 23.41 | 23.46 | 0.34 ms | 42,712.36 | 1.63x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 1000 | 38.18 | 38.40 | 0.67 ms | 26,190.47 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 1000 | 19.71 | 19.38 | 0.95 ms | 50,738.04 | 1.77x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 1000 | 34.95 | 34.94 | 0.41 ms | 28,609.29 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 250 | 26.81 | 26.49 | 0.19 ms | 37,302.94 | 1.67x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 250 | 16.04 | 15.79 | 0.18 ms | 62,355.15 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 250 | 51.44 | 50.94 | 0.50 ms | 19,439.06 | 1.86x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 250 | 27.62 | 27.71 | 0.17 ms | 36,210.43 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 250 | 58.07 | 57.70 | 0.88 ms | 17,219.56 | 1.59x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 250 | 36.59 | 36.41 | 0.13 ms | 27,331.57 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 250 | 24.96 | 24.88 | 0.27 ms | 40,064.80 | 1.43x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 250 | 17.47 | 16.18 | 0.91 ms | 57,250.13 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 250 | 68.22 | 68.45 | 0.36 ms | 14,659.00 | 1.82x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 250 | 37.53 | 37.57 | 0.27 ms | 26,648.12 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 250 | 45.84 | 45.50 | 0.57 ms | 21,814.39 | 2.00x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 250 | 22.94 | 22.99 | 0.33 ms | 43,600.37 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 250 | 26.39 | 25.52 | 0.79 ms | 37,895.62 | 1.21x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 250 | 21.84 | 16.82 | 2.82 ms | 45,781.78 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 250 | 62.28 | 62.10 | 0.88 ms | 16,056.10 | 1.87x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 250 | 33.31 | 33.12 | 0.40 ms | 30,023.98 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 250 | 43.44 | 42.66 | 0.64 ms | 23,020.96 | 2.03x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 250 | 21.38 | 21.40 | 0.14 ms | 46,780.89 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.86 | 0.86 | 0.21 ms | 1,161,319.37 | 3.20x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.27 | 0.25 | 0.17 ms | 3,714,006.29 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.26 | 1.27 | 0.12 ms | 791,558.68 | 4.78x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.26 | 0.25 | 0.14 ms | 3,783,086.52 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.07 | 1.07 | 0.14 ms | 938,340.32 | 1.60x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.67 | 0.65 | 0.20 ms | 1,502,434.43 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.61 | 0.61 | 0.15 ms | 1,638,818.09 | 4.47x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 7,330,538.57 | baseline | Reuses one parsed AST to isolate unparser cost. |

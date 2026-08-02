# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-02T01:13:13.646Z`

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
| `check` | constant regex | `@protoutil/cel` | 250 | 10.76 | 10.34 | 0.23 ms | 92,912.51 | 7.51x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.43 | 1.23 | 0.13 ms | 697,654.14 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 46.44 | 45.29 | 1.07 ms | 21,531.83 | 5.13x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 9.06 | 8.68 | 0.33 ms | 110,365.62 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 37.27 | 37.69 | 0.63 ms | 26,833.00 | 10.52x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.54 | 3.16 | 0.14 ms | 282,163.82 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 19.57 | 18.37 | 0.90 ms | 51,091.82 | 4.28x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.57 | 4.20 | 0.18 ms | 218,711.68 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 10.45 | 10.30 | 0.14 ms | 95,673.74 | 1.20x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 250 | 12.59 | 12.65 | 0.14 ms | 79,448.89 | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 35.73 | 35.50 | 0.41 ms | 27,985.50 | 1.30x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 250 | 27.59 | 27.61 | 0.11 ms | 36,248.82 | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 32.50 | 32.23 | 0.30 ms | 30,770.73 | 1.90x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 250 | 17.11 | 16.60 | 0.21 ms | 58,456.10 | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 17.16 | 17.13 | 0.46 ms | 58,264.24 | 1.29x slower | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 13.35 | 13.18 | 0.16 ms | 74,919.11 | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.30 | 0.29 | 0.15 ms | 3,322,178.84 | 5.94x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,746,572.49 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.41 | 0.40 | 0.19 ms | 2,427,712.14 | 3.94x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.10 | 0.09 | 0.17 ms | 9,571,573.96 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 40.59 | 40.61 | 0.23 ms | 24,636.26 | 5.73x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 500 | 7.08 | 6.98 | 0.15 ms | 141,155.09 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 77.57 | 77.59 | 0.18 ms | 12,892.04 | 5.99x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 500 | 12.95 | 12.79 | 0.17 ms | 77,215.73 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.15 | 0.15 | 0.01 ms | 6,853,223.99 | 4.09x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.00 ms | 28,038,241.36 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.36 | 0.35 | 0.14 ms | 2,795,679.25 | 7.19x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,093,363.81 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.04 | 0.04 | 0.03 ms | 25,132,890.16 | 1.89x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.01 ms | 47,531,792.83 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.35 | 0.34 | 0.14 ms | 2,842,457.10 | 5.21x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,807,948.31 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.85 | 0.85 | 0.15 ms | 1,179,054.03 | 5.78x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.14 | 0.03 ms | 6,812,666.65 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.47 | 0.46 | 0.15 ms | 2,133,541.91 | 1.89x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 5000 | 0.25 | 0.25 | 0.15 ms | 4,026,862.39 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.63 | 0.62 | 0.11 ms | 1,592,967.11 | 1.93x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.33 | 0.33 | 0.14 ms | 3,067,916.15 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 55.18 | 55.27 | 0.19 ms | 18,121.39 | 4.30x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 500 | 12.83 | 12.79 | 0.16 ms | 77,913.92 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 110.58 | 105.15 | 7.89 ms | 9,043.53 | 4.77x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 500 | 23.16 | 23.19 | 0.14 ms | 43,182.81 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.25 | 0.25 | 0.08 ms | 3,947,774.50 | 1.15x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 5000 | 0.22 | 0.24 | 0.16 ms | 4,542,443.63 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.57 | 0.57 | 0.10 ms | 1,749,293.37 | 2.21x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 5000 | 0.26 | 0.26 | 0.13 ms | 3,874,280.00 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.15 | 0.14 | 0.12 ms | 6,655,342.60 | 1.24x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 5000 | 0.19 | 0.19 | 0.18 ms | 5,350,484.85 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.52 | 0.51 | 0.16 ms | 1,916,492.94 | 1.95x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 5000 | 0.27 | 0.28 | 0.15 ms | 3,731,473.47 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.30 | 1.31 | 0.12 ms | 766,407.09 | 2.55x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 5000 | 0.51 | 0.51 | 0.23 ms | 1,952,064.71 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.51 | 8.01 | 1.02 ms | 117,509.32 | 4.28x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 1.99 | 1.94 | 0.17 ms | 503,172.34 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.17 | 1.17 | 0.06 ms | 855,739.26 | 4.96x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.24 | 0.23 | 0.07 ms | 4,248,614.02 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.29 | 0.28 | 0.15 ms | 3,409,575.71 | 5.97x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,343,293.07 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.41 | 0.40 | 0.14 ms | 2,462,719.51 | 4.49x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.09 | 0.02 ms | 11,051,634.90 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 44.61 | 41.28 | 4.14 ms | 22,417.86 | 6.35x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 500 | 7.03 | 6.97 | 0.11 ms | 142,249.62 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 77.96 | 78.03 | 0.27 ms | 12,826.86 | 6.04x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 500 | 12.92 | 12.86 | 0.12 ms | 77,417.61 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.18 | 0.16 | 0.24 ms | 5,566,121.14 | 4.94x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,489,859.68 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.35 | 0.34 | 0.10 ms | 2,881,636.56 | 6.83x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,678,996.21 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,888,940.16 | 2.68x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 53,365,993.32 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.33 | 0.33 | 0.03 ms | 2,990,710.11 | 4.79x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,311,265.00 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.82 | 0.81 | 0.15 ms | 1,215,392.94 | 5.71x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 6,934,563.89 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 39.77 | 39.42 | 0.40 ms | 25,144.24 | 5.60x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 7.10 | 6.96 | 0.20 ms | 140,802.93 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 39.86 | 39.81 | 0.21 ms | 25,085.01 | 5.69x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 7.00 | 6.97 | 0.14 ms | 142,790.42 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 219.22 | 219.14 | 0.64 ms | 4,561.72 | 6.53x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 33.55 | 33.59 | 0.31 ms | 29,810.04 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 0.79 | 0.79 | 0.11 ms | 1,263,754.91 | 5.20x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.15 | 0.15 | 0.04 ms | 6,568,054.98 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 0.80 | 0.79 | 0.12 ms | 1,256,075.91 | 5.43x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.15 | 0.14 | 0.04 ms | 6,814,743.08 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.26 | 0.25 | 0.16 ms | 3,806,849.95 | 5.39x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,522,460.81 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.26 | 0.26 | 0.03 ms | 3,870,375.32 | 5.32x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,574,395.99 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 4.47 | 4.18 | 0.70 ms | 223,629.49 | 2.42x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 10.82 | 10.63 | 0.48 ms | 92,399.03 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 9.57 | 9.39 | 0.60 ms | 104,524.04 | 1.86x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 17.79 | 17.75 | 0.38 ms | 56,219.42 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 5.13 | 5.14 | 0.18 ms | 194,993.35 | 2.33x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 11.96 | 12.01 | 0.17 ms | 83,588.82 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 4.81 | 3.46 | 2.86 ms | 207,976.10 | 1.73x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 8.33 | 8.18 | 0.31 ms | 120,108.77 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 250 | 3.75 | 3.51 | 0.15 ms | 266,985.55 | 3.66x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 250 | 1.02 | 0.90 | 0.07 ms | 978,474.54 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 250 | 9.61 | 8.85 | 0.40 ms | 104,075.64 | 2.95x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 250 | 3.26 | 2.90 | 0.18 ms | 307,078.15 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 250 | 5.84 | 5.70 | 0.16 ms | 171,097.38 | 4.42x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 250 | 1.32 | 1.18 | 0.08 ms | 755,727.66 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 13.55 | 13.26 | 0.57 ms | 73,827.44 | 1.57x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 8.63 | 7.05 | 2.92 ms | 115,925.79 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 15.96 | 15.70 | 0.84 ms | 62,647.32 | 1.63x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 9.76 | 9.71 | 0.43 ms | 102,424.64 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 16.68 | 16.59 | 0.55 ms | 59,948.20 | 2.00x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.32 | 8.27 | 0.38 ms | 120,144.92 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 15.38 | 15.38 | 0.16 ms | 65,028.91 | 1.71x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.99 | 8.84 | 0.44 ms | 111,178.67 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 18.17 | 18.09 | 0.30 ms | 55,041.99 | 2.01x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 9.04 | 8.95 | 0.34 ms | 110,582.13 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 19.04 | 16.39 | 6.82 ms | 52,526.47 | 2.50x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.63 | 7.66 | 0.22 ms | 131,123.99 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 16.06 | 16.01 | 0.46 ms | 62,262.46 | 1.97x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.17 | 8.17 | 0.22 ms | 122,426.49 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 13.71 | 13.69 | 0.59 ms | 72,927.52 | 1.96x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 6.99 | 6.94 | 0.32 ms | 143,082.31 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 14.29 | 14.27 | 0.40 ms | 69,963.35 | 1.99x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.18 | 7.15 | 0.11 ms | 139,184.09 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 250 | 393.45 | 394.42 | 1.81 ms | 2,541.65 | 1.51x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 250 | 259.85 | 261.77 | 1.02 ms | 3,848.43 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 250 | 1,934.32 | 1,880.34 | 32.94 ms | 516.98 | 1.62x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 250 | 1,192.14 | 1,176.22 | 10.91 ms | 838.83 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 250 | 2,039.81 | 2,063.93 | 18.07 ms | 490.24 | 2.04x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 250 | 1,001.71 | 993.82 | 3.87 ms | 998.29 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 250 | 2.04 | 2.01 | 0.02 ms | 490,652.10 | 9.52x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 250 | 0.21 | 0.21 | 0.00 ms | 4,672,438.69 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 250 | 2.19 | 2.19 | 0.00 ms | 457,116.63 | 8.45x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 250 | 0.26 | 0.25 | 0.00 ms | 3,864,122.01 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 250 | 0.86 | 0.86 | 0.00 ms | 1,163,889.63 | 6.98x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 250 | 0.12 | 0.12 | 0.00 ms | 8,128,693.48 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 250 | 0.86 | 0.86 | 0.00 ms | 1,163,748.76 | 7.14x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 250 | 0.12 | 0.12 | 0.00 ms | 8,311,653.77 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 250 | 13.38 | 13.03 | 0.15 ms | 74,749.35 | 4.26x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 250 | 3.14 | 2.84 | 0.17 ms | 318,236.97 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 250 | 12.95 | 8.10 | 2.39 ms | 77,199.46 | 7.98x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 250 | 1.62 | 1.48 | 0.10 ms | 616,387.91 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 250 | 7.02 | 6.93 | 0.07 ms | 142,461.14 | 4.27x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 250 | 1.64 | 1.50 | 0.11 ms | 608,411.29 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 250 | 11.13 | 10.98 | 0.08 ms | 89,868.96 | 4.65x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 250 | 2.39 | 2.23 | 0.11 ms | 417,747.24 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 250 | 12.38 | 12.32 | 0.18 ms | 80,770.01 | 4.36x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 250 | 2.84 | 2.66 | 0.13 ms | 352,205.63 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 250 | 19.67 | 19.41 | 0.10 ms | 50,835.39 | 4.19x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 250 | 4.69 | 4.45 | 0.13 ms | 213,211.05 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 250 | 6.35 | 6.25 | 0.06 ms | 157,452.40 | 4.29x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 250 | 1.48 | 1.33 | 0.10 ms | 675,115.51 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 250 | 10.06 | 9.91 | 0.09 ms | 99,387.72 | 3.65x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 250 | 2.76 | 2.26 | 0.23 ms | 362,354.49 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 250 | 15.49 | 15.24 | 0.15 ms | 64,558.82 | 4.01x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 250 | 3.86 | 3.74 | 0.12 ms | 259,014.21 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 1000 | 19.83 | 19.81 | 0.43 ms | 50,424.66 | 1.71x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 1000 | 33.87 | 33.66 | 0.61 ms | 29,523.41 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 1000 | 23.39 | 23.35 | 0.23 ms | 42,750.55 | 1.62x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 1000 | 37.84 | 37.90 | 0.37 ms | 26,424.02 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 1000 | 20.23 | 19.76 | 1.14 ms | 49,431.52 | 1.72x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 1000 | 34.81 | 34.50 | 0.60 ms | 28,729.83 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 250 | 23.87 | 23.70 | 0.19 ms | 41,888.47 | 1.47x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 250 | 16.19 | 16.22 | 0.14 ms | 61,772.80 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 250 | 45.47 | 44.78 | 0.58 ms | 21,994.28 | 1.59x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 250 | 28.60 | 28.65 | 0.17 ms | 34,959.66 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 250 | 50.47 | 51.76 | 0.90 ms | 19,813.17 | 1.42x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 250 | 35.59 | 35.74 | 0.15 ms | 28,096.74 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 250 | 26.14 | 25.82 | 0.38 ms | 38,254.54 | 1.64x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 250 | 15.95 | 15.83 | 0.13 ms | 62,693.88 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 250 | 70.04 | 69.67 | 0.45 ms | 14,277.84 | 1.95x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 250 | 35.96 | 35.93 | 0.10 ms | 27,810.27 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 250 | 46.71 | 46.36 | 0.38 ms | 21,408.63 | 2.06x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 250 | 22.70 | 22.50 | 0.15 ms | 44,055.49 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 250 | 26.67 | 26.61 | 0.68 ms | 37,499.65 | 1.87x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 250 | 14.27 | 14.33 | 0.13 ms | 70,080.46 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 250 | 63.20 | 62.81 | 0.58 ms | 15,823.12 | 1.58x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 250 | 39.96 | 33.06 | 4.02 ms | 25,026.75 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 250 | 44.39 | 43.84 | 0.49 ms | 22,527.06 | 2.06x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 250 | 21.52 | 21.43 | 0.26 ms | 46,461.57 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.86 | 0.86 | 0.09 ms | 1,168,702.16 | 3.15x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.27 | 0.27 | 0.11 ms | 3,681,306.36 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.32 | 1.31 | 0.19 ms | 759,747.30 | 5.08x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.26 | 0.25 | 0.12 ms | 3,860,833.92 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.09 | 1.10 | 0.12 ms | 918,121.72 | 1.68x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.65 | 0.64 | 0.12 ms | 1,544,600.37 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.61 | 0.60 | 0.12 ms | 1,648,218.57 | 3.81x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.16 | 0.16 | 0.08 ms | 6,284,573.01 | baseline | Reuses one parsed AST to isolate unparser cost. |

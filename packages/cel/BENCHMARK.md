# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-02T03:57:57.569Z`

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
| `check` | constant regex | `@protoutil/cel` | 250 | 10.87 | 10.85 | 0.19 ms | 91,997.56 | 6.11x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.78 | 1.42 | 0.21 ms | 562,377.03 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 46.17 | 44.39 | 1.07 ms | 21,658.97 | 4.90x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 9.42 | 9.40 | 0.10 ms | 106,188.57 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 37.05 | 36.61 | 0.50 ms | 26,989.05 | 9.30x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.98 | 3.53 | 0.17 ms | 251,101.20 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 21.08 | 21.33 | 1.09 ms | 47,430.32 | 4.55x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.64 | 4.65 | 0.18 ms | 215,653.81 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 10.39 | 10.26 | 0.15 ms | 96,276.50 | 1.22x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 250 | 12.67 | 12.50 | 0.17 ms | 78,907.91 | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 35.43 | 34.51 | 0.44 ms | 28,221.08 | 1.23x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 250 | 28.72 | 28.59 | 0.34 ms | 34,815.51 | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 32.55 | 32.51 | 0.43 ms | 30,719.70 | 1.88x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 250 | 17.28 | 17.29 | 0.23 ms | 57,871.91 | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 16.56 | 16.47 | 0.42 ms | 60,381.69 | 1.22x slower | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 13.62 | 13.63 | 0.29 ms | 73,405.83 | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.23 | 0.22 | 0.03 ms | 4,414,747.42 | 4.60x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,310,177.02 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.42 | 0.40 | 0.17 ms | 2,408,737.60 | 4.71x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.09 | 0.03 ms | 11,343,759.00 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 34.37 | 34.36 | 0.15 ms | 29,091.56 | 4.86x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 500 | 7.07 | 7.14 | 0.14 ms | 141,344.84 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 66.28 | 66.24 | 0.33 ms | 15,087.93 | 5.05x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 500 | 13.13 | 13.00 | 0.14 ms | 76,188.60 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.16 | 0.15 | 0.12 ms | 6,279,024.79 | 4.42x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.00 ms | 27,775,347.43 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.37 | 0.37 | 0.05 ms | 2,699,510.53 | 7.56x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,414,245.88 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.06 | 0.06 | 0.01 ms | 17,830,278.04 | 2.78x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.01 ms | 49,522,908.68 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.30 | 0.29 | 0.12 ms | 3,331,933.37 | 4.46x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,856,539.68 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.85 | 0.85 | 0.09 ms | 1,171,274.47 | 5.84x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.15 | 0.02 ms | 6,843,406.77 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.38 | 0.38 | 0.09 ms | 2,615,761.16 | 1.65x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 5000 | 0.23 | 0.23 | 0.16 ms | 4,314,995.54 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.66 | 0.63 | 0.49 ms | 1,505,830.42 | 2.00x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.33 | 0.36 | 0.23 ms | 3,013,163.61 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 48.13 | 48.16 | 0.20 ms | 20,775.43 | 3.87x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 500 | 12.42 | 12.29 | 0.20 ms | 80,488.02 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 92.34 | 92.22 | 0.45 ms | 10,829.42 | 3.98x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 500 | 23.20 | 23.17 | 0.18 ms | 43,105.98 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.25 | 0.24 | 0.14 ms | 3,957,572.06 | 1.19x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 5000 | 0.21 | 0.22 | 0.18 ms | 4,694,674.23 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.61 | 0.60 | 0.15 ms | 1,646,412.43 | 2.24x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 5000 | 0.27 | 0.29 | 0.17 ms | 3,682,506.79 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.16 | 0.15 | 0.16 ms | 6,090,173.85 | 1.17x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 5000 | 0.19 | 0.21 | 0.15 ms | 5,207,569.83 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.44 | 0.44 | 0.13 ms | 2,248,475.29 | 1.60x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 5000 | 0.28 | 0.29 | 0.15 ms | 3,600,981.70 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.35 | 1.35 | 0.19 ms | 739,126.76 | 2.54x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 5000 | 0.53 | 0.53 | 0.40 ms | 1,875,516.53 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.43 | 7.86 | 1.09 ms | 118,668.68 | 4.18x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 2.02 | 1.93 | 0.18 ms | 495,730.83 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.19 | 1.18 | 0.13 ms | 837,095.91 | 4.87x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.25 | 0.23 | 0.16 ms | 4,075,395.22 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.23 | 0.23 | 0.11 ms | 4,265,604.25 | 4.73x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,191,812.12 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.39 | 0.39 | 0.03 ms | 2,536,890.67 | 4.20x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.09 | 0.11 ms | 10,662,165.81 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 34.72 | 34.69 | 0.20 ms | 28,800.50 | 4.92x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 500 | 7.05 | 6.98 | 0.16 ms | 141,761.65 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 65.67 | 65.83 | 0.19 ms | 15,227.18 | 2.18x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 500 | 30.09 | 13.09 | 21.79 ms | 33,229.54 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.17 | 0.17 | 0.08 ms | 5,806,673.20 | 4.71x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,329,386.06 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.37 | 0.37 | 0.06 ms | 2,675,354.08 | 7.41x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,817,922.83 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.06 | 0.04 | 0.25 ms | 16,995,364.09 | 3.16x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 53,715,356.95 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.29 | 0.28 | 0.06 ms | 3,494,696.27 | 4.17x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,575,495.97 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 0.86 | 0.86 | 0.21 ms | 1,159,984.88 | 6.06x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 7,031,264.69 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 33.53 | 33.39 | 0.26 ms | 29,826.51 | 4.55x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 7.38 | 7.14 | 0.36 ms | 135,569.28 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 33.85 | 33.77 | 0.16 ms | 29,540.03 | 4.56x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 7.42 | 6.98 | 0.64 ms | 134,757.08 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 212.20 | 211.53 | 0.50 ms | 4,712.45 | 6.27x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 33.83 | 33.85 | 0.17 ms | 29,555.65 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 0.82 | 0.82 | 0.15 ms | 1,219,106.43 | 5.71x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 6,961,869.67 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 0.81 | 0.80 | 0.13 ms | 1,235,001.41 | 5.69x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.14 | 0.14 | 0.01 ms | 7,028,383.60 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.21 | 0.19 | 0.16 ms | 4,682,768.21 | 4.26x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 19,929,400.10 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.20 | 0.20 | 0.04 ms | 4,913,351.81 | 4.22x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,727,182.09 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 4.48 | 4.13 | 0.69 ms | 223,318.67 | 2.47x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 11.06 | 11.07 | 0.14 ms | 90,435.59 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 9.50 | 9.54 | 0.47 ms | 105,218.11 | 1.91x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 18.20 | 18.17 | 0.24 ms | 54,960.14 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 5.13 | 4.96 | 0.31 ms | 194,887.06 | 2.44x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 12.54 | 12.49 | 0.28 ms | 79,766.65 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 4.43 | 3.56 | 1.90 ms | 225,640.26 | 2.89x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 12.80 | 9.22 | 6.44 ms | 78,154.22 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 250 | 4.05 | 3.82 | 0.16 ms | 246,619.31 | 3.93x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 250 | 1.03 | 0.91 | 0.06 ms | 968,562.40 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 250 | 9.91 | 9.70 | 0.48 ms | 100,920.90 | 2.96x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 250 | 3.35 | 3.23 | 0.15 ms | 298,923.86 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 250 | 5.15 | 5.20 | 0.09 ms | 194,006.78 | 3.83x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 250 | 1.35 | 1.25 | 0.09 ms | 743,321.72 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 14.20 | 13.96 | 0.53 ms | 70,430.36 | 2.01x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 7.08 | 7.00 | 0.19 ms | 141,294.39 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 16.73 | 16.42 | 0.86 ms | 59,790.44 | 1.67x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 10.02 | 9.91 | 0.31 ms | 99,771.67 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 15.98 | 15.73 | 0.65 ms | 62,576.06 | 1.92x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.31 | 8.26 | 0.32 ms | 120,270.68 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 16.97 | 17.05 | 0.23 ms | 58,912.22 | 1.94x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.76 | 8.78 | 0.23 ms | 114,194.43 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 19.33 | 19.16 | 0.81 ms | 51,744.41 | 2.11x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 9.16 | 9.09 | 0.28 ms | 109,144.43 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 15.66 | 15.44 | 0.82 ms | 63,866.84 | 1.98x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.89 | 7.84 | 0.51 ms | 126,759.95 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 15.63 | 15.64 | 0.27 ms | 63,993.28 | 1.87x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.35 | 8.37 | 0.14 ms | 119,732.70 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 14.98 | 14.79 | 0.85 ms | 66,765.24 | 2.13x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 7.04 | 7.03 | 0.16 ms | 141,961.01 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 14.82 | 14.74 | 0.41 ms | 67,484.83 | 2.03x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.30 | 7.27 | 0.20 ms | 136,912.75 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 250 | 428.92 | 413.87 | 6.81 ms | 2,331.46 | 1.55x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 250 | 276.40 | 266.68 | 6.53 ms | 3,617.94 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 250 | 2,081.28 | 2,024.75 | 24.54 ms | 480.47 | 1.70x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 250 | 1,221.12 | 1,221.90 | 2.00 ms | 818.92 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 250 | 2,205.39 | 2,193.34 | 13.55 ms | 453.44 | 2.12x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 250 | 1,039.26 | 1,039.34 | 1.33 ms | 962.23 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 250 | 1.78 | 1.76 | 0.02 ms | 561,416.75 | 7.57x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 250 | 0.24 | 0.23 | 0.00 ms | 4,249,667.99 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 250 | 1.84 | 1.83 | 0.01 ms | 542,802.27 | 7.48x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 250 | 0.25 | 0.24 | 0.00 ms | 4,060,913.71 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 250 | 0.76 | 0.73 | 0.01 ms | 1,319,624.20 | 6.12x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 250 | 0.12 | 0.12 | 0.00 ms | 8,082,179.60 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 250 | 0.74 | 0.74 | 0.01 ms | 1,345,177.17 | 5.37x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 250 | 0.14 | 0.13 | 0.00 ms | 7,226,765.05 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 250 | 12.70 | 12.63 | 0.10 ms | 78,738.99 | 4.14x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 250 | 3.07 | 2.93 | 0.11 ms | 325,790.36 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 250 | 6.62 | 6.44 | 0.11 ms | 150,990.87 | 3.74x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 250 | 1.77 | 1.56 | 0.13 ms | 565,410.98 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 250 | 6.57 | 6.56 | 0.04 ms | 152,189.14 | 3.89x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 250 | 1.69 | 1.53 | 0.11 ms | 591,547.96 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 250 | 10.43 | 10.31 | 0.07 ms | 95,843.20 | 4.22x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 250 | 2.47 | 2.33 | 0.10 ms | 404,479.20 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 250 | 10.19 | 10.16 | 0.08 ms | 98,109.95 | 3.49x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 250 | 2.92 | 2.80 | 0.10 ms | 342,490.15 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 250 | 17.41 | 17.31 | 0.15 ms | 57,427.81 | 3.82x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 250 | 4.56 | 4.38 | 0.12 ms | 219,215.13 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 250 | 5.78 | 5.73 | 0.06 ms | 172,864.60 | 4.05x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 250 | 1.43 | 1.41 | 0.02 ms | 699,841.49 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 250 | 8.83 | 8.76 | 0.06 ms | 113,266.59 | 3.34x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 250 | 2.64 | 2.48 | 0.12 ms | 378,348.98 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 250 | 13.30 | 13.22 | 0.14 ms | 75,198.45 | 3.57x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 250 | 3.73 | 3.63 | 0.15 ms | 268,342.34 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 1000 | 23.23 | 20.42 | 5.22 ms | 43,039.01 | 1.79x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 1000 | 41.64 | 35.14 | 13.07 ms | 24,016.05 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 1000 | 23.74 | 23.79 | 0.25 ms | 42,121.98 | 1.63x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 1000 | 38.69 | 38.49 | 0.72 ms | 25,844.49 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 1000 | 20.19 | 19.86 | 0.74 ms | 49,532.52 | 1.73x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 1000 | 34.95 | 34.92 | 0.42 ms | 28,608.42 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 250 | 26.56 | 26.62 | 0.17 ms | 37,657.37 | 1.59x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 250 | 16.75 | 16.62 | 0.16 ms | 59,706.54 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 250 | 52.99 | 52.21 | 0.49 ms | 18,872.06 | 1.85x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 250 | 28.70 | 28.73 | 0.09 ms | 34,847.78 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 250 | 60.48 | 60.05 | 0.85 ms | 16,535.68 | 1.62x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 250 | 37.42 | 37.56 | 0.15 ms | 26,723.56 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 250 | 34.53 | 26.29 | 4.00 ms | 28,959.50 | 2.09x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 250 | 16.52 | 16.46 | 0.30 ms | 60,549.03 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 250 | 71.69 | 71.86 | 0.29 ms | 13,949.47 | 1.90x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 250 | 37.71 | 38.07 | 0.22 ms | 26,519.47 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 250 | 50.52 | 49.49 | 0.91 ms | 19,792.56 | 2.10x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 250 | 24.00 | 23.91 | 0.17 ms | 41,658.75 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 250 | 27.00 | 26.34 | 0.58 ms | 37,037.04 | 1.78x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 250 | 15.13 | 15.05 | 0.20 ms | 66,110.15 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 250 | 65.15 | 63.49 | 1.10 ms | 15,349.63 | 1.92x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 250 | 33.87 | 33.57 | 0.47 ms | 29,527.00 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 250 | 44.24 | 43.66 | 0.37 ms | 22,604.81 | 2.03x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 250 | 21.76 | 21.78 | 0.17 ms | 45,958.30 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.86 | 0.87 | 0.12 ms | 1,162,503.45 | 3.10x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.28 | 0.27 | 0.16 ms | 3,604,956.92 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.28 | 1.27 | 0.18 ms | 778,895.80 | 4.55x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.28 | 0.26 | 0.28 ms | 3,542,069.24 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.07 | 1.07 | 0.12 ms | 933,714.99 | 1.59x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.67 | 0.66 | 0.26 ms | 1,483,457.12 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.60 | 0.60 | 0.16 ms | 1,653,174.42 | 3.95x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.15 | 0.14 | 0.15 ms | 6,537,061.79 | baseline | Reuses one parsed AST to isolate unparser cost. |

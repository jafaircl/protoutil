# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-07-30T23:41:24.890Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the `cel-go` reference implementation on the same machine. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

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
| `check` | constant regex | `@protoutil/cel` | 250 | 10.36 | 10.03 | 0.24 ms | 96,545.87 | 6.81x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.52 | 1.26 | 0.12 ms | 657,723.38 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 44.49 | 43.30 | 1.27 ms | 22,478.89 | 5.07x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 8.78 | 8.91 | 0.11 ms | 113,898.72 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 36.55 | 37.54 | 0.53 ms | 27,360.64 | 9.84x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.72 | 3.55 | 0.12 ms | 269,109.61 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 19.24 | 17.82 | 0.82 ms | 51,966.78 | 4.46x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.31 | 4.11 | 0.18 ms | 231,932.25 | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 10.63 | 10.83 | 0.24 ms | 94,075.77 | 1.14x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 250 | 12.11 | 12.10 | 0.08 ms | 82,591.88 | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 33.64 | 32.70 | 0.44 ms | 29,723.07 | 1.22x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 250 | 27.51 | 26.69 | 0.57 ms | 36,352.79 | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 31.72 | 31.67 | 0.15 ms | 31,529.54 | 1.88x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 250 | 16.83 | 16.71 | 0.10 ms | 59,421.09 | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 17.19 | 17.29 | 0.41 ms | 58,180.76 | 1.36x slower | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 12.62 | 12.58 | 0.08 ms | 79,211.06 | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.40 | 0.40 | 0.12 ms | 2,500,540.27 | 7.93x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 19,834,717.30 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.56 | 0.54 | 0.25 ms | 1,793,571.17 | 5.93x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.09 | 0.09 | 0.09 ms | 10,628,523.02 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 47.12 | 47.12 | 0.40 ms | 21,223.22 | 6.76x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 500 | 6.97 | 6.89 | 0.10 ms | 143,500.54 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 93.53 | 91.52 | 2.41 ms | 10,691.61 | 7.39x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 500 | 12.65 | 12.50 | 0.14 ms | 79,053.73 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.25 | 0.25 | 0.12 ms | 3,923,203.68 | 6.98x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.01 ms | 27,392,551.01 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.45 | 0.44 | 0.18 ms | 2,213,695.44 | 9.05x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.01 ms | 20,042,168.72 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.05 | 0.04 | 0.15 ms | 19,947,607.61 | 2.68x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 53,371,974.64 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.46 | 0.45 | 0.13 ms | 2,194,200.57 | 6.61x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,498,447.94 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.07 | 1.08 | 0.17 ms | 933,152.28 | 7.35x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.14 | 0.02 ms | 6,860,473.91 | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.55 | 0.54 | 0.14 ms | 1,825,275.50 | 2.27x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 5000 | 0.24 | 0.24 | 0.13 ms | 4,142,698.14 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.83 | 0.83 | 0.25 ms | 1,200,794.01 | 2.61x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.32 | 0.33 | 0.13 ms | 3,129,298.63 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 62.36 | 62.14 | 0.66 ms | 16,035.61 | 5.05x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 500 | 12.35 | 12.27 | 0.15 ms | 80,965.92 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 127.34 | 124.30 | 4.40 ms | 7,853.04 | 5.49x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 500 | 23.19 | 23.16 | 0.14 ms | 43,121.96 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.35 | 0.34 | 0.10 ms | 2,880,807.04 | 1.70x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 5000 | 0.20 | 0.21 | 0.10 ms | 4,884,427.72 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.73 | 0.71 | 0.17 ms | 1,369,087.42 | 2.89x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 5000 | 0.25 | 0.25 | 0.17 ms | 3,953,138.31 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.16 | 0.15 | 0.12 ms | 6,369,555.56 | 1.18x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 5000 | 0.19 | 0.19 | 0.13 ms | 5,399,353.75 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.62 | 0.61 | 0.18 ms | 1,603,463.55 | 2.40x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 5000 | 0.26 | 0.26 | 0.14 ms | 3,853,580.14 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.64 | 1.57 | 1.21 ms | 608,371.19 | 3.07x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 5000 | 0.53 | 0.51 | 0.36 ms | 1,870,637.73 | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.88 | 8.48 | 0.93 ms | 112,574.38 | 4.59x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 1.94 | 1.89 | 0.10 ms | 516,605.31 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.26 | 1.26 | 0.09 ms | 794,231.24 | 5.16x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.24 | 0.24 | 0.11 ms | 4,101,477.95 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 5000 | 0.39 | 0.39 | 0.14 ms | 2,535,550.48 | 8.07x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,461,676.81 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 5000 | 0.52 | 0.51 | 0.16 ms | 1,910,124.72 | 6.28x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 5000 | 0.08 | 0.08 | 0.01 ms | 12,004,956.85 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 500 | 51.33 | 48.75 | 2.86 ms | 19,482.77 | 7.29x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 500 | 7.04 | 7.02 | 0.10 ms | 142,011.40 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 500 | 93.30 | 91.20 | 2.72 ms | 10,718.19 | 7.37x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 500 | 12.65 | 12.59 | 0.10 ms | 79,030.69 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 5000 | 0.27 | 0.23 | 0.33 ms | 3,671,408.57 | 7.67x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 5000 | 0.04 | 0.04 | 0.00 ms | 28,161,557.22 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 5000 | 0.43 | 0.43 | 0.07 ms | 2,312,790.59 | 8.84x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,454,708.16 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 5000 | 0.05 | 0.05 | 0.00 ms | 21,669,939.73 | 2.47x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 5000 | 0.02 | 0.02 | 0.00 ms | 53,556,413.65 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 5000 | 0.44 | 0.44 | 0.04 ms | 2,287,419.13 | 6.33x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 5000 | 0.07 | 0.07 | 0.01 ms | 14,481,388.88 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 5000 | 1.09 | 1.08 | 0.26 ms | 921,042.67 | 7.45x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 5000 | 0.15 | 0.14 | 0.02 ms | 6,865,283.91 | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 44.00 | 44.09 | 0.13 ms | 22,728.26 | 6.24x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 7.05 | 6.98 | 0.13 ms | 141,840.82 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 43.63 | 43.65 | 0.15 ms | 22,918.45 | 6.27x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 6.96 | 6.88 | 0.11 ms | 143,728.50 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 215.00 | 213.88 | 0.81 ms | 4,651.13 | 6.67x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 32.22 | 32.23 | 0.14 ms | 31,031.93 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 1.03 | 1.03 | 0.23 ms | 969,190.83 | 6.99x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.15 | 0.15 | 0.02 ms | 6,774,256.54 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 0.99 | 0.99 | 0.17 ms | 1,006,405.37 | 6.79x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.15 | 0.15 | 0.02 ms | 6,829,289.11 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.33 | 0.33 | 0.01 ms | 3,057,850.79 | 6.77x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,697,677.31 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.33 | 0.33 | 0.01 ms | 3,026,433.55 | 6.84x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.05 | 0.05 | 0.00 ms | 20,695,021.61 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 4.28 | 3.97 | 0.66 ms | 233,571.24 | 2.42x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 10.35 | 10.32 | 0.20 ms | 96,656.98 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 9.00 | 8.82 | 0.52 ms | 111,099.86 | 1.95x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 17.52 | 17.48 | 0.26 ms | 57,085.99 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 4.98 | 5.00 | 0.18 ms | 200,702.68 | 2.53x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 12.61 | 12.53 | 0.35 ms | 79,312.59 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 4.28 | 3.55 | 1.77 ms | 233,421.32 | 1.81x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 7.78 | 7.78 | 0.24 ms | 128,615.81 | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 250 | 4.13 | 4.04 | 0.19 ms | 241,923.27 | 4.20x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 250 | 0.99 | 0.87 | 0.09 ms | 1,015,165.04 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 250 | 11.38 | 10.78 | 0.45 ms | 87,911.12 | 3.31x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 250 | 3.44 | 3.03 | 0.16 ms | 291,011.36 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 250 | 7.20 | 7.15 | 0.31 ms | 138,868.41 | 5.57x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 250 | 1.29 | 1.15 | 0.10 ms | 774,155.89 | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 17.66 | 14.39 | 7.32 ms | 56,615.96 | 2.55x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 6.91 | 6.90 | 0.36 ms | 144,649.77 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 16.09 | 15.93 | 0.57 ms | 62,161.49 | 1.66x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 9.68 | 9.63 | 0.15 ms | 103,345.82 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 14.74 | 14.81 | 0.57 ms | 67,864.40 | 1.81x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.14 | 8.13 | 0.25 ms | 122,806.12 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 15.75 | 15.75 | 0.28 ms | 63,492.90 | 1.84x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.54 | 8.48 | 0.16 ms | 117,081.73 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 17.70 | 17.79 | 0.77 ms | 56,501.88 | 1.99x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 8.91 | 8.77 | 0.36 ms | 112,213.90 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 15.63 | 15.55 | 0.62 ms | 63,966.37 | 1.97x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.95 | 7.91 | 0.35 ms | 125,746.53 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 15.56 | 15.52 | 0.27 ms | 64,285.97 | 1.82x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.56 | 8.55 | 0.18 ms | 116,883.80 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 13.29 | 13.10 | 0.56 ms | 75,230.48 | 1.95x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 6.80 | 6.81 | 0.12 ms | 146,952.34 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 13.21 | 12.91 | 0.64 ms | 75,697.21 | 1.85x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.13 | 7.07 | 0.14 ms | 140,316.62 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 250 | 383.44 | 382.11 | 2.59 ms | 2,608.00 | 1.51x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 250 | 253.62 | 253.16 | 0.46 ms | 3,942.85 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 250 | 1,842.94 | 1,803.29 | 20.70 ms | 542.61 | 1.55x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 250 | 1,188.88 | 1,185.06 | 4.65 ms | 841.13 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 250 | 2,017.90 | 2,014.60 | 19.43 ms | 495.56 | 2.04x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 250 | 990.76 | 991.15 | 0.65 ms | 1,009.33 | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 250 | 3.27 | 3.43 | 0.15 ms | 306,132.21 | 11.16x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 250 | 0.29 | 0.29 | 0.00 ms | 3,415,399.70 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 250 | 2.61 | 2.50 | 0.04 ms | 383,831.26 | 2.41x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 250 | 1.08 | 0.68 | 0.31 ms | 925,086.92 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 250 | 1.06 | 1.02 | 0.02 ms | 942,765.64 | 8.45x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 250 | 0.13 | 0.13 | 0.00 ms | 7,962,892.92 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 250 | 1.06 | 1.03 | 0.02 ms | 941,545.56 | 3.49x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 250 | 0.30 | 0.33 | 0.02 ms | 3,290,372.04 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 250 | 48.98 | 49.16 | 0.28 ms | 20,415.23 | 15.73x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 250 | 3.11 | 3.03 | 0.11 ms | 321,123.99 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 250 | 26.81 | 26.53 | 0.19 ms | 37,303.81 | 16.57x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 250 | 1.62 | 1.47 | 0.10 ms | 618,278.35 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 250 | 25.87 | 25.72 | 0.20 ms | 38,653.54 | 15.54x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 250 | 1.67 | 1.49 | 0.10 ms | 600,570.48 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 250 | 43.70 | 43.31 | 0.63 ms | 22,881.30 | 16.71x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 250 | 2.62 | 2.29 | 0.16 ms | 382,399.89 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 250 | 12.81 | 12.83 | 0.11 ms | 78,052.34 | 4.39x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 250 | 2.92 | 2.82 | 0.07 ms | 342,409.41 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 250 | 22.00 | 21.98 | 0.19 ms | 45,456.87 | 4.79x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 250 | 4.59 | 4.39 | 0.14 ms | 217,734.52 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 250 | 10.29 | 10.02 | 0.57 ms | 97,142.00 | 6.60x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 250 | 1.56 | 1.45 | 0.08 ms | 641,599.58 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 250 | 10.67 | 10.57 | 0.08 ms | 93,759.88 | 4.27x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 250 | 2.50 | 2.36 | 0.09 ms | 399,913.46 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 250 | 15.73 | 15.56 | 0.10 ms | 63,553.52 | 4.35x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 250 | 3.62 | 3.44 | 0.11 ms | 276,158.87 | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 1000 | 19.40 | 19.21 | 0.29 ms | 51,544.23 | 1.70x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 1000 | 33.08 | 33.05 | 0.21 ms | 30,232.66 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 1000 | 23.86 | 23.90 | 0.35 ms | 41,903.39 | 1.57x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 1000 | 37.39 | 37.37 | 0.21 ms | 26,746.70 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 1000 | 20.52 | 20.24 | 1.04 ms | 48,722.59 | 1.66x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 1000 | 34.08 | 34.17 | 0.59 ms | 29,339.56 | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 250 | 24.09 | 24.07 | 0.17 ms | 41,516.49 | 1.45x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 250 | 16.58 | 15.67 | 0.55 ms | 60,309.76 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 250 | 68.24 | 65.62 | 1.29 ms | 14,654.67 | 2.40x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 250 | 28.47 | 28.44 | 0.13 ms | 35,125.05 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 250 | 52.96 | 53.25 | 0.89 ms | 18,883.79 | 1.48x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 250 | 35.80 | 35.64 | 0.16 ms | 27,932.77 | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 250 | 31.34 | 29.77 | 1.68 ms | 31,908.21 | 1.97x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 250 | 15.90 | 16.01 | 0.19 ms | 62,888.39 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 250 | 76.47 | 76.05 | 0.53 ms | 13,077.58 | 2.02x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 250 | 37.83 | 37.80 | 0.21 ms | 26,437.22 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 250 | 52.24 | 52.25 | 0.85 ms | 19,144.21 | 2.17x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 250 | 24.06 | 23.86 | 0.16 ms | 41,561.82 | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 250 | 29.10 | 29.02 | 1.00 ms | 34,362.22 | 1.99x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 250 | 14.64 | 14.61 | 0.16 ms | 68,307.86 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 250 | 72.02 | 68.46 | 2.81 ms | 13,885.99 | 2.14x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 250 | 33.73 | 33.76 | 0.42 ms | 29,649.03 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 250 | 48.00 | 47.30 | 0.51 ms | 20,834.70 | 2.17x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 250 | 22.09 | 22.14 | 0.12 ms | 45,265.89 | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.85 | 0.86 | 0.15 ms | 1,172,145.37 | 3.24x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.26 | 0.25 | 0.12 ms | 3,795,156.43 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.28 | 1.28 | 0.18 ms | 779,934.88 | 4.99x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.26 | 0.25 | 0.11 ms | 3,893,891.84 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.07 | 1.07 | 0.19 ms | 930,409.27 | 1.65x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.65 | 0.64 | 0.11 ms | 1,539,399.03 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.60 | 0.59 | 0.14 ms | 1,662,205.31 | 3.93x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.15 | 0.14 | 0.17 ms | 6,536,704.99 | baseline | Reuses one parsed AST to isolate unparser cost. |

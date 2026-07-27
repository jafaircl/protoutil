# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-07-27T00:15:11.281Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend, planner, and interpreter plus the `cel-go` reference implementation on the same machine. They are intended to provide a quick regression signal for steady-state throughput, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

- Runtime: `node v22.15.0`
- Go: `go1.26.0`
- Platform: `darwin`
- Arch: `arm64`
- Samples per scenario: `8`
- Warmup samples per scenario: `2`
- Base iterations per sample: `250` (scaled by operation cost)

## Results

| Operation | Scenario | Implementation | Iterations | Mean us/op | Median us/op | Std dev | Ops/sec | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 250 | 7.89 | 7.91 | 0.17 ms | 126,724.98 | 5.90x slower | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 250 | 1.34 | 1.25 | 0.06 ms | 747,978.12 | baseline | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 250 | 121.94 | 120.74 | 0.60 ms | 8,201.01 | 14.76x slower | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 250 | 8.26 | 8.35 | 0.13 ms | 121,011.96 | baseline | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 250 | 63.92 | 64.59 | 0.52 ms | 15,643.60 | 18.22x slower | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 250 | 3.51 | 3.16 | 0.19 ms | 284,981.52 | baseline | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 250 | 33.52 | 32.68 | 0.90 ms | 29,829.84 | 7.64x slower | Reuses one parsed AST and checker environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 250 | 4.39 | 4.17 | 0.17 ms | 227,754.77 | baseline | Reuses one parsed AST and checker environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 250 | 15.26 | 15.34 | 0.15 ms | 65,530.35 | 1.23x slower | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | constant regex | `cel-go` | 250 | 12.43 | 12.36 | 0.15 ms | 80,426.66 | baseline | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | macro comprehension | `@protoutil/cel` | 250 | 185.05 | 173.91 | 7.73 ms | 5,403.84 | 6.94x slower | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | macro comprehension | `cel-go` | 250 | 26.66 | 26.93 | 0.40 ms | 37,504.07 | baseline | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | protobuf field selection | `@protoutil/cel` | 250 | 77.73 | 77.58 | 0.16 ms | 12,865.41 | 4.81x slower | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | protobuf field selection | `cel-go` | 250 | 16.18 | 16.23 | 0.13 ms | 61,823.64 | baseline | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 250 | 39.20 | 38.84 | 0.75 ms | 25,508.37 | 2.94x slower | Runs parse plus check through shared parser and checker environment instances. |
| `compile` | scalar arithmetic | `cel-go` | 250 | 13.34 | 13.20 | 0.18 ms | 74,950.46 | baseline | Runs parse plus check through shared parser and checker environment instances. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 1000 | 8.49 | 8.01 | 0.99 ms | 117,772.19 | 4.32x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 1000 | 1.97 | 1.90 | 0.18 ms | 508,807.33 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 5000 | 1.29 | 1.29 | 0.16 ms | 773,915.17 | 5.11x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 5000 | 0.25 | 0.24 | 0.13 ms | 3,952,276.26 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 500 | 53.11 | 53.07 | 0.32 ms | 18,829.23 | 7.55x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 500 | 7.04 | 7.00 | 0.09 ms | 142,107.91 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 500 | 52.24 | 52.32 | 0.09 ms | 19,144.22 | 7.45x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 500 | 7.01 | 6.96 | 0.13 ms | 142,580.68 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 250 | 234.74 | 234.00 | 0.48 ms | 4,260.06 | 7.02x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 250 | 33.42 | 33.11 | 0.33 ms | 29,922.24 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 5000 | 1.94 | 1.92 | 0.19 ms | 515,770.75 | 12.65x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 5000 | 0.15 | 0.15 | 0.02 ms | 6,526,883.66 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 5000 | 1.92 | 1.92 | 0.08 ms | 519,764.59 | 12.49x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 5000 | 0.15 | 0.15 | 0.03 ms | 6,489,865.43 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 5000 | 0.35 | 0.35 | 0.05 ms | 2,877,602.82 | 5.94x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 5000 | 0.06 | 0.06 | 0.01 ms | 17,082,745.40 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 5000 | 0.35 | 0.35 | 0.10 ms | 2,850,999.77 | 5.93x slower | Reuses one planned program and execution frame to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 5000 | 0.06 | 0.06 | 0.01 ms | 16,896,950.99 | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1000 | 7.25 | 7.16 | 0.57 ms | 137,886.06 | 1.47x faster | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1000 | 10.65 | 10.67 | 0.12 ms | 93,893.27 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 1000 | 54.82 | 54.41 | 1.26 ms | 18,243.11 | 3.18x slower | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 1000 | 17.26 | 17.30 | 0.37 ms | 57,923.71 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1000 | 15.15 | 15.12 | 0.13 ms | 65,997.50 | 1.26x slower | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1000 | 12.01 | 12.08 | 0.17 ms | 83,286.59 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 1000 | 7.41 | 6.59 | 1.75 ms | 134,878.24 | 1.15x faster | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 1000 | 8.56 | 8.33 | 0.94 ms | 116,817.38 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 1000 | 1.05 | 0.97 | 0.33 ms | 951,220.12 | 6.49x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 1000 | 6.83 | 6.87 | 0.11 ms | 146,490.97 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 1000 | 2.21 | 2.18 | 0.25 ms | 452,284.03 | 4.34x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1000 | 9.60 | 9.58 | 0.30 ms | 104,133.67 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1000 | 2.26 | 2.11 | 0.41 ms | 442,086.65 | 3.66x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1000 | 8.29 | 8.12 | 0.62 ms | 120,674.88 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 1000 | 2.47 | 2.38 | 0.16 ms | 405,559.57 | 3.49x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1000 | 8.60 | 8.60 | 0.25 ms | 116,339.87 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1000 | 4.38 | 4.23 | 0.60 ms | 228,539.33 | 2.02x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1000 | 8.85 | 8.86 | 0.13 ms | 113,038.52 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 1000 | 1.14 | 1.13 | 0.28 ms | 873,434.06 | 6.83x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1000 | 7.82 | 7.79 | 0.25 ms | 127,955.73 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 1000 | 0.84 | 0.79 | 0.09 ms | 1,197,298.48 | 10.06x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1000 | 8.40 | 8.39 | 0.12 ms | 118,984.03 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 1000 | 1.34 | 1.25 | 0.43 ms | 743,739.25 | 5.10x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1000 | 6.85 | 6.89 | 0.17 ms | 145,884.79 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 1000 | 0.85 | 0.88 | 0.15 ms | 1,179,998.78 | 8.56x faster | Reuses one checked AST and interpreter to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1000 | 7.25 | 7.31 | 0.25 ms | 137,838.55 | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `unparse` | constant regex | `@protoutil/cel` | 5000 | 0.85 | 0.86 | 0.12 ms | 1,170,531.83 | 3.06x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 5000 | 0.28 | 0.27 | 0.12 ms | 3,583,560.20 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5000 | 1.33 | 1.35 | 0.24 ms | 749,432.63 | 5.05x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 5000 | 0.26 | 0.25 | 0.14 ms | 3,783,027.84 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 5000 | 1.08 | 1.07 | 0.14 ms | 927,778.26 | 1.66x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 5000 | 0.65 | 0.64 | 0.12 ms | 1,538,718.03 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5000 | 0.62 | 0.59 | 0.22 ms | 1,617,305.30 | 4.18x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 5000 | 0.15 | 0.14 | 0.11 ms | 6,762,037.31 | baseline | Reuses one parsed AST to isolate unparser cost. |

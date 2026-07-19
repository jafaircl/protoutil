# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-07-18T12:04:35.707Z`

## Methodology

These are in-process microbenchmarks for the handwritten CEL frontend, unparser, and checker plus the `cel-go` reference implementation on the same machine. They are intended to give us a quick regression signal for steady-state throughput, not a universal cross-machine claim.

- Runtime: `node v22.15.0`
- Go: `go1.26.0`
- Platform: `darwin`
- Arch: `arm64`
- Samples per scenario: `8`
- Warmup samples per scenario: `2`
- Iterations per sample: `5000`

## Results

| Operation | Scenario | Implementation | Mean us/op | Ops/sec | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `check` | macro comprehension | `protoutil-ts` | 12.41 | 80,602.76 | 1.58x slower | Reuses one parsed AST to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 7.87 | 126,986.14 | baseline | Reuses one parsed AST to isolate checker cost. |
| `check` | scalar arithmetic | `protoutil-ts` | 5.52 | 181,039.92 | 1.39x slower | Reuses one parsed AST to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 3.96 | 252,251.34 | baseline | Reuses one parsed AST to isolate checker cost. |
| `compile` | macro comprehension | `protoutil-ts` | 17.77 | 56,290.05 | 1.45x faster | Runs parse plus check through a shared env instance. |
| `compile` | macro comprehension | `cel-go` | 25.83 | 38,720.67 | baseline | Runs parse plus check through a shared env instance. |
| `compile` | scalar arithmetic | `protoutil-ts` | 7.81 | 128,092.16 | 1.58x faster | Runs parse plus check through a shared env instance. |
| `compile` | scalar arithmetic | `cel-go` | 12.31 | 81,230.81 | baseline | Runs parse plus check through a shared env instance. |
| `parse` | macro comprehension | `protoutil-ts` | 4.32 | 231,473.17 | 3.99x faster | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 17.22 | 58,056.25 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `protoutil-ts` | 1.69 | 592,484.33 | 4.40x faster | Reuses one parser instance to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 7.43 | 134,552.38 | baseline | Reuses one parser instance to isolate steady-state parse throughput. |
| `unparse` | macro comprehension | `protoutil-ts` | 0.35 | 2,850,686.26 | 1.50x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 0.23 | 4,282,196.77 | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `protoutil-ts` | 0.15 | 6,667,315.62 | 1.16x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 0.13 | 7,750,435.96 | baseline | Reuses one parsed AST to isolate unparser cost. |

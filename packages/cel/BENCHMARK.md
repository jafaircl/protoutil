# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-16T19:48:40.274Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the `cel-go` reference implementation on the same machine. This package is measured through its **built output** in `dist`, the code published to consumers, rather than through its TypeScript sources: the test-time transform wraps every function in a name helper the shipped bundle does not carry, which understated evaluation throughput by roughly 1.8x. The benchmark script builds the package before running, so results always reflect the current sources. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. Each policy program primes every prepared activation in round-robin order before policy evaluation samples begin. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

### Reading these numbers

- **Ratios come from median per-operation latency**, not the mean. Eight samples are few enough that one garbage-collection or tier-up outlier moves a mean substantially while leaving the median intact.
- **`Spread`** is the coefficient of variation across a row's own samples. Rows above 10.0% are marked ⚠ and their ratios should not be read to two decimals.
- **Repeated runs of unmodified code differ by roughly 3% per row**, and occasionally more. Treat a change smaller than that as noise, and confirm any real change by re-running both sides.
- **Every scenario shares one process per implementation.** This makes call sites in the interpreter as polymorphic as they are in an application that uses many CEL features, which is deliberate: an optimization measured against a single expression in isolation can behave differently here, and this is the workload that decides.
- **The whole matrix moves together when the machine is busy.** Compare the `cel-go` columns across runs first; if they moved, the machine did, not the code.

- Runtime: `node v22.15.0`
- Go: `go1.26.0`
- cel-go: `codelab/v0.31.0-6-gef24047 (local working copy)`
- Platform: `darwin`
- Arch: `arm64`
- Samples per scenario: `8`
- Warmup samples per scenario: `2` (extended to `20000` operations or `300`ms, whichever comes first)
- Target sample duration: `15`ms (iteration count calibrated per scenario)

## Diagnostic operations

- `eval` measures value-only execution.
- `eval-details` measures the public details-returning path without state observers.
- `eval-state` enables expression-state observation.
- `partial-eval` evaluates with explicit unknown attribute patterns and state tracking.
- `residual` reuses captured state to isolate pruning, rendering, parsing, and checking.
- `residual-roundtrip` combines partial evaluation and residual construction.

## Slowest paths

The widest cel-go gaps, worst first. These are where optimization work pays off.

| Rank | Operation | Scenario | `@protoutil/cel` us/op | `cel-go` us/op | Slower by | Cost per op |
| ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | `eval` | macro comprehension / runtime cost | 195.07 | 33.35 | 5.85x | +161.72 us |
| 2 | `policy-eval` | nested_rule7 / valid / x=1 | 1.19 | 0.206 | 5.79x | +0.987 us |
| 3 | `policy-eval` | nested_rule7 / valid / x=2 | 1.21 | 0.249 | 4.87x | +0.963 us |
| 4 | `eval-details` | diagnostic / list index | 0.239 | 0.0492 | 4.86x ⚠ | +0.190 us |
| 5 | `eval` | constant regex / compiled regex | 1.04 | 0.235 | 4.44x | +0.809 us |
| 6 | `eval` | diagnostic / list index | 0.215 | 0.0491 | 4.37x | +0.166 us |
| 7 | `unparse` | macro comprehension | 1.09 | 0.261 | 4.15x | +0.824 us |
| 8 | `policy-eval` | nested_rule7 / valid / x=4 | 0.497 | 0.121 | 4.12x | +0.377 us |
| 9 | `policy-eval` | nested_rule7 / valid / x=3 | 0.498 | 0.121 | 4.10x | +0.377 us |
| 10 | `eval-details` | diagnostic / protobuf field | 0.602 | 0.148 | 4.08x | +0.455 us |
| 11 | `unparse` | scalar arithmetic | 0.608 | 0.149 | 4.07x ⚠ | +0.459 us |
| 12 | `eval` | diagnostic / protobuf field | 0.598 | 0.149 | 4.03x | +0.450 us |
| 13 | `eval` | protobuf field selection / baseline | 0.567 | 0.147 | 3.85x | +0.420 us |
| 14 | `eval` | protobuf field selection / optimized | 0.557 | 0.147 | 3.78x | +0.409 us |
| 15 | `eval` | constant regex / baseline | 7.49 | 2.10 | 3.57x | +5.39 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `unparse` | 4 | 3.39x slower | protobuf field selection (1.36x slower) | macro comprehension (4.15x slower) |
| `policy-eval` | 13 | 2.89x slower | unnest / divisible by 2 / empty-set (2.48x slower) | nested_rule7 / valid / x=1 (5.79x slower) |
| `eval-details` | 9 | 2.89x slower | diagnostic / literal (2.44x slower) | diagnostic / list index (4.86x slower) |
| `eval` | 18 | 2.82x slower | diagnostic / literal (1.18x slower) | macro comprehension / runtime cost (5.85x slower) |
| `plan` | 9 | 1.71x slower | constant regex / compiled regex (1.08x faster) | macro comprehension / runtime cost (3.45x slower) |
| `check` | 4 | 1.67x slower | protobuf field selection (1.52x slower) | macro comprehension (1.87x slower) |
| `policy-plan` | 3 | 1.55x slower | unnest (1.19x slower) | nested_rule7 (2.73x slower) |
| `partial-eval` | 3 | 1.50x slower | known branch pruning (1.04x slower) | macro pruning (1.60x slower) |
| `eval-state` | 9 | 1.30x slower | diagnostic / literal (1.45x faster) | diagnostic / fold full scan (2.59x slower) |
| `policy-compile` | 3 | 1.25x slower | nested_rule7 (1.07x faster) | unnest (1.63x slower) |
| `residual-roundtrip` | 3 | 1.15x faster | qualified attribute pruning (1.17x faster) | macro pruning (1.07x slower) |
| `residual` | 3 | 1.24x faster | qualified attribute pruning (1.28x faster) | macro pruning (1.02x slower) |
| `compile` | 4 | 1.53x faster | constant regex (2.00x faster) | macro comprehension (1.06x faster) |
| `policy-parse` | 3 | 1.66x faster | unnest (1.79x faster) | nested_rule7 (1.66x faster) |
| `parse` | 4 | 3.32x faster | constant regex (3.59x faster) | macro comprehension (2.23x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 3283 | 2.68 | 2.68 | 0.0327 | 1.2% | 1.82x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 9011 | 1.48 | 1.47 | 0.0213 | 1.4% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 468 | 17.26 | 17.22 | 0.564 | 3.3% | 1.87x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 1512 | 9.24 | 9.22 | 0.154 | 1.7% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 937 | 5.71 | 5.74 | 0.170 | 3.0% | 1.52x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 3074 | 3.77 | 3.75 | 0.0726 | 1.9% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 384 | 6.53 | 6.74 | 0.960 | 14.2% ⚠ | 1.55x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 3647 | 4.22 | 4.22 | 0.0981 | 2.3% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 2407 | 6.47 | 6.43 | 0.135 | 2.1% | 2.00x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 1021 | 12.92 | 12.85 | 0.278 | 2.2% | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 372 | 26.39 | 26.23 | 0.543 | 2.1% | 1.06x faster | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 561 | 28.08 | 28.27 | 0.984 | 3.5% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 1391 | 10.97 | 10.98 | 0.145 | 1.3% | 1.57x faster | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 829 | 17.20 | 17.18 | 0.422 | 2.5% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1488 | 8.69 | 8.73 | 0.469 | 5.4% | 1.49x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 941 | 12.95 | 12.99 | 0.293 | 2.3% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 103820 | 0.148 | 0.148 | 0.0013 | 0.9% | 3.00x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 297887 | 0.0492 | 0.0493 | 0.0005 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 66130 | 0.236 | 0.236 | 0.0033 | 1.4% | 2.67x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 165087 | 0.0883 | 0.0885 | 0.0010 | 1.1% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 764 | 17.52 | 17.55 | 0.176 | 1.0% | 2.69x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2399 | 6.51 | 6.52 | 0.0803 | 1.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 452 | 33.16 | 33.11 | 0.315 | 1.0% | 2.76x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1283 | 12.00 | 11.96 | 0.175 | 1.5% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 138242 | 0.105 | 0.106 | 0.0013 | 1.2% | 2.90x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 416373 | 0.0363 | 0.0364 | 0.0003 | 0.9% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 62416 | 0.239 | 0.293 | 0.119 | 40.7% ⚠ | 4.86x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 300471 | 0.0492 | 0.0492 | 0.0001 | 0.3% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 225589 | 0.0472 | 0.0471 | 0.0007 | 1.6% | 2.44x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 787167 | 0.0193 | 0.0193 | 0.0001 | 0.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 78339 | 0.205 | 0.205 | 0.0019 | 0.9% | 2.89x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 202188 | 0.0710 | 0.0713 | 0.0016 | 2.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 25830 | 0.602 | 0.602 | 0.0071 | 1.2% | 4.08x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 100138 | 0.148 | 0.148 | 0.0008 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 29549 | 0.306 | 0.307 | 0.0062 | 2.0% | 1.24x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 51490 | 0.246 | 0.247 | 0.0042 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 24781 | 0.423 | 0.422 | 0.0062 | 1.5% | 1.30x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 41638 | 0.325 | 0.323 | 0.0051 | 1.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 219 | 31.09 | 31.19 | 0.349 | 1.1% | 2.51x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1100 | 12.41 | 12.39 | 0.140 | 1.1% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 257 | 58.89 | 58.78 | 0.673 | 1.1% | 2.59x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 663 | 22.74 | 22.69 | 0.423 | 1.9% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 35929 | 0.200 | 0.200 | 0.0022 | 1.1% | 1.09x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 67840 | 0.218 | 0.218 | 0.0047 | 2.2% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 27097 | 0.444 | 0.443 | 0.0041 | 0.9% | 1.64x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 53166 | 0.271 | 0.272 | 0.0038 | 1.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 21340 | 0.132 | 0.131 | 0.0061 | 4.6% | 1.45x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 75721 | 0.191 | 0.190 | 0.0028 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 45491 | 0.348 | 0.348 | 0.0038 | 1.1% | 1.27x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 60614 | 0.274 | 0.275 | 0.0032 | 1.2% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 11869 | 1.07 | 1.07 | 0.0109 | 1.0% | 2.21x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 28204 | 0.484 | 0.492 | 0.0172 | 3.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 175 | 7.49 | 7.56 | 0.654 | 8.7% | 3.57x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 6928 | 2.10 | 2.09 | 0.0427 | 2.0% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 9182 | 1.04 | 1.04 | 0.0247 | 2.4% | 4.44x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 61712 | 0.235 | 0.236 | 0.0045 | 1.9% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 87928 | 0.141 | 0.141 | 0.0026 | 1.8% | 2.88x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 314405 | 0.0490 | 0.0491 | 0.0004 | 0.8% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 21609 | 0.232 | 0.233 | 0.0090 | 3.8% | 2.60x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 180529 | 0.0893 | 0.0889 | 0.0008 | 0.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 546 | 17.64 | 17.61 | 0.153 | 0.9% | 2.70x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2404 | 6.52 | 6.53 | 0.109 | 1.7% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 449 | 33.38 | 33.34 | 0.324 | 1.0% | 2.78x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1310 | 12.02 | 12.06 | 0.196 | 1.6% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 51730 | 0.103 | 0.103 | 0.0026 | 2.5% | 2.86x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 427726 | 0.0359 | 0.0359 | 0.0002 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 27504 | 0.215 | 0.216 | 0.0061 | 2.8% | 4.37x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 308873 | 0.0491 | 0.0492 | 0.0004 | 0.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 215123 | 0.0228 | 0.0228 | 0.0005 | 2.2% | 1.18x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 792747 | 0.0193 | 0.0193 | 0.0002 | 0.8% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 35960 | 0.191 | 0.192 | 0.0055 | 2.8% | 2.67x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 208935 | 0.0714 | 0.0716 | 0.0012 | 1.7% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 11015 | 0.598 | 0.601 | 0.0198 | 3.3% | 4.03x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 101030 | 0.149 | 0.148 | 0.0012 | 0.8% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 143 | 16.49 | 16.58 | 0.419 | 2.5% | 2.50x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 2372 | 6.59 | 8.39 | 3.41 | 40.6% ⚠ | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 654 | 16.53 | 16.53 | 0.0855 | 0.5% | 2.50x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2225 | 6.60 | 6.61 | 0.111 | 1.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 10 | 195.07 | 206.47 | 19.41 | 9.4% | 5.85x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 383 | 33.35 | 33.56 | 1.22 | 3.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4459 | 0.567 | 0.568 | 0.0229 | 4.0% | 3.85x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 100459 | 0.147 | 0.147 | 0.0004 | 0.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 28380 | 0.557 | 0.556 | 0.0050 | 0.9% | 3.78x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 103904 | 0.147 | 0.148 | 0.0006 | 0.4% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 16041 | 0.125 | 0.130 | 0.0134 | 10.3% ⚠ | 2.52x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 296476 | 0.0494 | 0.0494 | 0.0004 | 0.8% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 124720 | 0.120 | 0.119 | 0.0018 | 1.5% | 2.44x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 306009 | 0.0491 | 0.0490 | 0.0002 | 0.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 2068 | 3.02 | 3.00 | 0.0692 | 2.3% | 3.59x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1404 | 10.83 | 10.83 | 0.169 | 1.6% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 749 | 7.98 | 8.00 | 0.232 | 2.9% | 2.23x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 955 | 17.78 | 17.93 | 0.481 | 2.7% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 2065 | 4.07 | 4.07 | 0.0568 | 1.4% | 3.11x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1274 | 12.66 | 12.69 | 0.243 | 1.9% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 914 | 2.35 | 2.35 | 0.457 | 19.5% ⚠ | 3.54x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 883 | 8.30 | 8.38 | 0.522 | 6.2% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3921 | 1.10 | 1.09 | 0.0427 | 3.9% | 1.04x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 14375 | 1.06 | 1.06 | 0.0188 | 1.8% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 845 | 5.21 | 5.34 | 0.253 | 4.7% | 1.60x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 3417 | 3.25 | 3.25 | 0.0552 | 1.7% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 2970 | 1.94 | 2.05 | 0.292 | 14.3% ⚠ | 1.50x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 10000 | 1.30 | 1.30 | 0.0183 | 1.4% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 8154 | 0.942 | 0.944 | 0.0160 | 1.7% | 1.75x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 27246 | 0.537 | 0.535 | 0.0118 | 2.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 2899 | 2.72 | 2.74 | 0.0631 | 2.3% | 1.08x faster | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 4820 | 2.95 | 2.94 | 0.0817 | 2.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 2115 | 2.03 | 2.02 | 0.0412 | 2.0% | 1.34x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 10055 | 1.52 | 1.52 | 0.0297 | 2.0% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 2979 | 3.25 | 3.23 | 0.0518 | 1.6% | 1.83x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 2911 | 1.77 | 1.78 | 0.126 | 7.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 939 | 7.45 | 7.72 | 1.17 | 15.2% ⚠ | 3.45x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 6111 | 2.16 | 2.17 | 0.0500 | 2.3% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 4889 | 1.27 | 1.27 | 0.0219 | 1.7% | 1.29x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 14166 | 0.986 | 0.986 | 0.0317 | 3.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 6303 | 1.88 | 1.88 | 0.0436 | 2.3% | 1.71x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 10323 | 1.10 | 1.11 | 0.0239 | 2.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 11 | 0.667 | 0.667 | 0.0076 | 1.1% | 1.29x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 33960 | 0.518 | 0.518 | 0.0128 | 2.5% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 4346 | 1.17 | 1.18 | 0.0305 | 2.6% | 1.84x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 26186 | 0.636 | 0.639 | 0.0183 | 2.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 52 | 224.92 | 239.62 | 26.36 | 11.0% ⚠ | 1.07x faster | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 57 | 240.22 | 241.24 | 5.41 | 2.2% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 9 | 1,287.48 | 1,306.51 | 74.37 | 5.7% | 1.25x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 11 | 1,026.02 | 1,041.66 | 30.32 | 2.9% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 5 | 1,504.47 | 1,482.17 | 160.49 | 10.8% ⚠ | 1.63x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 12 | 921.64 | 917.69 | 16.26 | 1.8% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 12327 | 1.19 | 1.19 | 0.0779 | 6.6% | 5.79x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 74019 | 0.206 | 0.206 | 0.0021 | 1.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 12622 | 1.21 | 1.22 | 0.0368 | 3.0% | 4.87x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 60430 | 0.249 | 0.248 | 0.0046 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 29660 | 0.498 | 0.497 | 0.0055 | 1.1% | 4.10x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 128120 | 0.121 | 0.121 | 0.0023 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 29290 | 0.497 | 0.500 | 0.0105 | 2.1% | 4.12x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 126961 | 0.121 | 0.120 | 0.0019 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 1944 | 8.05 | 8.13 | 0.168 | 2.1% | 2.76x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 5451 | 2.91 | 2.94 | 0.0547 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 3624 | 4.26 | 4.24 | 0.0631 | 1.5% | 2.62x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 9935 | 1.62 | 1.62 | 0.0317 | 2.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 3568 | 4.23 | 4.24 | 0.0738 | 1.7% | 2.62x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 10762 | 1.61 | 1.62 | 0.0177 | 1.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 2399 | 6.73 | 6.71 | 0.111 | 1.7% | 2.89x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 7279 | 2.33 | 2.34 | 0.0424 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 2115 | 7.38 | 7.56 | 0.658 | 8.7% | 2.48x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 5061 | 2.97 | 2.96 | 0.0649 | 2.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 1035 | 13.14 | 13.21 | 0.422 | 3.2% | 2.97x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3790 | 4.42 | 4.42 | 0.0842 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 3377 | 4.10 | 4.10 | 0.0605 | 1.5% | 2.99x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 12501 | 1.37 | 1.37 | 0.0105 | 0.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 2306 | 6.51 | 6.47 | 0.110 | 1.7% | 2.66x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 5317 | 2.45 | 2.44 | 0.0471 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1686 | 9.46 | 9.48 | 0.243 | 2.6% | 2.49x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 3085 | 3.79 | 3.84 | 0.0938 | 2.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 533 | 21.33 | 21.24 | 0.578 | 2.7% | 1.66x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 419 | 35.42 | 35.27 | 0.659 | 1.9% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 232 | 23.88 | 23.79 | 0.557 | 2.3% | 1.66x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 372 | 39.70 | 39.73 | 0.752 | 1.9% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 125 | 19.57 | 19.89 | 1.26 | 6.3% | 1.79x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 422 | 35.12 | 35.13 | 0.571 | 1.6% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 1258 | 10.41 | 10.57 | 0.479 | 4.5% | 2.73x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 3843 | 3.81 | 3.81 | 0.0797 | 2.1% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 392 | 25.96 | 26.01 | 0.577 | 2.2% | 1.55x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 794 | 16.78 | 16.81 | 0.409 | 2.4% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 161 | 33.97 | 33.96 | 1.38 | 4.1% | 1.19x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 496 | 28.50 | 28.63 | 0.430 | 1.5% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 1076 | 13.99 | 13.94 | 0.406 | 2.9% | 1.15x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 821 | 16.13 | 16.13 | 0.460 | 2.9% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 400 | 39.41 | 39.61 | 0.945 | 2.4% | 1.07x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 417 | 36.86 | 36.99 | 1.17 | 3.2% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 796 | 20.12 | 20.31 | 0.391 | 1.9% | 1.17x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 779 | 23.57 | 23.52 | 0.471 | 2.0% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 597 | 11.72 | 11.88 | 0.475 | 4.0% | 1.24x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 761 | 14.49 | 14.53 | 0.231 | 1.6% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 286 | 33.79 | 33.59 | 0.778 | 2.3% | 1.02x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 544 | 33.25 | 33.14 | 0.680 | 2.1% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 548 | 16.58 | 16.66 | 0.375 | 2.3% | 1.28x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 793 | 21.26 | 21.32 | 0.438 | 2.1% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 9264 | 0.791 | 0.790 | 0.0172 | 2.2% | 2.91x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 61076 | 0.272 | 0.274 | 0.0058 | 2.1% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5802 | 1.09 | 1.09 | 0.0280 | 2.6% | 4.15x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 55791 | 0.261 | 0.261 | 0.0030 | 1.1% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 9411 | 0.895 | 0.904 | 0.0539 | 6.0% | 1.36x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 23386 | 0.656 | 0.658 | 0.0063 | 1.0% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 4397 | 0.608 | 0.648 | 0.142 | 22.0% ⚠ | 4.07x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 94505 | 0.149 | 0.150 | 0.0034 | 2.3% | baseline | Reuses one parsed AST to isolate unparser cost. |

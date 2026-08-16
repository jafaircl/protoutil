# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-16T19:58:40.522Z`

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
| 1 | `policy-eval` | nested_rule7 / valid / x=1 | 1.02 | 0.208 | 4.87x | +0.807 us |
| 2 | `policy-eval` | nested_rule7 / valid / x=2 | 1.15 | 0.246 | 4.67x | +0.903 us |
| 3 | `eval-details` | diagnostic / list index | 0.228 | 0.0490 | 4.65x | +0.179 us |
| 4 | `eval` | constant regex / compiled regex | 1.05 | 0.239 | 4.40x | +0.815 us |
| 5 | `eval` | diagnostic / list index | 0.221 | 0.0514 | 4.31x | +0.170 us |
| 6 | `eval-details` | diagnostic / protobuf field | 0.611 | 0.146 | 4.19x | +0.465 us |
| 7 | `policy-eval` | nested_rule7 / valid / x=3 | 0.485 | 0.119 | 4.09x | +0.367 us |
| 8 | `policy-eval` | nested_rule7 / valid / x=4 | 0.488 | 0.119 | 4.09x | +0.368 us |
| 9 | `unparse` | macro comprehension | 1.06 | 0.261 | 4.06x | +0.798 us |
| 10 | `eval` | diagnostic / protobuf field | 0.602 | 0.149 | 4.04x | +0.453 us |
| 11 | `eval` | protobuf field selection / baseline | 0.572 | 0.146 | 3.92x | +0.426 us |
| 12 | `eval` | protobuf field selection / optimized | 0.571 | 0.147 | 3.89x | +0.424 us |
| 13 | `eval` | constant regex / baseline | 7.50 | 2.04 | 3.67x | +5.46 us |
| 14 | `unparse` | scalar arithmetic | 0.524 | 0.146 | 3.58x | +0.378 us |
| 15 | `eval-details` | diagnostic / binary call | 0.154 | 0.0488 | 3.16x | +0.105 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `unparse` | 4 | 3.13x slower | protobuf field selection (1.33x slower) | macro comprehension (4.06x slower) |
| `eval-details` | 9 | 2.91x slower | diagnostic / literal (2.49x slower) | diagnostic / list index (4.65x slower) |
| `eval` | 18 | 2.86x slower | diagnostic / literal (1.08x slower) | constant regex / compiled regex (4.40x slower) |
| `policy-eval` | 13 | 2.68x slower | unnest / divisible by 2 / empty-set (2.28x slower) | nested_rule7 / valid / x=1 (4.87x slower) |
| `plan` | 9 | 1.71x slower | constant regex / compiled regex (1.05x faster) | macro comprehension / runtime cost (2.52x slower) |
| `check` | 4 | 1.64x slower | scalar arithmetic (1.40x slower) | macro comprehension (1.89x slower) |
| `policy-plan` | 3 | 1.58x slower | unnest (1.19x slower) | nested_rule7 (2.46x slower) |
| `partial-eval` | 3 | 1.41x slower | known branch pruning (1.07x slower) | macro pruning (1.66x slower) |
| `eval-state` | 9 | 1.34x slower | diagnostic / literal (1.38x faster) | diagnostic / fold full scan (2.67x slower) |
| `policy-compile` | 3 | 1.26x slower | nested_rule7 (1.10x faster) | unnest (1.47x slower) |
| `residual-roundtrip` | 3 | 1.14x faster | qualified attribute pruning (1.15x faster) | macro pruning (1.08x slower) |
| `residual` | 3 | 1.26x faster | known branch pruning (1.26x faster) | macro pruning (1.01x faster) |
| `compile` | 4 | 1.58x faster | constant regex (1.94x faster) | macro comprehension (1.07x faster) |
| `policy-parse` | 3 | 1.76x faster | unnest (1.76x faster) | required_labels (1.62x faster) |
| `parse` | 4 | 3.21x faster | scalar arithmetic (4.34x faster) | macro comprehension (2.31x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 3840 | 2.62 | 2.63 | 0.0506 | 1.9% | 1.81x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 9629 | 1.45 | 1.45 | 0.0201 | 1.4% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 515 | 17.04 | 17.06 | 0.178 | 1.0% | 1.89x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 1592 | 9.00 | 8.96 | 0.159 | 1.8% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 1137 | 5.65 | 5.69 | 0.196 | 3.4% | 1.50x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 3917 | 3.76 | 3.77 | 0.0606 | 1.6% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 428 | 5.92 | 5.91 | 0.300 | 5.1% | 1.40x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 2843 | 4.23 | 4.27 | 0.114 | 2.7% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 1852 | 6.51 | 6.52 | 0.0948 | 1.5% | 1.94x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 1203 | 12.61 | 12.62 | 0.221 | 1.7% | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 377 | 26.03 | 26.17 | 0.398 | 1.5% | 1.07x faster | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 517 | 27.72 | 27.84 | 0.378 | 1.4% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 1323 | 11.33 | 11.31 | 0.311 | 2.7% | 1.52x faster | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 820 | 17.22 | 17.22 | 0.207 | 1.2% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1800 | 8.16 | 8.24 | 0.201 | 2.4% | 1.63x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 1181 | 13.33 | 13.40 | 0.337 | 2.5% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 94611 | 0.154 | 0.154 | 0.0013 | 0.9% | 3.16x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 297936 | 0.0488 | 0.0487 | 0.0003 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 61205 | 0.242 | 0.242 | 0.0032 | 1.3% | 2.75x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 180662 | 0.0881 | 0.0881 | 0.0006 | 0.7% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 682 | 18.13 | 18.24 | 0.298 | 1.6% | 2.79x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2219 | 6.50 | 6.49 | 0.0854 | 1.3% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 439 | 34.46 | 34.49 | 0.242 | 0.7% | 2.91x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1300 | 11.84 | 11.86 | 0.119 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 127351 | 0.113 | 0.113 | 0.0013 | 1.2% | 3.15x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 416682 | 0.0358 | 0.0358 | 0.0002 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 53564 | 0.228 | 0.228 | 0.0031 | 1.3% | 4.65x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 310107 | 0.0490 | 0.0490 | 0.0003 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 290532 | 0.0481 | 0.0481 | 0.0006 | 1.2% | 2.49x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 732997 | 0.0193 | 0.0192 | 0.0001 | 0.8% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 73738 | 0.201 | 0.201 | 0.0021 | 1.1% | 2.84x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 211021 | 0.0709 | 0.0707 | 0.0010 | 1.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 24102 | 0.611 | 0.613 | 0.0076 | 1.2% | 4.19x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 98299 | 0.146 | 0.146 | 0.0009 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 30796 | 0.308 | 0.309 | 0.0071 | 2.3% | 1.27x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 47790 | 0.243 | 0.243 | 0.0019 | 0.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 23041 | 0.427 | 0.427 | 0.0035 | 0.8% | 1.34x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 52888 | 0.320 | 0.323 | 0.0077 | 2.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 212 | 31.25 | 31.17 | 0.271 | 0.9% | 2.58x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1220 | 12.10 | 12.14 | 0.125 | 1.0% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 259 | 59.66 | 59.81 | 0.712 | 1.2% | 2.67x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 686 | 22.38 | 22.52 | 0.409 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 33195 | 0.212 | 0.212 | 0.0046 | 2.2% | 1.02x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 53500 | 0.207 | 0.207 | 0.0035 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 27068 | 0.453 | 0.453 | 0.0053 | 1.2% | 1.73x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 48616 | 0.262 | 0.262 | 0.0043 | 1.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 22002 | 0.135 | 0.137 | 0.0055 | 4.0% | 1.38x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 72152 | 0.187 | 0.188 | 0.0038 | 2.0% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 44427 | 0.357 | 0.357 | 0.0044 | 1.2% | 1.34x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 55711 | 0.266 | 0.266 | 0.0047 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 11836 | 1.11 | 1.10 | 0.0159 | 1.4% | 2.26x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 27009 | 0.491 | 0.490 | 0.0075 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 226 | 7.50 | 7.51 | 0.576 | 7.7% | 3.67x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 7887 | 2.04 | 2.04 | 0.0395 | 1.9% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 9449 | 1.05 | 1.06 | 0.0167 | 1.6% | 4.40x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 48202 | 0.239 | 0.242 | 0.0062 | 2.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 103393 | 0.150 | 0.151 | 0.0015 | 1.0% | 3.07x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 311458 | 0.0490 | 0.0491 | 0.0003 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 22048 | 0.232 | 0.233 | 0.0057 | 2.5% | 2.65x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 148544 | 0.0876 | 0.0876 | 0.0009 | 1.1% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 514 | 18.21 | 18.17 | 0.203 | 1.1% | 2.81x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2343 | 6.49 | 6.48 | 0.121 | 1.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 436 | 34.60 | 34.56 | 0.241 | 0.7% | 2.91x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1322 | 11.90 | 11.93 | 0.183 | 1.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 49430 | 0.108 | 0.109 | 0.0031 | 2.9% | 3.05x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 422162 | 0.0356 | 0.0356 | 0.0003 | 0.7% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 25568 | 0.221 | 0.224 | 0.0079 | 3.5% | 4.31x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 291923 | 0.0514 | 0.0512 | 0.0008 | 1.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 230959 | 0.0207 | 0.0207 | 0.0010 | 4.7% | 1.08x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 802400 | 0.0192 | 0.0192 | 0.0001 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 30213 | 0.196 | 0.197 | 0.0054 | 2.7% | 2.79x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 225615 | 0.0703 | 0.0705 | 0.0009 | 1.3% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 11533 | 0.602 | 0.605 | 0.0196 | 3.2% | 4.04x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 100426 | 0.149 | 0.149 | 0.0025 | 1.7% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 146 | 17.06 | 17.31 | 0.621 | 3.6% | 2.63x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 2275 | 6.49 | 6.51 | 0.130 | 2.0% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 684 | 17.43 | 17.42 | 0.249 | 1.4% | 2.67x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2272 | 6.54 | 6.51 | 0.0878 | 1.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 34 | 92.70 | 94.33 | 2.83 | 3.0% | 2.79x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 465 | 33.26 | 33.39 | 0.712 | 2.1% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4990 | 0.572 | 0.576 | 0.0222 | 3.8% | 3.92x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 99035 | 0.146 | 0.146 | 0.0010 | 0.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 25217 | 0.571 | 0.572 | 0.0066 | 1.2% | 3.89x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 105249 | 0.147 | 0.146 | 0.0009 | 0.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 18252 | 0.128 | 0.127 | 0.0055 | 4.3% | 2.62x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 316650 | 0.0488 | 0.0487 | 0.0004 | 0.8% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 121186 | 0.124 | 0.124 | 0.0006 | 0.5% | 2.54x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 313999 | 0.0488 | 0.0492 | 0.0012 | 2.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1986 | 3.22 | 3.21 | 0.0584 | 1.8% | 3.39x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1426 | 10.90 | 10.88 | 0.0836 | 0.8% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 763 | 7.98 | 7.90 | 0.262 | 3.3% | 2.31x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 698 | 18.40 | 18.39 | 0.626 | 3.4% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1866 | 4.16 | 4.15 | 0.102 | 2.5% | 3.03x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1149 | 12.62 | 12.55 | 0.202 | 1.6% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 934 | 1.86 | 1.98 | 0.164 | 8.3% | 4.34x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 792 | 8.09 | 8.16 | 0.208 | 2.5% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3615 | 1.13 | 1.13 | 0.0414 | 3.7% | 1.07x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 14405 | 1.05 | 1.05 | 0.0195 | 1.8% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 847 | 5.34 | 5.34 | 0.176 | 3.3% | 1.66x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 4204 | 3.22 | 3.21 | 0.0600 | 1.9% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 3204 | 1.83 | 1.85 | 0.0453 | 2.4% | 1.41x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 9941 | 1.30 | 1.30 | 0.0291 | 2.2% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 6507 | 0.940 | 0.948 | 0.0269 | 2.8% | 1.88x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 28448 | 0.500 | 0.498 | 0.0092 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 3406 | 2.70 | 2.72 | 0.0834 | 3.1% | 1.05x faster | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 5461 | 2.83 | 2.84 | 0.0351 | 1.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 2094 | 2.01 | 2.01 | 0.0664 | 3.3% | 1.37x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 10070 | 1.47 | 1.47 | 0.0348 | 2.4% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 3601 | 3.22 | 3.23 | 0.0518 | 1.6% | 1.89x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 8702 | 1.71 | 1.70 | 0.0115 | 0.7% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1443 | 5.37 | 5.41 | 0.264 | 4.9% | 2.52x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 6864 | 2.14 | 2.13 | 0.0456 | 2.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 4610 | 1.37 | 1.35 | 0.0320 | 2.4% | 1.45x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 13322 | 0.939 | 0.951 | 0.0343 | 3.6% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 6706 | 1.95 | 1.94 | 0.0257 | 1.3% | 1.77x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 10834 | 1.10 | 1.12 | 0.0344 | 3.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 12 | 0.590 | 0.592 | 0.0067 | 1.1% | 1.20x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 28955 | 0.493 | 0.490 | 0.0108 | 2.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 4927 | 1.07 | 1.07 | 0.0174 | 1.6% | 1.71x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 22758 | 0.625 | 0.626 | 0.0071 | 1.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 57 | 213.54 | 212.88 | 5.22 | 2.5% | 1.10x faster | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 58 | 234.36 | 236.41 | 4.66 | 2.0% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 8 | 1,281.35 | 1,259.44 | 72.19 | 5.7% | 1.26x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 15 | 1,013.69 | 1,015.55 | 18.85 | 1.9% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 5 | 1,351.33 | 1,361.38 | 84.84 | 6.2% | 1.47x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 15 | 918.68 | 923.64 | 17.25 | 1.9% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 13690 | 1.02 | 1.02 | 0.0126 | 1.2% | 4.87x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 71356 | 0.208 | 0.208 | 0.0022 | 1.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 13487 | 1.15 | 1.15 | 0.0155 | 1.3% | 4.67x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 60599 | 0.246 | 0.245 | 0.0035 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 31751 | 0.485 | 0.486 | 0.0035 | 0.7% | 4.09x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 133125 | 0.119 | 0.119 | 0.0022 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 31051 | 0.488 | 0.488 | 0.0037 | 0.8% | 4.09x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 108995 | 0.119 | 0.120 | 0.0025 | 2.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 1961 | 7.92 | 7.94 | 0.0735 | 0.9% | 2.73x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 4736 | 2.90 | 2.89 | 0.0669 | 2.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 3349 | 4.22 | 4.23 | 0.106 | 2.5% | 2.63x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 8010 | 1.61 | 1.61 | 0.0226 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 3524 | 4.23 | 4.22 | 0.0741 | 1.8% | 2.63x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 10037 | 1.61 | 1.61 | 0.0225 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 2359 | 6.42 | 6.43 | 0.106 | 1.6% | 2.70x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 6926 | 2.38 | 2.40 | 0.0828 | 3.5% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 2194 | 6.76 | 6.75 | 0.0710 | 1.1% | 2.28x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 5140 | 2.96 | 2.95 | 0.0419 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 1241 | 11.98 | 12.00 | 0.0506 | 0.4% | 2.66x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3658 | 4.51 | 4.49 | 0.0945 | 2.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 3722 | 3.80 | 3.80 | 0.0686 | 1.8% | 2.68x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 8962 | 1.41 | 1.42 | 0.0544 | 3.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 2069 | 6.33 | 6.29 | 0.120 | 1.9% | 2.55x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 5803 | 2.49 | 2.47 | 0.0389 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1601 | 9.21 | 9.22 | 0.111 | 1.2% | 2.45x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 3750 | 3.76 | 3.77 | 0.0615 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 590 | 19.83 | 19.89 | 0.387 | 1.9% | 1.76x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 423 | 34.89 | 34.77 | 0.720 | 2.1% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 212 | 23.84 | 23.67 | 0.563 | 2.4% | 1.62x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 390 | 38.68 | 38.78 | 0.294 | 0.8% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 120 | 19.43 | 19.49 | 0.966 | 5.0% | 1.76x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 234 | 34.28 | 34.76 | 1.09 | 3.1% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 1567 | 9.38 | 9.33 | 0.149 | 1.6% | 2.46x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 3975 | 3.81 | 3.81 | 0.0533 | 1.4% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 392 | 25.88 | 25.70 | 0.651 | 2.5% | 1.58x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 743 | 16.39 | 16.38 | 0.211 | 1.3% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 145 | 33.48 | 33.41 | 1.40 | 4.2% | 1.19x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 478 | 28.24 | 28.21 | 0.371 | 1.3% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 1076 | 13.88 | 14.98 | 3.21 | 21.5% ⚠ | 1.14x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 798 | 15.87 | 15.88 | 0.226 | 1.4% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 351 | 40.03 | 39.85 | 1.08 | 2.7% | 1.08x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 397 | 37.01 | 36.94 | 0.827 | 2.2% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 787 | 20.45 | 20.44 | 0.626 | 3.1% | 1.15x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 535 | 23.50 | 23.43 | 0.485 | 2.1% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 713 | 11.49 | 11.59 | 0.481 | 4.1% | 1.26x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 800 | 14.51 | 14.59 | 0.580 | 4.0% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 246 | 32.73 | 33.26 | 1.23 | 3.7% | 1.01x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 462 | 33.06 | 32.92 | 0.623 | 1.9% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 443 | 17.09 | 16.97 | 0.594 | 3.5% | 1.26x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 888 | 21.55 | 21.67 | 0.274 | 1.3% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 9824 | 0.766 | 0.768 | 0.0122 | 1.6% | 2.78x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 61167 | 0.276 | 0.275 | 0.0051 | 1.9% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 6097 | 1.06 | 1.06 | 0.0206 | 1.9% | 4.06x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 48016 | 0.261 | 0.260 | 0.0067 | 2.6% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 8711 | 0.871 | 0.870 | 0.0145 | 1.7% | 1.33x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 23099 | 0.657 | 0.657 | 0.0073 | 1.1% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 6420 | 0.524 | 0.526 | 0.0205 | 3.9% | 3.58x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 68336 | 0.146 | 0.147 | 0.0015 | 1.0% | baseline | Reuses one parsed AST to isolate unparser cost. |

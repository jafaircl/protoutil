# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-16T19:04:51.031Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the `cel-go` reference implementation on the same machine. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. Each policy program primes every prepared activation in round-robin order before policy evaluation samples begin. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

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
| 1 | `policy-eval` | nested_rule7 / valid / x=1 | 1.71 | 0.211 | 8.07x | +1.50 us |
| 2 | `policy-eval` | nested_rule7 / valid / x=2 | 1.89 | 0.248 | 7.62x | +1.64 us |
| 3 | `eval-details` | diagnostic / list index | 0.370 | 0.0490 | 7.54x | +0.321 us |
| 4 | `eval` | diagnostic / list index | 0.357 | 0.0494 | 7.24x | +0.308 us |
| 5 | `policy-eval` | nested_rule7 / valid / x=4 | 0.784 | 0.118 | 6.63x | +0.666 us |
| 6 | `eval` | macro comprehension / runtime cost | 216.65 | 33.13 | 6.54x | +183.52 us |
| 7 | `policy-eval` | nested_rule7 / valid / x=3 | 0.772 | 0.119 | 6.47x | +0.653 us |
| 8 | `eval-details` | diagnostic / protobuf field | 0.849 | 0.150 | 5.67x | +0.700 us |
| 9 | `eval` | diagnostic / protobuf field | 0.821 | 0.149 | 5.50x | +0.672 us |
| 10 | `eval-details` | diagnostic / fold full scan | 65.01 | 12.11 | 5.37x | +52.90 us |
| 11 | `eval` | protobuf field selection / optimized | 0.785 | 0.147 | 5.32x | +0.637 us |
| 12 | `eval` | protobuf field selection / baseline | 0.771 | 0.147 | 5.25x | +0.624 us |
| 13 | `eval-details` | diagnostic / fold early exit | 34.21 | 6.61 | 5.18x | +27.60 us |
| 14 | `eval` | diagnostic / fold full scan | 62.10 | 12.13 | 5.12x | +49.97 us |
| 15 | `eval` | diagnostic / fold early exit | 33.18 | 6.53 | 5.08x | +26.65 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `eval` | 18 | 4.91x slower | diagnostic / literal (1.42x slower) | diagnostic / list index (7.24x slower) |
| `eval-details` | 9 | 4.63x slower | diagnostic / literal (2.75x slower) | diagnostic / list index (7.54x slower) |
| `policy-eval` | 13 | 4.06x slower | unnest / divisible by 2 / empty-set (3.50x slower) | nested_rule7 / valid / x=1 (8.07x slower) |
| `unparse` | 4 | 3.50x slower | protobuf field selection (1.65x slower) | macro comprehension (4.95x slower) |
| `partial-eval` | 3 | 2.18x slower | known branch pruning (1.46x slower) | macro pruning (2.34x slower) |
| `check` | 4 | 1.90x slower | scalar arithmetic (1.72x slower) | macro comprehension (2.13x slower) |
| `eval-state` | 9 | 1.90x slower | diagnostic / literal (1.27x faster) | diagnostic / fold full scan (3.87x slower) |
| `plan` | 9 | 1.89x slower | constant regex / compiled regex (1.02x slower) | macro comprehension / runtime cost (2.56x slower) |
| `policy-plan` | 3 | 1.78x slower | unnest (1.28x slower) | nested_rule7 (2.55x slower) |
| `policy-compile` | 3 | 1.22x slower | nested_rule7 (1.06x faster) | unnest (1.79x slower) |
| `residual-roundtrip` | 3 | 1.07x slower | known branch pruning (1.05x slower) | macro pruning (1.28x slower) |
| `residual` | 3 | 1.00x slower | qualified attribute pruning (1.08x faster) | macro pruning (1.17x slower) |
| `compile` | 4 | 1.35x faster | constant regex (1.68x faster) | macro comprehension (1.01x slower) |
| `policy-parse` | 3 | 1.72x faster | unnest (1.80x faster) | required_labels (1.62x faster) |
| `parse` | 4 | 3.22x faster | scalar arithmetic (4.05x faster) | macro comprehension (2.28x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 3097 | 2.96 | 2.96 | 0.0540 | 1.8% | 2.01x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 10709 | 1.48 | 1.48 | 0.0266 | 1.8% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 505 | 19.40 | 19.42 | 0.322 | 1.7% | 2.13x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 1654 | 9.09 | 9.09 | 0.180 | 2.0% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 984 | 6.87 | 6.94 | 0.210 | 3.0% | 1.80x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 3173 | 3.82 | 3.82 | 0.0775 | 2.0% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 427 | 7.17 | 7.26 | 0.531 | 7.3% | 1.72x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 3512 | 4.18 | 4.25 | 0.180 | 4.2% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 2025 | 7.46 | 7.45 | 0.126 | 1.7% | 1.68x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 1263 | 12.56 | 12.61 | 0.198 | 1.6% | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 426 | 28.74 | 28.84 | 0.752 | 2.6% | 1.01x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 589 | 28.51 | 28.86 | 0.915 | 3.2% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 1203 | 12.56 | 12.76 | 0.376 | 2.9% | 1.36x faster | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 781 | 17.04 | 17.03 | 0.469 | 2.8% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1246 | 9.75 | 9.80 | 0.238 | 2.4% | 1.35x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 1138 | 13.18 | 13.15 | 0.267 | 2.0% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 67445 | 0.229 | 0.229 | 0.0024 | 1.0% | 4.63x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 286413 | 0.0495 | 0.0495 | 0.0003 | 0.5% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 36321 | 0.410 | 0.410 | 0.0037 | 0.9% | 4.60x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 178345 | 0.0891 | 0.0902 | 0.0022 | 2.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 417 | 34.21 | 34.14 | 0.272 | 0.8% | 5.18x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2310 | 6.61 | 6.61 | 0.0885 | 1.3% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 239 | 65.01 | 65.07 | 0.685 | 1.1% | 5.37x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1225 | 12.11 | 12.10 | 0.190 | 1.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 99262 | 0.154 | 0.154 | 0.0019 | 1.2% | 4.26x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 413643 | 0.0361 | 0.0361 | 0.0002 | 0.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 41739 | 0.370 | 0.370 | 0.0030 | 0.8% | 7.54x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 311417 | 0.0490 | 0.0491 | 0.0004 | 0.7% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 295503 | 0.0534 | 0.0533 | 0.0005 | 1.0% | 2.75x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 760548 | 0.0195 | 0.0194 | 0.0001 | 0.7% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 52423 | 0.293 | 0.293 | 0.0043 | 1.5% | 4.13x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 213921 | 0.0709 | 0.0706 | 0.0012 | 1.7% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 18024 | 0.849 | 0.849 | 0.0098 | 1.2% | 5.67x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 100983 | 0.150 | 0.150 | 0.0014 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 24472 | 0.392 | 0.393 | 0.0061 | 1.6% | 1.60x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 50791 | 0.245 | 0.245 | 0.0047 | 1.9% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 18164 | 0.611 | 0.609 | 0.0055 | 0.9% | 1.90x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 40727 | 0.322 | 0.323 | 0.0044 | 1.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 177 | 47.56 | 47.54 | 0.600 | 1.3% | 3.85x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1224 | 12.36 | 12.27 | 0.221 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 173 | 87.88 | 87.82 | 0.324 | 0.4% | 3.87x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 705 | 22.73 | 22.79 | 0.388 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 30191 | 0.279 | 0.279 | 0.0053 | 1.9% | 1.33x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 51896 | 0.210 | 0.209 | 0.0037 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 21109 | 0.605 | 0.601 | 0.0092 | 1.5% | 2.24x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 48989 | 0.271 | 0.270 | 0.0045 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 21947 | 0.147 | 0.147 | 0.0061 | 4.2% | 1.27x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 74598 | 0.186 | 0.186 | 0.0032 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 34016 | 0.455 | 0.455 | 0.0019 | 0.4% | 1.69x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 53789 | 0.270 | 0.269 | 0.0043 | 1.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 8358 | 1.46 | 1.45 | 0.0102 | 0.7% | 2.90x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 25020 | 0.503 | 0.506 | 0.0150 | 3.0% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 222 | 7.76 | 7.59 | 0.483 | 6.4% | 3.82x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 7709 | 2.03 | 2.04 | 0.0312 | 1.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 7695 | 1.16 | 1.16 | 0.0181 | 1.6% | 4.80x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 63242 | 0.241 | 0.242 | 0.0042 | 1.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 51414 | 0.222 | 0.223 | 0.0039 | 1.7% | 4.50x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 309684 | 0.0493 | 0.0493 | 0.0005 | 1.0% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 15047 | 0.403 | 0.405 | 0.0115 | 2.8% | 4.53x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 177311 | 0.0888 | 0.0884 | 0.0015 | 1.7% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 333 | 33.18 | 33.32 | 0.407 | 1.2% | 5.08x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2189 | 6.53 | 6.55 | 0.117 | 1.8% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 239 | 62.10 | 62.18 | 0.340 | 0.5% | 5.12x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1258 | 12.13 | 12.16 | 0.165 | 1.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 44647 | 0.147 | 0.149 | 0.0047 | 3.1% | 4.13x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 416888 | 0.0357 | 0.0357 | 0.0002 | 0.6% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 22370 | 0.357 | 0.359 | 0.0078 | 2.2% | 7.24x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 300574 | 0.0494 | 0.0494 | 0.0002 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 223817 | 0.0275 | 0.0274 | 0.0012 | 4.5% | 1.42x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 782546 | 0.0193 | 0.0193 | 0.0001 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 28203 | 0.287 | 0.289 | 0.0073 | 2.5% | 4.02x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 201319 | 0.0713 | 0.0718 | 0.0013 | 1.8% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 10185 | 0.821 | 0.828 | 0.0124 | 1.5% | 5.50x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 102974 | 0.149 | 0.149 | 0.0017 | 1.2% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 133 | 32.73 | 33.11 | 1.01 | 3.1% | 5.02x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 2265 | 6.52 | 6.53 | 0.0864 | 1.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 412 | 32.91 | 32.90 | 0.326 | 1.0% | 5.02x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2211 | 6.56 | 6.56 | 0.0905 | 1.4% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 24 | 216.65 | 217.81 | 7.73 | 3.5% | 6.54x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 462 | 33.13 | 33.02 | 0.509 | 1.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4082 | 0.771 | 0.780 | 0.0257 | 3.3% | 5.25x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 102332 | 0.147 | 0.147 | 0.0013 | 0.9% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 19708 | 0.785 | 0.780 | 0.0083 | 1.1% | 5.32x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 102633 | 0.147 | 0.147 | 0.0008 | 0.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 11367 | 0.203 | 0.203 | 0.0055 | 2.7% | 4.10x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 313690 | 0.0496 | 0.0496 | 0.0004 | 0.8% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 74260 | 0.221 | 0.222 | 0.0027 | 1.2% | 4.47x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 310491 | 0.0495 | 0.0497 | 0.0004 | 0.9% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1915 | 3.19 | 3.22 | 0.0669 | 2.1% | 3.37x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1262 | 10.75 | 10.81 | 0.312 | 2.9% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 718 | 8.18 | 8.16 | 0.256 | 3.1% | 2.28x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 854 | 18.61 | 18.82 | 1.00 | 5.3% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1877 | 4.02 | 4.05 | 0.0934 | 2.3% | 3.07x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1046 | 12.35 | 12.42 | 0.310 | 2.5% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 225 | 1.97 | 2.07 | 0.376 | 18.2% ⚠ | 4.05x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 920 | 7.95 | 8.02 | 0.285 | 3.6% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3319 | 1.54 | 1.54 | 0.0532 | 3.5% | 1.46x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 14317 | 1.05 | 1.06 | 0.0177 | 1.7% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 647 | 7.62 | 7.69 | 0.233 | 3.0% | 2.34x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 4399 | 3.25 | 3.24 | 0.0583 | 1.8% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 2245 | 2.82 | 2.78 | 0.0757 | 2.7% | 2.18x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 13853 | 1.29 | 1.29 | 0.0237 | 1.8% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 6922 | 0.993 | 0.989 | 0.0151 | 1.5% | 1.97x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 27654 | 0.504 | 0.501 | 0.0120 | 2.4% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 3160 | 2.91 | 2.89 | 0.0737 | 2.5% | 1.02x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 5183 | 2.85 | 2.87 | 0.0801 | 2.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 1846 | 2.26 | 2.25 | 0.0474 | 2.1% | 1.56x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 11928 | 1.45 | 1.46 | 0.0133 | 0.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 3402 | 3.56 | 3.58 | 0.0802 | 2.2% | 2.10x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 7946 | 1.69 | 1.69 | 0.0287 | 1.7% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 1311 | 5.43 | 5.52 | 0.388 | 7.0% | 2.56x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 5848 | 2.12 | 2.13 | 0.0380 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 4380 | 1.60 | 1.60 | 0.0314 | 2.0% | 1.72x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 13660 | 0.928 | 0.931 | 0.0184 | 2.0% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 6181 | 2.22 | 2.22 | 0.0298 | 1.3% | 2.00x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 12718 | 1.11 | 1.11 | 0.0127 | 1.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 11 | 0.663 | 0.677 | 0.0279 | 4.1% | 1.87x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 8 | 0.354 | 0.365 | 0.0386 | 10.6% ⚠ | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 4152 | 1.27 | 1.26 | 0.0360 | 2.9% | 1.89x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 24248 | 0.669 | 0.764 | 0.258 | 33.7% ⚠ | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 55 | 227.84 | 228.43 | 6.71 | 2.9% | 1.06x faster | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 49 | 241.74 | 240.82 | 5.52 | 2.3% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 9 | 1,259.69 | 1,257.67 | 46.73 | 3.7% | 1.22x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 10 | 1,034.32 | 1,038.02 | 28.98 | 2.8% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 4 | 1,641.04 | 1,709.94 | 325.40 | 19.0% ⚠ | 1.79x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 15 | 918.40 | 923.08 | 18.05 | 2.0% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 8355 | 1.71 | 1.71 | 0.0175 | 1.0% | 8.07x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 73198 | 0.211 | 0.211 | 0.0012 | 0.5% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 7963 | 1.89 | 1.89 | 0.0057 | 0.3% | 7.62x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 59513 | 0.248 | 0.247 | 0.0031 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 19587 | 0.772 | 0.777 | 0.0072 | 0.9% | 6.47x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 132563 | 0.119 | 0.120 | 0.0012 | 1.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 19664 | 0.784 | 0.786 | 0.0110 | 1.4% | 6.63x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 125695 | 0.118 | 0.119 | 0.0022 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 890 | 11.90 | 11.95 | 0.164 | 1.4% | 4.06x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 5140 | 2.93 | 2.91 | 0.0422 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 2214 | 6.18 | 6.20 | 0.0630 | 1.0% | 3.86x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 8646 | 1.60 | 1.60 | 0.0271 | 1.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 2331 | 6.17 | 6.19 | 0.0899 | 1.5% | 3.83x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 10510 | 1.61 | 1.61 | 0.0244 | 1.5% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 1589 | 9.93 | 9.90 | 0.137 | 1.4% | 4.19x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 5799 | 2.37 | 2.35 | 0.0357 | 1.5% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 1457 | 10.25 | 10.24 | 0.122 | 1.2% | 3.50x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 4788 | 2.93 | 2.92 | 0.0205 | 0.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 794 | 17.73 | 17.74 | 0.232 | 1.3% | 3.90x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3823 | 4.55 | 4.53 | 0.0733 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 2640 | 5.84 | 5.83 | 0.0705 | 1.2% | 4.13x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 8865 | 1.41 | 1.41 | 0.0253 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 1554 | 9.37 | 9.39 | 0.135 | 1.4% | 3.80x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 6477 | 2.46 | 2.47 | 0.0400 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1160 | 13.71 | 13.70 | 0.225 | 1.6% | 3.66x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 3931 | 3.74 | 3.72 | 0.0451 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 562 | 19.99 | 20.14 | 0.241 | 1.2% | 1.72x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 449 | 34.47 | 34.59 | 0.315 | 0.9% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 257 | 23.80 | 23.75 | 0.785 | 3.3% | 1.62x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 403 | 38.64 | 38.59 | 0.795 | 2.1% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 115 | 19.41 | 19.64 | 0.710 | 3.6% | 1.80x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 502 | 35.00 | 35.17 | 0.457 | 1.3% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 1350 | 9.92 | 9.92 | 0.0738 | 0.7% | 2.55x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 3784 | 3.89 | 3.90 | 0.0412 | 1.1% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 351 | 28.64 | 28.90 | 0.783 | 2.7% | 1.78x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 772 | 16.05 | 16.13 | 0.264 | 1.6% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 144 | 36.33 | 36.60 | 1.22 | 3.3% | 1.28x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 480 | 28.36 | 28.30 | 0.503 | 1.8% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 947 | 16.84 | 16.80 | 0.178 | 1.1% | 1.05x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 759 | 16.03 | 15.97 | 0.346 | 2.2% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 323 | 47.62 | 47.89 | 0.840 | 1.8% | 1.28x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 393 | 37.31 | 36.87 | 0.781 | 2.1% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 626 | 24.83 | 24.85 | 0.645 | 2.6% | 1.07x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 683 | 23.13 | 23.06 | 0.366 | 1.6% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 659 | 14.47 | 14.35 | 0.462 | 3.2% | 1.00x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 958 | 14.41 | 14.39 | 0.359 | 2.5% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 169 | 38.15 | 37.82 | 1.03 | 2.7% | 1.17x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 442 | 32.67 | 32.94 | 0.505 | 1.5% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 430 | 19.94 | 20.05 | 0.403 | 2.0% | 1.08x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 601 | 21.51 | 21.53 | 0.269 | 1.3% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 8578 | 0.862 | 0.859 | 0.0107 | 1.3% | 3.14x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 45581 | 0.274 | 0.274 | 0.0051 | 1.8% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5551 | 1.30 | 1.28 | 0.0332 | 2.6% | 4.95x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 48158 | 0.262 | 0.264 | 0.0056 | 2.1% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 8091 | 1.09 | 1.08 | 0.0167 | 1.5% | 1.65x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 22450 | 0.661 | 0.661 | 0.0108 | 1.6% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 6014 | 0.593 | 0.609 | 0.0371 | 6.1% | 3.95x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 70540 | 0.150 | 0.151 | 0.0036 | 2.4% | baseline | Reuses one parsed AST to isolate unparser cost. |

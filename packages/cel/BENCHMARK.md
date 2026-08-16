# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-16T02:11:40.624Z`

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
- cel-go: `v0.30.0 (local working copy)`
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
| 1 | `policy-eval` | nested_rule7 / valid / x=1 | 1.80 | 0.211 | 8.53x | +1.59 us |
| 2 | `policy-eval` | nested_rule7 / valid / x=2 | 1.99 | 0.252 | 7.87x | +1.73 us |
| 3 | `eval-details` | diagnostic / list index | 0.371 | 0.0504 | 7.37x | +0.321 us |
| 4 | `eval` | diagnostic / list index | 0.365 | 0.0502 | 7.25x | +0.314 us |
| 5 | `check` | protobuf field selection | 23.32 | 3.58 | 6.51x | +19.74 us |
| 6 | `policy-eval` | nested_rule7 / valid / x=3 | 0.802 | 0.123 | 6.50x ⚠ | +0.679 us |
| 7 | `policy-eval` | nested_rule7 / valid / x=4 | 0.797 | 0.123 | 6.48x | +0.674 us |
| 8 | `eval` | macro comprehension / runtime cost | 211.82 | 32.95 | 6.43x | +178.88 us |
| 9 | `eval-details` | diagnostic / protobuf field | 0.838 | 0.145 | 5.77x | +0.693 us |
| 10 | `eval` | diagnostic / protobuf field | 0.830 | 0.146 | 5.70x | +0.684 us |
| 11 | `eval` | protobuf field selection / optimized | 0.766 | 0.146 | 5.27x | +0.621 us |
| 12 | `eval` | protobuf field selection / baseline | 0.765 | 0.146 | 5.25x | +0.619 us |
| 13 | `eval` | diagnostic / fold full scan | 64.39 | 12.70 | 5.07x | +51.68 us |
| 14 | `unparse` | macro comprehension | 1.29 | 0.254 | 5.07x | +1.03 us |
| 15 | `eval-details` | diagnostic / fold full scan | 64.41 | 12.76 | 5.05x | +51.65 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `eval` | 18 | 4.75x slower | diagnostic / literal (1.40x slower) | diagnostic / list index (7.25x slower) |
| `eval-details` | 9 | 4.61x slower | diagnostic / literal (2.72x slower) | diagnostic / list index (7.37x slower) |
| `policy-eval` | 13 | 3.95x slower | unnest / divisible by 2 / empty-set (3.43x slower) | nested_rule7 / valid / x=1 (8.53x slower) |
| `unparse` | 4 | 3.57x slower | protobuf field selection (1.66x slower) | macro comprehension (5.07x slower) |
| `check` | 4 | 2.65x slower | scalar arithmetic (2.06x slower) | protobuf field selection (6.51x slower) |
| `partial-eval` | 3 | 2.09x slower | known branch pruning (1.48x slower) | macro pruning (2.40x slower) |
| `eval-state` | 9 | 1.90x slower | diagnostic / literal (1.30x faster) | diagnostic / fold full scan (3.88x slower) |
| `plan` | 9 | 1.84x slower | constant regex / compiled regex (1.54x slower) | macro comprehension / runtime cost (2.02x slower) |
| `policy-plan` | 3 | 1.62x slower | unnest (1.49x slower) | required_labels (1.74x slower) |
| `residual-roundtrip` | 3 | 1.44x slower | known branch pruning (1.22x slower) | qualified attribute pruning (1.59x slower) |
| `policy-compile` | 3 | 1.31x slower | nested_rule7 (1.08x slower) | unnest (1.65x slower) |
| `residual` | 3 | 1.31x slower | known branch pruning (1.14x slower) | qualified attribute pruning (1.52x slower) |
| `compile` | 4 | 1.01x slower | constant regex (1.37x faster) | protobuf field selection (1.84x slower) |
| `policy-parse` | 3 | 1.71x faster | unnest (1.75x faster) | required_labels (1.65x faster) |
| `parse` | 4 | 2.66x faster | scalar arithmetic (3.11x faster) | macro comprehension (2.14x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 2292 | 4.01 | 4.02 | 0.0546 | 1.4% | 2.78x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 12588 | 1.44 | 1.45 | 0.0183 | 1.3% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 446 | 22.86 | 22.84 | 0.383 | 1.7% | 2.54x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 1915 | 9.02 | 8.98 | 0.164 | 1.8% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 538 | 23.32 | 23.59 | 0.543 | 2.3% | 6.51x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 3309 | 3.58 | 3.59 | 0.0610 | 1.7% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 226 | 8.91 | 9.01 | 0.569 | 6.3% | 2.06x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 2823 | 4.33 | 4.36 | 0.103 | 2.4% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 1658 | 8.96 | 9.00 | 0.113 | 1.3% | 1.37x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 864 | 12.32 | 12.31 | 0.227 | 1.8% | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 238 | 32.87 | 32.95 | 0.658 | 2.0% | 1.18x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 620 | 27.75 | 27.90 | 0.907 | 3.3% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 438 | 30.37 | 30.42 | 0.165 | 0.5% | 1.84x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 708 | 16.49 | 16.55 | 0.328 | 2.0% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1143 | 11.81 | 11.82 | 0.0425 | 0.4% | 1.13x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 1184 | 13.38 | 13.50 | 0.390 | 2.9% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 67499 | 0.223 | 0.223 | 0.0012 | 0.6% | 4.49x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 299122 | 0.0497 | 0.0497 | 0.0001 | 0.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 30878 | 0.414 | 0.414 | 0.0048 | 1.2% | 4.61x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 142991 | 0.0899 | 0.0894 | 0.0017 | 1.8% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 443 | 33.98 | 34.04 | 0.239 | 0.7% | 4.82x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2186 | 7.05 | 7.45 | 1.04 | 14.0% ⚠ | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 230 | 64.41 | 64.53 | 0.372 | 0.6% | 5.05x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1091 | 12.76 | 12.82 | 0.179 | 1.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 106378 | 0.141 | 0.142 | 0.0010 | 0.7% | 3.84x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 414151 | 0.0368 | 0.0368 | 0.0001 | 0.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 40758 | 0.371 | 0.371 | 0.0019 | 0.5% | 7.37x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 293149 | 0.0504 | 0.0504 | 0.0001 | 0.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 241533 | 0.0518 | 0.0519 | 0.0004 | 0.8% | 2.72x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 788904 | 0.0190 | 0.0190 | 0.0002 | 1.1% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 54420 | 0.289 | 0.288 | 0.0019 | 0.7% | 4.11x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 214178 | 0.0703 | 0.0705 | 0.0008 | 1.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 17286 | 0.838 | 0.837 | 0.0101 | 1.2% | 5.77x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 106369 | 0.145 | 0.147 | 0.0044 | 3.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 25621 | 0.398 | 0.397 | 0.0029 | 0.7% | 1.65x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 52821 | 0.241 | 0.241 | 0.0038 | 1.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 18616 | 0.616 | 0.616 | 0.0062 | 1.0% | 1.90x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 49336 | 0.325 | 0.323 | 0.0059 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 175 | 47.47 | 47.62 | 0.513 | 1.1% | 3.75x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1220 | 12.67 | 12.68 | 0.145 | 1.1% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 166 | 90.43 | 90.55 | 0.408 | 0.5% | 3.88x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 671 | 23.30 | 23.25 | 0.315 | 1.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 27774 | 0.239 | 0.238 | 0.0033 | 1.4% | 1.15x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 71592 | 0.207 | 0.208 | 0.0050 | 2.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 20765 | 0.591 | 0.590 | 0.0091 | 1.5% | 2.25x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 54942 | 0.263 | 0.263 | 0.0016 | 0.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 24690 | 0.144 | 0.142 | 0.0039 | 2.7% | 1.30x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 74457 | 0.187 | 0.186 | 0.0036 | 1.9% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 33961 | 0.462 | 0.462 | 0.0016 | 0.3% | 1.72x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 49751 | 0.269 | 0.270 | 0.0066 | 2.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 9038 | 1.43 | 1.43 | 0.0139 | 1.0% | 2.84x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 32416 | 0.504 | 0.501 | 0.0074 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 222 | 7.25 | 7.52 | 0.502 | 6.7% | 3.66x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 7245 | 1.98 | 1.99 | 0.0439 | 2.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 8818 | 1.19 | 1.18 | 0.0072 | 0.6% | 5.03x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 61489 | 0.236 | 0.236 | 0.0029 | 1.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 67050 | 0.220 | 0.220 | 0.0018 | 0.8% | 4.42x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 303888 | 0.0498 | 0.0498 | 0.0001 | 0.2% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 14776 | 0.423 | 0.427 | 0.0083 | 1.9% | 4.64x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 140743 | 0.0911 | 0.0918 | 0.0038 | 4.1% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 390 | 34.12 | 34.08 | 0.343 | 1.0% | 4.95x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2175 | 6.90 | 6.92 | 0.105 | 1.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 235 | 64.39 | 64.40 | 0.253 | 0.4% | 5.07x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1053 | 12.70 | 12.76 | 0.183 | 1.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 38650 | 0.139 | 0.140 | 0.0032 | 2.3% | 3.80x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 414697 | 0.0365 | 0.0365 | 0.0001 | 0.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 21654 | 0.365 | 0.366 | 0.0053 | 1.4% | 7.25x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 294078 | 0.0502 | 0.0502 | 0.0002 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 231340 | 0.0267 | 0.0267 | 0.0009 | 3.4% | 1.40x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 792188 | 0.0191 | 0.0191 | 0.0000 | 0.2% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 25874 | 0.283 | 0.285 | 0.0052 | 1.8% | 3.99x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 220709 | 0.0710 | 0.0708 | 0.0006 | 0.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 9907 | 0.830 | 0.834 | 0.0131 | 1.6% | 5.70x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 103221 | 0.146 | 0.146 | 0.0006 | 0.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 127 | 32.70 | 32.72 | 0.283 | 0.9% | 4.70x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 1861 | 6.95 | 6.94 | 0.0781 | 1.1% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 323 | 33.11 | 33.17 | 0.220 | 0.7% | 4.79x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2132 | 6.91 | 6.94 | 0.0901 | 1.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 23 | 211.82 | 210.11 | 4.32 | 2.1% | 6.43x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 442 | 32.95 | 33.01 | 0.766 | 2.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4511 | 0.765 | 0.773 | 0.0215 | 2.8% | 5.25x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 101273 | 0.146 | 0.146 | 0.0004 | 0.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 19538 | 0.766 | 0.767 | 0.0056 | 0.7% | 5.27x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 102848 | 0.146 | 0.146 | 0.0009 | 0.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 15234 | 0.199 | 0.200 | 0.0056 | 2.8% | 3.99x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 302831 | 0.0499 | 0.0499 | 0.0001 | 0.3% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 70971 | 0.196 | 0.197 | 0.0028 | 1.4% | 3.94x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 297774 | 0.0498 | 0.0497 | 0.0002 | 0.4% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1954 | 3.91 | 3.92 | 0.0346 | 0.9% | 2.81x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1378 | 11.01 | 11.41 | 1.45 | 12.7% ⚠ | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 706 | 8.36 | 8.42 | 0.146 | 1.7% | 2.14x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 943 | 17.91 | 17.88 | 0.362 | 2.0% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1756 | 4.85 | 4.86 | 0.0766 | 1.6% | 2.51x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1239 | 12.19 | 12.23 | 0.211 | 1.7% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 223 | 2.58 | 2.69 | 0.267 | 9.9% | 3.11x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 990 | 8.04 | 8.05 | 0.182 | 2.3% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3375 | 1.53 | 1.51 | 0.0323 | 2.1% | 1.48x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 13680 | 1.03 | 1.03 | 0.0179 | 1.7% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 695 | 7.74 | 7.72 | 0.240 | 3.1% | 2.40x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 4785 | 3.23 | 3.24 | 0.0552 | 1.7% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 2018 | 2.70 | 2.70 | 0.0742 | 2.7% | 2.09x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 10541 | 1.29 | 1.29 | 0.0251 | 2.0% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 673 | 13.25 | 13.35 | 0.298 | 2.2% | 1.92x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 2445 | 6.89 | 6.95 | 0.124 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 626 | 15.20 | 15.29 | 0.277 | 1.8% | 1.54x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 1503 | 9.87 | 9.86 | 0.175 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 687 | 14.84 | 14.89 | 0.274 | 1.8% | 1.85x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 1863 | 8.01 | 8.01 | 0.0688 | 0.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 875 | 16.15 | 16.13 | 0.170 | 1.1% | 1.84x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 1668 | 8.77 | 8.74 | 0.154 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 467 | 17.57 | 17.58 | 0.179 | 1.0% | 2.02x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 1652 | 8.71 | 8.78 | 0.135 | 1.5% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 765 | 14.41 | 14.34 | 0.350 | 2.4% | 1.91x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 1876 | 7.56 | 7.55 | 0.147 | 1.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 912 | 15.03 | 15.05 | 0.220 | 1.5% | 1.82x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 1799 | 8.26 | 8.76 | 1.46 | 16.6% ⚠ | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 12 | 11.66 | 13.52 | 4.26 | 31.5% ⚠ | 1.70x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 1915 | 6.86 | 6.88 | 0.0707 | 1.0% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 708 | 13.32 | 13.39 | 0.201 | 1.5% | 1.83x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 1921 | 7.28 | 7.32 | 0.161 | 2.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 46 | 283.86 | 306.45 | 44.75 | 14.6% ⚠ | 1.08x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 46 | 262.66 | 263.45 | 2.83 | 1.1% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 7 | 1,571.01 | 1,564.44 | 49.48 | 3.2% | 1.31x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 11 | 1,199.05 | 1,199.77 | 14.36 | 1.2% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 4 | 1,660.75 | 1,679.04 | 73.03 | 4.3% | 1.65x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 11 | 1,005.88 | 1,005.09 | 6.75 | 0.7% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 8060 | 1.80 | 1.81 | 0.0129 | 0.7% | 8.53x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 73636 | 0.211 | 0.211 | 0.0028 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 7801 | 1.99 | 1.99 | 0.0113 | 0.6% | 7.87x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 58853 | 0.252 | 0.251 | 0.0032 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 18269 | 0.802 | 0.815 | 0.0321 | 3.9% | 6.50x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 128184 | 0.123 | 0.135 | 0.0316 | 23.4% ⚠ | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 20070 | 0.797 | 0.795 | 0.0086 | 1.1% | 6.48x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 128505 | 0.123 | 0.123 | 0.0014 | 1.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 1248 | 11.94 | 11.96 | 0.156 | 1.3% | 3.97x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 4600 | 3.01 | 3.00 | 0.0396 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 2480 | 6.16 | 6.18 | 0.0790 | 1.3% | 3.78x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 8093 | 1.63 | 1.64 | 0.0383 | 2.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 2494 | 6.18 | 6.15 | 0.0541 | 0.9% | 3.78x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 8125 | 1.63 | 1.64 | 0.0512 | 3.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 1539 | 9.94 | 9.92 | 0.102 | 1.0% | 4.09x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 5934 | 2.43 | 2.44 | 0.0503 | 2.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 1516 | 10.24 | 10.21 | 0.0984 | 1.0% | 3.43x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 4744 | 2.99 | 3.00 | 0.0494 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 784 | 17.27 | 17.45 | 0.478 | 2.7% | 3.71x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3350 | 4.65 | 4.64 | 0.0826 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 2613 | 5.69 | 5.72 | 0.101 | 1.8% | 3.95x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 10312 | 1.44 | 1.45 | 0.0260 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 1504 | 9.28 | 9.24 | 0.142 | 1.5% | 3.63x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 5347 | 2.56 | 2.55 | 0.0347 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1111 | 13.40 | 13.47 | 0.245 | 1.8% | 3.51x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 3915 | 3.81 | 3.82 | 0.0391 | 1.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 545 | 19.95 | 19.95 | 0.197 | 1.0% | 1.71x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 413 | 34.02 | 33.75 | 0.915 | 2.7% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 257 | 23.06 | 23.30 | 0.476 | 2.0% | 1.65x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 391 | 37.94 | 38.10 | 0.899 | 2.4% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 118 | 19.41 | 19.59 | 0.663 | 3.4% | 1.75x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 346 | 33.94 | 33.91 | 0.629 | 1.9% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 422 | 26.62 | 26.74 | 0.260 | 1.0% | 1.62x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 760 | 16.43 | 16.48 | 0.376 | 2.3% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 232 | 49.55 | 49.64 | 0.497 | 1.0% | 1.74x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 575 | 28.49 | 28.50 | 0.569 | 2.0% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 116 | 55.09 | 55.25 | 1.74 | 3.2% | 1.49x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 413 | 36.94 | 37.02 | 0.773 | 2.1% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 796 | 19.30 | 19.19 | 0.223 | 1.2% | 1.22x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 935 | 15.79 | 15.87 | 0.384 | 2.4% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 284 | 52.45 | 52.39 | 1.03 | 2.0% | 1.44x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 395 | 36.48 | 36.40 | 0.408 | 1.1% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 358 | 36.97 | 37.18 | 0.766 | 2.1% | 1.59x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 588 | 23.27 | 23.33 | 0.296 | 1.3% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 204 | 16.46 | 16.51 | 1.10 | 6.6% | 1.14x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 820 | 14.48 | 14.44 | 0.244 | 1.7% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 206 | 42.90 | 42.88 | 0.913 | 2.1% | 1.31x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 442 | 32.84 | 32.83 | 0.511 | 1.6% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 333 | 32.02 | 32.26 | 0.554 | 1.7% | 1.52x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 779 | 21.09 | 21.23 | 0.635 | 3.0% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 9389 | 0.861 | 0.858 | 0.0088 | 1.0% | 3.18x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 49170 | 0.271 | 0.271 | 0.0077 | 2.8% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5522 | 1.29 | 1.28 | 0.0182 | 1.4% | 5.07x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 59396 | 0.254 | 0.255 | 0.0035 | 1.4% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 7439 | 1.07 | 1.07 | 0.0167 | 1.6% | 1.66x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 24177 | 0.647 | 0.647 | 0.0083 | 1.3% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 6029 | 0.597 | 0.604 | 0.0169 | 2.8% | 4.08x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 107289 | 0.146 | 0.147 | 0.0031 | 2.1% | baseline | Reuses one parsed AST to isolate unparser cost. |

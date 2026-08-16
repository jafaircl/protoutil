# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-08-16T02:46:39.472Z`

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
| 1 | `plan` | constant regex / baseline | 13.17 | 0.502 | 26.25x | +12.67 us |
| 2 | `plan` | scalar arithmetic / baseline | 11.72 | 0.488 | 24.02x ⚠ | +11.23 us |
| 3 | `plan` | scalar arithmetic / optimized | 13.53 | 0.623 | 21.71x | +12.91 us |
| 4 | `plan` | protobuf field selection / baseline | 14.00 | 0.911 | 15.36x ⚠ | +13.08 us |
| 5 | `plan` | protobuf field selection / optimized | 14.79 | 1.09 | 13.59x | +13.70 us |
| 6 | `plan` | macro comprehension / baseline | 14.97 | 1.37 | 10.89x | +13.59 us |
| 7 | `plan` | macro comprehension / optimized | 16.25 | 1.74 | 9.33x | +14.51 us |
| 8 | `policy-eval` | nested_rule7 / valid / x=1 | 1.80 | 0.205 | 8.81x | +1.60 us |
| 9 | `plan` | macro comprehension / runtime cost | 18.22 | 2.17 | 8.40x | +16.05 us |
| 10 | `policy-eval` | nested_rule7 / valid / x=2 | 1.96 | 0.244 | 8.04x | +1.72 us |
| 11 | `eval-details` | diagnostic / list index | 0.361 | 0.0486 | 7.42x | +0.312 us |
| 12 | `eval` | diagnostic / list index | 0.351 | 0.0490 | 7.16x | +0.302 us |
| 13 | `policy-plan` | nested_rule7 | 26.06 | 3.86 | 6.75x | +22.20 us |
| 14 | `policy-eval` | nested_rule7 / valid / x=3 | 0.783 | 0.118 | 6.62x | +0.665 us |
| 15 | `eval` | macro comprehension / runtime cost | 213.47 | 32.75 | 6.52x | +180.72 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `plan` | 9 | 13.59x slower | constant regex / compiled regex (5.30x slower) | constant regex / baseline (26.25x slower) |
| `eval` | 18 | 4.98x slower | diagnostic / literal (1.42x slower) | diagnostic / list index (7.16x slower) |
| `eval-details` | 9 | 4.48x slower | diagnostic / literal (2.72x slower) | diagnostic / list index (7.42x slower) |
| `policy-eval` | 13 | 3.93x slower | unnest / divisible by 2 / empty-set (3.33x slower) | nested_rule7 / valid / x=1 (8.81x slower) |
| `unparse` | 4 | 3.43x slower | protobuf field selection (1.57x slower) | macro comprehension (4.76x slower) |
| `policy-plan` | 3 | 3.16x slower | unnest (1.83x slower) | nested_rule7 (6.75x slower) |
| `check` | 4 | 2.70x slower | scalar arithmetic (1.86x slower) | protobuf field selection (6.50x slower) |
| `partial-eval` | 3 | 1.96x slower | known branch pruning (1.52x slower) | macro pruning (2.22x slower) |
| `eval-state` | 9 | 1.87x slower | diagnostic / literal (1.33x faster) | diagnostic / fold full scan (4.17x slower) |
| `policy-compile` | 3 | 1.63x slower | nested_rule7 (1.10x slower) | unnest (1.70x slower) |
| `residual` | 3 | 1.21x slower | known branch pruning (1.16x slower) | qualified attribute pruning (1.42x slower) |
| `residual-roundtrip` | 3 | 1.19x slower | known branch pruning (1.19x slower) | qualified attribute pruning (1.50x slower) |
| `compile` | 4 | 1.06x slower | constant regex (1.45x faster) | protobuf field selection (1.88x slower) |
| `policy-parse` | 3 | 1.80x faster | unnest (1.81x faster) | required_labels (1.65x faster) |
| `parse` | 4 | 2.64x faster | scalar arithmetic (3.21x faster) | macro comprehension (2.17x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 2187 | 3.96 | 3.97 | 0.0947 | 2.4% | 2.64x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 8756 | 1.50 | 1.51 | 0.0338 | 2.2% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 449 | 23.95 | 23.50 | 0.884 | 3.8% | 2.77x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 2060 | 8.66 | 8.67 | 0.178 | 2.1% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 543 | 23.75 | 24.26 | 0.855 | 3.5% | 6.50x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 3828 | 3.65 | 3.64 | 0.0582 | 1.6% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 196 | 7.76 | 7.96 | 0.363 | 4.6% | 1.86x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 2924 | 4.16 | 4.17 | 0.0983 | 2.4% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 1690 | 8.80 | 8.87 | 0.209 | 2.4% | 1.45x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 1137 | 12.75 | 13.29 | 1.73 | 13.0% ⚠ | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 294 | 32.51 | 32.47 | 0.313 | 1.0% | 1.17x slower | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 527 | 27.77 | 27.59 | 0.495 | 1.8% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 497 | 31.16 | 31.17 | 0.381 | 1.2% | 1.88x slower | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 882 | 16.57 | 16.57 | 0.177 | 1.1% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1284 | 12.51 | 12.65 | 0.559 | 4.4% | 1.04x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 1084 | 12.98 | 12.94 | 0.141 | 1.1% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 67763 | 0.225 | 0.225 | 0.0023 | 1.0% | 4.38x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 134283 | 0.0513 | 0.0524 | 0.0029 | 5.5% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 38478 | 0.397 | 0.398 | 0.0042 | 1.1% | 4.48x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 171895 | 0.0885 | 0.0882 | 0.0009 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 453 | 33.17 | 33.27 | 0.267 | 0.8% | 5.13x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2314 | 6.47 | 6.52 | 0.118 | 1.8% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 238 | 64.48 | 64.54 | 1.25 | 1.9% | 5.50x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1320 | 11.71 | 11.68 | 0.136 | 1.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 93982 | 0.145 | 0.145 | 0.0011 | 0.7% | 4.05x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 430654 | 0.0357 | 0.0358 | 0.0003 | 0.8% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 40041 | 0.361 | 0.360 | 0.0028 | 0.8% | 7.42x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 298162 | 0.0486 | 0.0487 | 0.0004 | 0.9% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 242337 | 0.0524 | 0.0528 | 0.0008 | 1.5% | 2.72x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 755216 | 0.0192 | 0.0192 | 0.0002 | 0.9% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 54184 | 0.282 | 0.283 | 0.0031 | 1.1% | 4.02x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 219502 | 0.0700 | 0.0704 | 0.0017 | 2.4% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 19066 | 0.816 | 0.816 | 0.0122 | 1.5% | 5.65x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 97188 | 0.145 | 0.145 | 0.0013 | 0.9% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 22992 | 0.384 | 0.386 | 0.0045 | 1.2% | 1.48x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 47243 | 0.258 | 0.282 | 0.0589 | 20.9% ⚠ | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 18622 | 0.604 | 0.603 | 0.0066 | 1.1% | 1.87x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 42247 | 0.323 | 0.323 | 0.0054 | 1.7% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 177 | 47.14 | 47.20 | 0.446 | 0.9% | 3.89x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1259 | 12.13 | 12.10 | 0.144 | 1.2% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 148 | 92.20 | 120.22 | 60.15 | 50.0% ⚠ | 4.17x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 696 | 22.10 | 22.10 | 0.324 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 30388 | 0.258 | 0.257 | 0.0048 | 1.9% | 1.22x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 58189 | 0.211 | 0.212 | 0.0047 | 2.2% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 21152 | 0.587 | 0.589 | 0.0106 | 1.8% | 2.15x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 53624 | 0.274 | 0.274 | 0.0055 | 2.0% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 22311 | 0.146 | 0.147 | 0.0087 | 5.9% | 1.33x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 56135 | 0.195 | 0.194 | 0.0062 | 3.2% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 34619 | 0.444 | 0.445 | 0.0043 | 1.0% | 1.03x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 8500 | 0.457 | 0.532 | 0.231 | 43.5% ⚠ | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 10083 | 1.31 | 1.31 | 0.0166 | 1.3% | 2.70x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 28530 | 0.485 | 0.483 | 0.0074 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 225 | 7.15 | 7.37 | 0.500 | 6.8% | 3.58x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 7727 | 2.00 | 2.00 | 0.0370 | 1.9% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 8415 | 1.18 | 1.18 | 0.0156 | 1.3% | 4.98x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 67017 | 0.236 | 0.237 | 0.0064 | 2.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 66711 | 0.244 | 0.246 | 0.0040 | 1.6% | 4.99x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 314028 | 0.0490 | 0.0491 | 0.0005 | 1.1% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 14227 | 0.395 | 0.398 | 0.0106 | 2.7% | 4.38x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 169402 | 0.0902 | 0.0942 | 0.0118 | 12.5% ⚠ | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 391 | 33.73 | 33.86 | 0.656 | 1.9% | 5.04x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2272 | 6.69 | 6.69 | 0.135 | 2.0% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 240 | 62.82 | 63.01 | 0.551 | 0.9% | 5.35x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1185 | 11.74 | 11.81 | 0.143 | 1.2% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 35714 | 0.147 | 0.147 | 0.0043 | 3.0% | 4.14x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 412082 | 0.0354 | 0.0354 | 0.0003 | 0.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 22613 | 0.351 | 0.354 | 0.0056 | 1.6% | 7.16x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 310937 | 0.0490 | 0.0489 | 0.0004 | 0.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 235873 | 0.0277 | 0.0277 | 0.0008 | 3.0% | 1.42x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 629213 | 0.0194 | 0.0194 | 0.0003 | 1.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 30288 | 0.307 | 0.308 | 0.0059 | 1.9% | 4.37x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 221547 | 0.0704 | 0.0706 | 0.0011 | 1.6% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 9430 | 0.812 | 0.812 | 0.0162 | 2.0% | 5.56x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 105028 | 0.146 | 0.151 | 0.0126 | 8.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 129 | 32.14 | 32.23 | 0.372 | 1.2% | 5.05x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 2312 | 6.36 | 6.46 | 0.145 | 2.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 341 | 32.24 | 32.33 | 0.225 | 0.7% | 4.96x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2327 | 6.50 | 6.50 | 0.146 | 2.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 24 | 213.47 | 213.87 | 5.28 | 2.5% | 6.52x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 367 | 32.75 | 32.72 | 0.518 | 1.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4597 | 0.765 | 0.772 | 0.0246 | 3.2% | 5.28x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 102313 | 0.145 | 0.145 | 0.0012 | 0.8% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 19882 | 0.759 | 0.760 | 0.0074 | 1.0% | 5.14x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 104714 | 0.148 | 0.148 | 0.0024 | 1.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 15277 | 0.200 | 0.201 | 0.0060 | 3.0% | 4.07x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 302145 | 0.0490 | 0.0490 | 0.0008 | 1.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 72227 | 0.200 | 0.200 | 0.0027 | 1.3% | 4.13x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 298335 | 0.0483 | 0.0485 | 0.0006 | 1.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 1732 | 3.91 | 3.91 | 0.0502 | 1.3% | 2.68x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1432 | 10.47 | 10.55 | 0.216 | 2.0% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 780 | 8.14 | 8.19 | 0.130 | 1.6% | 2.17x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 932 | 17.70 | 17.75 | 0.291 | 1.6% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 1876 | 4.76 | 4.74 | 0.0481 | 1.0% | 2.60x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1141 | 12.39 | 12.34 | 0.164 | 1.3% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 237 | 2.59 | 2.67 | 0.205 | 7.7% | 3.21x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 902 | 8.34 | 8.41 | 0.363 | 4.3% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3029 | 1.59 | 1.57 | 0.0774 | 4.9% | 1.52x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 14487 | 1.05 | 1.06 | 0.0354 | 3.4% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 742 | 7.29 | 7.31 | 0.147 | 2.0% | 2.22x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 3406 | 3.28 | 3.27 | 0.0654 | 2.0% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 2590 | 2.59 | 2.59 | 0.0231 | 0.9% | 1.96x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 9439 | 1.33 | 1.32 | 0.0312 | 2.4% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 787 | 13.17 | 13.20 | 0.309 | 2.3% | 26.25x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 26035 | 0.502 | 0.501 | 0.0170 | 3.4% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 716 | 14.87 | 15.00 | 0.440 | 2.9% | 5.30x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 5284 | 2.81 | 2.82 | 0.0816 | 2.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 548 | 14.97 | 15.12 | 0.385 | 2.5% | 10.89x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 10410 | 1.37 | 1.38 | 0.0305 | 2.2% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 856 | 16.25 | 16.27 | 0.252 | 1.6% | 9.33x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 9066 | 1.74 | 1.74 | 0.0337 | 1.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 574 | 18.22 | 18.42 | 0.694 | 3.8% | 8.40x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 6180 | 2.17 | 2.17 | 0.0386 | 1.8% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 866 | 14.00 | 13.93 | 0.225 | 1.6% | 15.36x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 15600 | 0.911 | 1.11 | 0.476 | 42.8% ⚠ | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 968 | 14.79 | 14.77 | 0.375 | 2.5% | 13.59x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 10658 | 1.09 | 1.09 | 0.0181 | 1.7% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 11 | 11.72 | 13.38 | 4.05 | 30.2% ⚠ | 24.02x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 29512 | 0.488 | 0.486 | 0.0124 | 2.5% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 845 | 13.53 | 13.54 | 0.119 | 0.9% | 21.71x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 20288 | 0.623 | 0.619 | 0.0141 | 2.3% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 45 | 262.01 | 262.87 | 5.58 | 2.1% | 1.10x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 47 | 237.98 | 237.42 | 5.18 | 2.2% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 7 | 1,678.11 | 1,665.88 | 69.63 | 4.2% | 1.63x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 12 | 1,028.16 | 1,022.19 | 25.50 | 2.5% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 3 | 1,549.86 | 1,571.79 | 65.17 | 4.1% | 1.70x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 11 | 911.29 | 914.54 | 22.16 | 2.4% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 8046 | 1.80 | 1.80 | 0.0263 | 1.5% | 8.81x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 64457 | 0.205 | 0.205 | 0.0026 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 7882 | 1.96 | 1.97 | 0.0263 | 1.3% | 8.04x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 61677 | 0.244 | 0.243 | 0.0031 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 17182 | 0.783 | 0.785 | 0.0135 | 1.7% | 6.62x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 110044 | 0.118 | 0.119 | 0.0035 | 2.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 19816 | 0.768 | 0.771 | 0.0074 | 1.0% | 6.49x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 108868 | 0.118 | 0.119 | 0.0025 | 2.1% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 1249 | 11.79 | 11.93 | 0.473 | 4.0% | 4.05x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 3323 | 2.91 | 2.92 | 0.0884 | 3.0% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 2220 | 6.14 | 6.18 | 0.148 | 2.4% | 3.77x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 7814 | 1.63 | 1.63 | 0.0574 | 3.5% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 2446 | 6.09 | 6.13 | 0.0873 | 1.4% | 3.71x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 8020 | 1.64 | 1.64 | 0.0317 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 1512 | 9.77 | 10.78 | 2.70 | 25.1% ⚠ | 4.19x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 6338 | 2.33 | 2.34 | 0.0455 | 1.9% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 1544 | 9.86 | 9.84 | 0.101 | 1.0% | 3.33x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 4722 | 2.96 | 2.97 | 0.0467 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 906 | 17.00 | 17.03 | 0.286 | 1.7% | 3.83x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3426 | 4.44 | 4.44 | 0.0536 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 2670 | 5.50 | 5.52 | 0.0759 | 1.4% | 3.93x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 11073 | 1.40 | 1.39 | 0.0254 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 1648 | 8.82 | 8.85 | 0.120 | 1.4% | 3.65x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 6592 | 2.42 | 2.43 | 0.0414 | 1.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1141 | 12.96 | 12.92 | 0.114 | 0.9% | 3.53x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 4096 | 3.67 | 3.67 | 0.0524 | 1.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 583 | 19.24 | 19.35 | 0.289 | 1.5% | 1.80x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 419 | 34.63 | 39.18 | 8.43 | 21.5% ⚠ | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 147 | 22.84 | 23.35 | 1.26 | 5.4% | 1.65x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 379 | 37.74 | 37.79 | 0.905 | 2.4% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 133 | 18.96 | 19.29 | 0.959 | 5.0% | 1.81x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 490 | 34.23 | 34.22 | 0.360 | 1.1% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 569 | 26.06 | 26.07 | 0.920 | 3.5% | 6.75x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 3635 | 3.86 | 3.87 | 0.0719 | 1.9% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 184 | 51.40 | 51.00 | 1.95 | 3.8% | 3.16x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 858 | 16.26 | 16.47 | 0.634 | 3.8% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 129 | 50.98 | 51.72 | 1.50 | 2.9% | 1.83x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 473 | 27.90 | 27.92 | 0.397 | 1.4% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 827 | 18.62 | 18.65 | 0.329 | 1.8% | 1.19x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 785 | 15.64 | 15.77 | 0.402 | 2.5% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 312 | 49.74 | 49.80 | 1.20 | 2.4% | 1.19x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 403 | 41.64 | 43.85 | 7.24 | 16.5% ⚠ | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 399 | 35.21 | 35.39 | 0.900 | 2.5% | 1.50x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 710 | 23.52 | 24.81 | 4.04 | 16.3% ⚠ | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 592 | 16.40 | 16.24 | 0.448 | 2.8% | 1.16x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 948 | 14.09 | 14.15 | 0.331 | 2.3% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 196 | 40.41 | 40.48 | 0.928 | 2.3% | 1.21x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 351 | 33.49 | 33.67 | 0.569 | 1.7% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 376 | 30.35 | 30.51 | 0.701 | 2.3% | 1.42x slower | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 591 | 21.33 | 21.33 | 0.245 | 1.1% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 9315 | 0.828 | 0.833 | 0.0174 | 2.1% | 3.11x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 58299 | 0.267 | 0.269 | 0.0051 | 1.9% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5705 | 1.25 | 1.25 | 0.0271 | 2.2% | 4.76x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 46128 | 0.263 | 0.261 | 0.0060 | 2.3% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 7445 | 1.05 | 1.05 | 0.0115 | 1.1% | 1.57x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 21161 | 0.672 | 0.677 | 0.0225 | 3.3% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 6505 | 0.578 | 0.584 | 0.0108 | 1.8% | 3.83x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 101822 | 0.151 | 0.151 | 0.0031 | 2.0% | baseline | Reuses one parsed AST to isolate unparser cost. |

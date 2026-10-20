# CEL Benchmarking

This file is rewritten by:

```sh
pnpm --filter @protoutil/cel run benchmark
```

Generated at: `2026-09-24T03:43:33.489Z`

## Methodology

These are in-process microbenchmarks for the CEL frontend and public program API plus the `cel-go` reference implementation on the same machine. This package is measured through its **built output** in `dist`, the code published to consumers, rather than through its TypeScript sources: the test-time transform wraps every function in a name helper the shipped bundle does not carry, which understated evaluation throughput by roughly 1.8x. The benchmark script builds the package before running, so results always reflect the current sources. Core planning and evaluation reuse equivalent public programs and activations in both implementations. Diagnostic evaluation rows form a feature ladder from literals through activation lookup, dispatch, dynamic and protobuf attributes, indexing, and folds. Residual rows separately measure state-tracking partial evaluation, residual AST construction, and the combined round trip. Policy measurements use the same synchronized YAML sources and separately cover parsing, compilation and composition, optimized planning, and steady-state evaluation. Each policy program primes every prepared activation in round-robin order before policy evaluation samples begin. They are intended to provide a quick regression signal, not a universal cross-machine claim. Cross-runtime ratios are directional; changes in this package's own results over time are the primary regression signal.

### Reading these numbers

- **Ratios come from median per-operation latency**, not the mean. Eight samples are few enough that one garbage-collection or tier-up outlier moves a mean substantially while leaving the median intact.
- **`Spread`** is the coefficient of variation across a row's own samples. Rows above 10.0% are marked ⚠ and their ratios should not be read to two decimals.
- **Repeated runs of unmodified code differ by roughly 3% per row**, and occasionally more. Treat a change smaller than that as noise, and confirm any real change by re-running both sides.
- **Every scenario shares one process per implementation.** This makes call sites in the interpreter as polymorphic as they are in an application that uses many CEL features, which is deliberate: an optimization measured against a single expression in isolation can behave differently here, and this is the workload that decides.
- **The whole matrix moves together when the machine is busy.** Compare the `cel-go` columns across runs first; if they moved, the machine did, not the code.

- Runtime: `node v22.15.0`
- Go: `go1.26.2`
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
| 1 | `policy-eval` | nested_rule7 / valid / x=1 | 0.971 | 0.206 | 4.70x | +0.764 us |
| 2 | `eval-details` | diagnostic / list index | 0.222 | 0.0486 | 4.57x | +0.173 us |
| 3 | `policy-eval` | nested_rule7 / valid / x=2 | 1.10 | 0.247 | 4.47x | +0.856 us |
| 4 | `eval` | diagnostic / list index | 0.214 | 0.0482 | 4.44x | +0.166 us |
| 5 | `unparse` | macro comprehension | 1.10 | 0.249 | 4.41x | +0.848 us |
| 6 | `eval` | constant regex / compiled regex | 1.07 | 0.252 | 4.25x ⚠ | +0.821 us |
| 7 | `eval-details` | diagnostic / protobuf field | 0.598 | 0.144 | 4.14x | +0.454 us |
| 8 | `eval` | diagnostic / protobuf field | 0.587 | 0.146 | 4.02x | +0.441 us |
| 9 | `policy-eval` | nested_rule7 / valid / x=4 | 0.467 | 0.118 | 3.96x | +0.349 us |
| 10 | `eval` | protobuf field selection / baseline | 0.567 | 0.145 | 3.91x | +0.422 us |
| 11 | `policy-eval` | nested_rule7 / valid / x=3 | 0.472 | 0.121 | 3.90x | +0.351 us |
| 12 | `eval` | protobuf field selection / optimized | 0.569 | 0.147 | 3.88x | +0.423 us |
| 13 | `unparse` | scalar arithmetic | 0.504 | 0.142 | 3.55x | +0.362 us |
| 14 | `eval` | constant regex / baseline | 6.89 | 1.99 | 3.45x | +4.89 us |
| 15 | `eval-details` | diagnostic / binary call | 0.151 | 0.0484 | 3.12x | +0.103 us |

## Summary by operation

Median cel-go-relative cost across every scenario in each operation, so a stage-level regression is
visible without reading the full matrix.

| Operation | Scenarios | Median slower by | Best scenario | Worst scenario |
| --- | ---: | ---: | --- | --- |
| `unparse` | 4 | 3.27x slower | protobuf field selection (1.31x slower) | macro comprehension (4.41x slower) |
| `eval-details` | 9 | 2.95x slower | diagnostic / literal (2.56x slower) | diagnostic / list index (4.57x slower) |
| `eval` | 18 | 2.86x slower | diagnostic / literal (1.13x slower) | diagnostic / list index (4.44x slower) |
| `policy-eval` | 13 | 2.71x slower | unnest / divisible by 2 / empty-set (2.28x slower) | nested_rule7 / valid / x=1 (4.70x slower) |
| `plan` | 9 | 1.79x slower | constant regex / compiled regex (1.07x faster) | macro comprehension / runtime cost (2.36x slower) |
| `check` | 4 | 1.76x slower | protobuf field selection (1.54x slower) | constant regex (1.93x slower) |
| `policy-plan` | 3 | 1.63x slower | unnest (1.18x slower) | nested_rule7 (2.51x slower) |
| `partial-eval` | 3 | 1.46x slower | known branch pruning (1.04x slower) | macro pruning (1.63x slower) |
| `eval-state` | 9 | 1.38x slower | diagnostic / literal (1.31x faster) | diagnostic / fold full scan (2.55x slower) |
| `policy-compile` | 3 | 1.16x slower | nested_rule7 (1.18x faster) | unnest (1.32x slower) |
| `residual-roundtrip` | 3 | 1.11x faster | qualified attribute pruning (1.18x faster) | macro pruning (1.10x slower) |
| `residual` | 3 | 1.25x faster | known branch pruning (1.29x faster) | macro pruning (1.00x faster) |
| `compile` | 4 | 1.49x faster | constant regex (1.86x faster) | macro comprehension (1.01x faster) |
| `policy-parse` | 3 | 1.73x faster | nested_rule7 (1.89x faster) | required_labels (1.66x faster) |
| `parse` | 4 | 3.30x faster | scalar arithmetic (4.30x faster) | macro comprehension (2.24x faster) |

## Results

| Operation | Scenario | Implementation | Iterations | Median us/op | Mean us/op | Std dev us/op | Spread | Relative | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `check` | constant regex | `@protoutil/cel` | 3474 | 2.76 | 3.12 | 0.704 | 22.6% ⚠ | 1.93x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | constant regex | `cel-go` | 9053 | 1.43 | 1.45 | 0.0391 | 2.7% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `@protoutil/cel` | 526 | 16.88 | 16.82 | 0.408 | 2.4% | 1.91x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | macro comprehension | `cel-go` | 1999 | 8.84 | 8.86 | 0.207 | 2.3% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `@protoutil/cel` | 1234 | 5.63 | 5.65 | 0.132 | 2.3% | 1.54x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | protobuf field selection | `cel-go` | 4008 | 3.65 | 3.66 | 0.0675 | 1.8% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `@protoutil/cel` | 503 | 6.83 | 6.98 | 0.436 | 6.2% | 1.64x slower | Reuses one parsed AST and public environment to isolate checker cost. |
| `check` | scalar arithmetic | `cel-go` | 3281 | 4.17 | 4.17 | 0.0712 | 1.7% | baseline | Reuses one parsed AST and public environment to isolate checker cost. |
| `compile` | constant regex | `@protoutil/cel` | 2060 | 6.62 | 6.71 | 0.371 | 5.5% | 1.86x faster | Runs parse plus check through one public environment. |
| `compile` | constant regex | `cel-go` | 1245 | 12.33 | 12.25 | 0.217 | 1.8% | baseline | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `@protoutil/cel` | 419 | 26.63 | 26.69 | 1.34 | 5.0% | 1.01x faster | Runs parse plus check through one public environment. |
| `compile` | macro comprehension | `cel-go` | 645 | 26.81 | 26.82 | 0.558 | 2.1% | baseline | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `@protoutil/cel` | 1311 | 11.19 | 11.06 | 0.227 | 2.0% | 1.49x faster | Runs parse plus check through one public environment. |
| `compile` | protobuf field selection | `cel-go` | 851 | 16.69 | 16.66 | 0.467 | 2.8% | baseline | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `@protoutil/cel` | 1466 | 8.59 | 9.55 | 2.01 | 21.1% ⚠ | 1.49x faster | Runs parse plus check through one public environment. |
| `compile` | scalar arithmetic | `cel-go` | 914 | 12.75 | 12.78 | 0.363 | 2.8% | baseline | Runs parse plus check through one public environment. |
| `eval-details` | diagnostic / binary call | `@protoutil/cel` | 94003 | 0.151 | 0.152 | 0.0017 | 1.1% | 3.12x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / binary call | `cel-go` | 310311 | 0.0484 | 0.0485 | 0.0003 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `@protoutil/cel` | 65779 | 0.234 | 0.236 | 0.0030 | 1.3% | 2.71x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / dynamic map selection | `cel-go` | 181764 | 0.0863 | 0.0881 | 0.0040 | 4.5% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `@protoutil/cel` | 883 | 17.60 | 17.60 | 0.0841 | 0.5% | 2.74x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold early exit | `cel-go` | 2270 | 6.42 | 6.43 | 0.0755 | 1.2% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `@protoutil/cel` | 155 | 34.11 | 34.38 | 1.92 | 5.6% | 2.87x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / fold full scan | `cel-go` | 1284 | 11.89 | 11.90 | 0.118 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / identifier | `@protoutil/cel` | 121480 | 0.110 | 0.111 | 0.0020 | 1.8% | 3.11x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / identifier | `cel-go` | 424212 | 0.0354 | 0.0354 | 0.0002 | 0.7% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / list index | `@protoutil/cel` | 69350 | 0.222 | 0.222 | 0.0018 | 0.8% | 4.57x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / list index | `cel-go` | 308703 | 0.0486 | 0.0487 | 0.0004 | 0.8% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / literal | `@protoutil/cel` | 308445 | 0.0505 | 0.0505 | 0.0008 | 1.7% | 2.56x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / literal | `cel-go` | 785149 | 0.0197 | 0.0197 | 0.0002 | 1.0% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / member call | `@protoutil/cel` | 76868 | 0.201 | 0.201 | 0.0016 | 0.8% | 2.95x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / member call | `cel-go` | 224285 | 0.0681 | 0.0684 | 0.0009 | 1.3% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `@protoutil/cel` | 25664 | 0.598 | 0.597 | 0.0031 | 0.5% | 4.14x slower | Reuses one baseline program and activation while allocating public evaluation details. |
| `eval-details` | diagnostic / protobuf field | `cel-go` | 104125 | 0.144 | 0.145 | 0.0009 | 0.6% | baseline | Reuses one baseline program and activation while returning public evaluation details. |
| `eval-state` | diagnostic / binary call | `@protoutil/cel` | 28650 | 0.308 | 0.309 | 0.0023 | 0.7% | 1.30x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / binary call | `cel-go` | 60933 | 0.237 | 0.238 | 0.0037 | 1.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `@protoutil/cel` | 24963 | 0.432 | 0.433 | 0.0033 | 0.8% | 1.38x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / dynamic map selection | `cel-go` | 45262 | 0.312 | 0.313 | 0.0041 | 1.3% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `@protoutil/cel` | 218 | 30.79 | 30.70 | 0.266 | 0.9% | 2.53x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold early exit | `cel-go` | 1225 | 12.17 | 12.13 | 0.172 | 1.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `@protoutil/cel` | 269 | 57.00 | 57.19 | 0.371 | 0.6% | 2.55x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / fold full scan | `cel-go` | 670 | 22.39 | 22.37 | 0.313 | 1.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `@protoutil/cel` | 35173 | 0.210 | 0.212 | 0.0030 | 1.4% | 1.03x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / identifier | `cel-go` | 71968 | 0.204 | 0.205 | 0.0030 | 1.5% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `@protoutil/cel` | 29655 | 0.446 | 0.448 | 0.0070 | 1.6% | 1.72x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / list index | `cel-go` | 57680 | 0.259 | 0.259 | 0.0067 | 2.6% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `@protoutil/cel` | 22280 | 0.147 | 0.145 | 0.0040 | 2.8% | 1.31x faster | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / literal | `cel-go` | 80041 | 0.192 | 0.193 | 0.0060 | 3.1% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `@protoutil/cel` | 42913 | 0.359 | 0.358 | 0.0029 | 0.8% | 1.37x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / member call | `cel-go` | 54754 | 0.262 | 0.263 | 0.0047 | 1.8% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `@protoutil/cel` | 11428 | 1.08 | 1.08 | 0.0100 | 0.9% | 2.27x slower | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval-state` | diagnostic / protobuf field | `cel-go` | 27426 | 0.477 | 0.477 | 0.0017 | 0.4% | baseline | Reuses one state-tracking program and activation to isolate observer overhead. |
| `eval` | constant regex / baseline | `@protoutil/cel` | 217 | 6.89 | 7.20 | 0.474 | 6.6% | 3.45x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / baseline | `cel-go` | 8045 | 1.99 | 1.99 | 0.0440 | 2.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `@protoutil/cel` | 8891 | 1.07 | 1.08 | 0.0142 | 1.3% | 4.25x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | constant regex / compiled regex | `cel-go` | 56252 | 0.252 | 0.308 | 0.0888 | 28.8% ⚠ | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | diagnostic / binary call | `@protoutil/cel` | 103724 | 0.145 | 0.145 | 0.0013 | 0.9% | 2.99x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / binary call | `cel-go` | 307132 | 0.0485 | 0.0484 | 0.0002 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `@protoutil/cel` | 21239 | 0.225 | 0.228 | 0.0077 | 3.4% | 2.59x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / dynamic map selection | `cel-go` | 183551 | 0.0869 | 0.0873 | 0.0017 | 1.9% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `@protoutil/cel` | 535 | 17.78 | 17.76 | 0.187 | 1.1% | 2.74x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold early exit | `cel-go` | 2323 | 6.48 | 6.49 | 0.0849 | 1.3% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `@protoutil/cel` | 440 | 33.30 | 35.63 | 6.14 | 17.2% ⚠ | 2.80x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / fold full scan | `cel-go` | 1268 | 11.90 | 11.91 | 0.140 | 1.2% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `@protoutil/cel` | 50335 | 0.104 | 0.107 | 0.0047 | 4.4% | 2.95x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / identifier | `cel-go` | 412854 | 0.0352 | 0.0353 | 0.0004 | 1.1% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `@protoutil/cel` | 23725 | 0.214 | 0.216 | 0.0058 | 2.7% | 4.44x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / list index | `cel-go` | 311212 | 0.0482 | 0.0483 | 0.0002 | 0.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `@protoutil/cel` | 231304 | 0.0214 | 0.0216 | 0.0012 | 5.8% | 1.13x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / literal | `cel-go` | 787246 | 0.0189 | 0.0189 | 0.0001 | 0.4% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `@protoutil/cel` | 36348 | 0.195 | 0.195 | 0.0042 | 2.2% | 2.80x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / member call | `cel-go` | 221822 | 0.0697 | 0.0696 | 0.0010 | 1.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `@protoutil/cel` | 11982 | 0.587 | 0.598 | 0.0229 | 3.8% | 4.02x slower | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | diagnostic / protobuf field | `cel-go` | 102039 | 0.146 | 0.146 | 0.0007 | 0.5% | baseline | Reuses one baseline program and activation to expose incremental runtime feature cost. |
| `eval` | macro comprehension / baseline | `@protoutil/cel` | 151 | 16.15 | 16.28 | 0.433 | 2.7% | 2.50x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / baseline | `cel-go` | 2264 | 6.45 | 6.44 | 0.0775 | 1.2% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `@protoutil/cel` | 701 | 16.23 | 16.26 | 0.184 | 1.1% | 2.51x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / optimized | `cel-go` | 2283 | 6.47 | 6.47 | 0.0657 | 1.0% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `@protoutil/cel` | 38 | 96.18 | 97.98 | 5.15 | 5.3% | 2.92x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | macro comprehension / runtime cost | `cel-go` | 467 | 32.89 | 32.85 | 0.798 | 2.4% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `@protoutil/cel` | 4773 | 0.567 | 0.570 | 0.0188 | 3.3% | 3.91x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / baseline | `cel-go` | 102762 | 0.145 | 0.145 | 0.0009 | 0.6% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `@protoutil/cel` | 27034 | 0.569 | 0.572 | 0.0088 | 1.5% | 3.88x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | protobuf field selection / optimized | `cel-go` | 102279 | 0.147 | 0.147 | 0.0010 | 0.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `@protoutil/cel` | 16878 | 0.113 | 0.115 | 0.0072 | 6.3% | 2.34x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / baseline | `cel-go` | 309989 | 0.0483 | 0.0483 | 0.0002 | 0.5% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `@protoutil/cel` | 120476 | 0.125 | 0.126 | 0.0027 | 2.1% | 2.58x slower | Reuses one public program and activation to isolate steady-state evaluation. |
| `eval` | scalar arithmetic / optimized | `cel-go` | 310740 | 0.0483 | 0.0485 | 0.0003 | 0.7% | baseline | Reuses one planned program and activation to isolate steady-state evaluation. |
| `parse` | constant regex | `@protoutil/cel` | 2059 | 3.07 | 3.08 | 0.0146 | 0.5% | 3.39x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | constant regex | `cel-go` | 1450 | 10.40 | 10.40 | 0.177 | 1.7% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `@protoutil/cel` | 557 | 7.75 | 7.79 | 0.243 | 3.1% | 2.24x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | macro comprehension | `cel-go` | 949 | 17.37 | 17.39 | 0.266 | 1.5% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `@protoutil/cel` | 2128 | 4.01 | 4.03 | 0.0972 | 2.4% | 3.22x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | protobuf field selection | `cel-go` | 1233 | 12.90 | 13.25 | 1.01 | 7.6% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `@protoutil/cel` | 906 | 1.78 | 1.86 | 0.104 | 5.6% | 4.30x faster | Reuses one public environment to isolate steady-state parse throughput. |
| `parse` | scalar arithmetic | `cel-go` | 922 | 7.67 | 7.59 | 0.156 | 2.1% | baseline | Reuses one public environment to isolate steady-state parse throughput. |
| `partial-eval` | known branch pruning | `@protoutil/cel` | 3516 | 1.09 | 1.09 | 0.0328 | 3.0% | 1.04x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | known branch pruning | `cel-go` | 13512 | 1.05 | 1.05 | 0.0269 | 2.6% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `@protoutil/cel` | 741 | 5.16 | 5.22 | 0.161 | 3.1% | 1.63x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | macro pruning | `cel-go` | 4263 | 3.16 | 3.18 | 0.0482 | 1.5% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `@protoutil/cel` | 3068 | 1.84 | 1.82 | 0.0418 | 2.3% | 1.46x slower | Reuses one state-tracking partial program and inferred unknown activation. |
| `partial-eval` | qualified attribute pruning | `cel-go` | 13424 | 1.26 | 1.26 | 0.0265 | 2.1% | baseline | Reuses one state-tracking partial program and inferred unknown activation. |
| `plan` | constant regex / baseline | `@protoutil/cel` | 8133 | 0.945 | 0.944 | 0.0128 | 1.4% | 1.95x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / baseline | `cel-go` | 28204 | 0.485 | 0.486 | 0.0104 | 2.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | constant regex / compiled regex | `@protoutil/cel` | 3185 | 2.71 | 2.71 | 0.0509 | 1.9% | 1.07x faster | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | constant regex / compiled regex | `cel-go` | 5576 | 2.89 | 2.87 | 0.0744 | 2.6% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / baseline | `@protoutil/cel` | 2127 | 2.05 | 2.03 | 0.0486 | 2.4% | 1.48x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / baseline | `cel-go` | 9998 | 1.39 | 1.39 | 0.0237 | 1.7% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / optimized | `@protoutil/cel` | 3502 | 3.24 | 3.25 | 0.0331 | 1.0% | 1.95x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / optimized | `cel-go` | 9007 | 1.66 | 1.66 | 0.0313 | 1.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | macro comprehension / runtime cost | `@protoutil/cel` | 905 | 5.04 | 5.01 | 0.421 | 8.4% | 2.36x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | macro comprehension / runtime cost | `cel-go` | 6608 | 2.14 | 2.13 | 0.0483 | 2.3% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / baseline | `@protoutil/cel` | 4690 | 1.35 | 1.35 | 0.0282 | 2.1% | 1.45x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / baseline | `cel-go` | 13795 | 0.932 | 0.929 | 0.0179 | 1.9% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | protobuf field selection / optimized | `@protoutil/cel` | 6881 | 1.96 | 1.95 | 0.0364 | 1.9% | 1.79x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | protobuf field selection / optimized | `cel-go` | 11330 | 1.09 | 1.10 | 0.0345 | 3.1% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / baseline | `@protoutil/cel` | 12 | 0.668 | 0.675 | 0.0185 | 2.7% | 1.41x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / baseline | `cel-go` | 27783 | 0.473 | 0.471 | 0.0074 | 1.6% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `plan` | scalar arithmetic / optimized | `@protoutil/cel` | 4784 | 1.13 | 1.13 | 0.0177 | 1.6% | 1.89x slower | Reuses one checked AST and environment to isolate public program planning cost. |
| `plan` | scalar arithmetic / optimized | `cel-go` | 25932 | 0.601 | 0.600 | 0.0103 | 1.7% | baseline | Reuses one checked AST and environment to isolate program planning cost. |
| `policy-compile` | nested_rule7 | `@protoutil/cel` | 60 | 200.83 | 203.01 | 5.53 | 2.7% | 1.18x faster | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | nested_rule7 | `cel-go` | 51 | 237.29 | 238.33 | 5.36 | 2.2% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `@protoutil/cel` | 8 | 1,147.86 | 1,156.57 | 46.96 | 4.1% | 1.16x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | required_labels | `cel-go` | 14 | 990.35 | 992.51 | 15.30 | 1.5% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `@protoutil/cel` | 5 | 1,207.75 | 1,237.10 | 65.46 | 5.3% | 1.32x slower | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-compile` | unnest | `cel-go` | 16 | 917.58 | 915.81 | 12.45 | 1.4% | baseline | Reuses one parsed policy and configured environment to isolate policy compilation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `@protoutil/cel` | 14611 | 0.971 | 0.977 | 0.0111 | 1.1% | 4.70x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=1 | `cel-go` | 72126 | 0.206 | 0.207 | 0.0014 | 0.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `@protoutil/cel` | 13712 | 1.10 | 1.10 | 0.0096 | 0.9% | 4.47x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=2 | `cel-go` | 63702 | 0.247 | 0.247 | 0.0067 | 2.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `@protoutil/cel` | 32777 | 0.472 | 0.471 | 0.0050 | 1.1% | 3.90x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=3 | `cel-go` | 123232 | 0.121 | 0.121 | 0.0022 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `@protoutil/cel` | 31611 | 0.467 | 0.467 | 0.0042 | 0.9% | 3.96x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | nested_rule7 / valid / x=4 | `cel-go` | 128850 | 0.118 | 0.119 | 0.0026 | 2.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `@protoutil/cel` | 1951 | 7.84 | 7.88 | 0.171 | 2.2% | 2.74x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / invalid / env | `cel-go` | 4971 | 2.86 | 2.87 | 0.0445 | 1.6% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `@protoutil/cel` | 3739 | 4.15 | 4.17 | 0.0972 | 2.3% | 2.62x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / env | `cel-go` | 10619 | 1.58 | 1.58 | 0.0118 | 0.7% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `@protoutil/cel` | 2996 | 4.12 | 4.12 | 0.0512 | 1.2% | 2.61x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / missing / experiment | `cel-go` | 8316 | 1.58 | 1.58 | 0.0188 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `@protoutil/cel` | 2417 | 6.29 | 6.30 | 0.0866 | 1.4% | 2.76x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | required_labels / valid / matching | `cel-go` | 6435 | 2.28 | 2.29 | 0.0298 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `@protoutil/cel` | 2296 | 6.59 | 6.60 | 0.0902 | 1.4% | 2.28x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / empty-set | `cel-go` | 4910 | 2.90 | 2.90 | 0.0508 | 1.8% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `@protoutil/cel` | 1306 | 11.79 | 11.84 | 0.165 | 1.4% | 2.71x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / false | `cel-go` | 3790 | 4.35 | 4.35 | 0.0570 | 1.3% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `@protoutil/cel` | 4095 | 3.71 | 3.70 | 0.0533 | 1.4% | 2.71x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 2 / true | `cel-go` | 12400 | 1.37 | 1.36 | 0.0160 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `@protoutil/cel` | 2530 | 5.99 | 5.99 | 0.0634 | 1.1% | 2.49x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / divisible by 4 / true | `cel-go` | 5592 | 2.41 | 2.41 | 0.0281 | 1.2% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `@protoutil/cel` | 1673 | 8.88 | 8.87 | 0.120 | 1.4% | 2.44x slower | Reuses one optimized policy program and prepared activation. |
| `policy-eval` | unnest / power of 6 / true | `cel-go` | 3940 | 3.64 | 3.67 | 0.0875 | 2.4% | baseline | Reuses one optimized policy program and prepared activation. |
| `policy-parse` | nested_rule7 | `@protoutil/cel` | 469 | 19.54 | 19.55 | 0.252 | 1.3% | 1.89x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | nested_rule7 | `cel-go` | 533 | 36.90 | 36.93 | 0.884 | 2.4% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `@protoutil/cel` | 238 | 23.02 | 23.09 | 0.509 | 2.2% | 1.66x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | required_labels | `cel-go` | 400 | 38.19 | 38.32 | 0.938 | 2.4% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `@protoutil/cel` | 108 | 19.87 | 19.77 | 1.05 | 5.3% | 1.73x faster | Parses the synchronized upstream YAML policy source. |
| `policy-parse` | unnest | `cel-go` | 430 | 34.45 | 34.49 | 0.291 | 0.8% | baseline | Parses the synchronized upstream YAML policy source. |
| `policy-plan` | nested_rule7 | `@protoutil/cel` | 1367 | 9.49 | 9.50 | 0.170 | 1.8% | 2.51x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | nested_rule7 | `cel-go` | 3174 | 3.78 | 3.78 | 0.0533 | 1.4% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `@protoutil/cel` | 398 | 25.85 | 25.89 | 0.495 | 1.9% | 1.63x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | required_labels | `cel-go` | 832 | 15.90 | 15.87 | 0.228 | 1.4% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `@protoutil/cel` | 123 | 33.25 | 33.61 | 1.18 | 3.5% | 1.18x slower | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `policy-plan` | unnest | `cel-go` | 495 | 28.07 | 28.16 | 0.484 | 1.7% | baseline | Reuses one compiled policy AST and environment to isolate optimized planning. |
| `residual-roundtrip` | known branch pruning | `@protoutil/cel` | 1105 | 14.03 | 14.19 | 0.581 | 4.1% | 1.11x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | known branch pruning | `cel-go` | 904 | 15.63 | 15.72 | 0.378 | 2.4% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `@protoutil/cel` | 406 | 39.21 | 39.60 | 1.02 | 2.6% | 1.10x slower | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | macro pruning | `cel-go` | 419 | 35.76 | 35.92 | 0.378 | 1.1% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `@protoutil/cel` | 717 | 19.80 | 19.91 | 0.300 | 1.5% | 1.18x faster | Measures partial evaluation followed by residual AST construction. |
| `residual-roundtrip` | qualified attribute pruning | `cel-go` | 679 | 23.35 | 23.32 | 0.351 | 1.5% | baseline | Measures partial evaluation followed by residual AST construction. |
| `residual` | known branch pruning | `@protoutil/cel` | 717 | 11.46 | 11.46 | 0.261 | 2.3% | 1.29x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | known branch pruning | `cel-go` | 1085 | 14.73 | 14.85 | 0.206 | 1.4% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `@protoutil/cel` | 289 | 32.20 | 32.17 | 0.279 | 0.9% | 1.00x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | macro pruning | `cel-go` | 460 | 32.26 | 32.02 | 0.554 | 1.7% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `@protoutil/cel` | 572 | 16.67 | 16.71 | 0.593 | 3.6% | 1.25x faster | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `residual` | qualified attribute pruning | `cel-go` | 611 | 20.79 | 20.83 | 0.307 | 1.5% | baseline | Reuses one evaluated state to isolate prune, render, parse, and re-check cost. |
| `unparse` | constant regex | `@protoutil/cel` | 9499 | 0.799 | 0.980 | 0.316 | 32.3% ⚠ | 3.03x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | constant regex | `cel-go` | 60604 | 0.264 | 0.264 | 0.0033 | 1.2% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `@protoutil/cel` | 5951 | 1.10 | 1.10 | 0.0260 | 2.4% | 4.41x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | macro comprehension | `cel-go` | 59089 | 0.249 | 0.250 | 0.0031 | 1.3% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `@protoutil/cel` | 9318 | 0.857 | 0.852 | 0.0165 | 1.9% | 1.31x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | protobuf field selection | `cel-go` | 22628 | 0.656 | 0.660 | 0.0172 | 2.6% | baseline | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `@protoutil/cel` | 5809 | 0.504 | 0.504 | 0.0180 | 3.6% | 3.55x slower | Reuses one parsed AST to isolate unparser cost. |
| `unparse` | scalar arithmetic | `cel-go` | 108328 | 0.142 | 0.143 | 0.0030 | 2.1% | baseline | Reuses one parsed AST to isolate unparser cost. |

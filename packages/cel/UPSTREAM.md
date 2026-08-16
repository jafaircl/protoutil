# Upstream Parity

`@protoutil/cel` is a TypeScript port of [cel-go][cel-go]. This file records
which upstream revision the port tracks, and what remains outstanding between
that revision and upstream `master`.

## Current parity

| Upstream                 | Pinned ref              | Commit    | Released   |
| ------------------------ | ----------------------- | --------- | ---------- |
| [cel-go][cel-go]         | `master` (post-v0.31.0) | `ef24047` | 2026-08-14 |
| [cel-spec][cel-spec]     | `v0.25.3`               | —         | —          |
| [cel-policy][cel-policy] | `main`                  | `c531abc` | —          |

The port is level with cel-go `master` as of `ef24047` and with cel-policy
`main` as of `c531abc`. Every commit in `a492a70..ef24047` has been ported,
verified as already present, or recorded below with an explicit disposition.

### Where the pin lives

The refs above are hard-coded as `defaultRef` constants in the sync tools:

- [scripts/cel-go-test-sync/main.go:25](scripts/cel-go-test-sync/main.go#L25) — cel-go `ef24047`
- [scripts/cel-go-env-testdata-sync/main.go:19](scripts/cel-go-env-testdata-sync/main.go#L19) — cel-go `ef24047`
- [scripts/cel-conformance-sync/main.go:25](scripts/cel-conformance-sync/main.go#L25) — cel-spec `v0.25.3`
- [scripts/cel-policy-sync/main.go:19](scripts/cel-policy-sync/main.go#L19) — cel-policy `c531abc`

The policy conformance dashboard cites the same cel-policy revision from
`policyRevision` in [src/policy.spec.ts](src/policy.spec.ts).

Bumping parity means updating this file *and* every constant above together.
See [Consolidate the version pin](#consolidate-the-version-pin) for the proposal
to make that a single source of truth.

The benchmark companion module resolves cel-go through a `replace` directive
pointing at `.tmp/cel-go-upstream`, so it compiles against whatever the sync
tools last checked out. Its `require` version is kept in step by hand:
[scripts/benchmark-cel-go/go.mod](scripts/benchmark-cel-go/go.mod).

## Test fixtures are synced, never hand-written

Upstream test cases are extracted mechanically. **Do not copy upstream test
cases by hand.** After bumping a pin, run:

```sh
pnpm --filter @protoutil/cel run sync:testdata
```

This regenerates `testdata/cel-go/`, `testdata/conformance/`, and
`testdata/policy/` from the pinned checkouts, then runs `sync:format` so
[biome](../../biome.json) is the only formatter that touches `testdata/`. The
Go tools emit their own JSON indentation; without that final pass the two
formatters fight and every sync produces spurious churn. The pipeline is
idempotent — a second run yields no diff.

Specs consume the extracted tables through `syncedCases(...)`. Where a case's
input is Go-specific (`json.Number`, `float32`, `reflect.Value`, typed-nil
pointers), the spec maps the case name to a TypeScript analogue or marks it
`goOnly` and skips it, so the case list itself still tracks upstream.

---

## Changes adopted in this sync

cel-go `a492a70..ef24047`, cel-spec `v0.25.2..v0.25.3`, cel-policy
`40bf366..c531abc`.

### Behavioral fixes

| Upstream  | Change | Port location |
| --------- | ------ | ------------- |
| `424f954` | Shorthand type specifier accepts `\t`, `\n`, `\r` (#1411) | `isWhitespace()` in [common/env/env.ts](src/common/env/env.ts) |
| `7c1df6b` | Reject out-of-range timezone offset hours (#1391) | `parseTimezoneOffsetMinutes` in [common/types/timestamp.ts](src/common/types/timestamp.ts) |
| `3224325` | `optMap` / `optFlatMap` bind a non-ident target to `@target` (#1387) | `expandOptionalMap` in [cel/library.ts](src/cel/library.ts) |
| `b74d303` | Fold list concat expressions (#1406) | [cel/folding.ts](src/cel/folding.ts) |

Notes:

- **`7c1df6b`** — the port captures the sign separately, so upstream's signed
  `hr < -23 || hr > 23` guard collapses to a single `hours > 23` check on the
  unsigned magnitude. Upstream's distinct messages for both the hours and
  minutes range errors were adopted.
- **`3224325`** — a macro expansion change, so it is visible in the checked AST
  and in evaluation count. A target with side effects is no longer evaluated
  twice.
- **`b74d303`** — the `maybePruneBranches` Add case already existed. The two
  missing halves were added: the `constantCallMatcher` `Add`/List/List clause,
  so a concat whose *elements* are non-constant still folds structurally, and a
  planner-failure skip in `tryFold` matching upstream's new `errCannotFold`
  sentinel.

### New API surface

| Upstream  | Change | Port location |
| --------- | ------ | ------------- |
| `b6027c4` | `ParseTimestamp` multi-format helper (#1414) | `parseTimestamp` in [common/types/timestamp.ts](src/common/types/timestamp.ts) |
| `ef24047` | Aggregate size computation (#1404) | [common/types/size-calc.ts](src/common/types/size-calc.ts), [common/types/aggregate-sizer.ts](src/common/types/aggregate-sizer.ts) |
| `931e003` | JWT data types, parse, and claim helpers (#1415) | [ext/jwt.ts](src/ext/jwt.ts) |

Notes:

- **`b6027c4`** — Go's `int`/`int32`/`int64` collapse to `bigint` and
  `float32`/`float64` to `number`; `json.Number` has no TypeScript analogue, and
  a numeric string reaches the same parsing path. `isStrictRFC3339` moved from
  `common/types/string.ts` to `common/types/timestamp.ts` so both callers share
  one definition.
- **`ef24047`** — `SizeCalculator` carries the same depth (5) and traversal
  (10,000) limits, saturating to `MAX_UINT32`. `aggregateSize` is implemented on
  `BaseList` (memoized, invalidated on mutation), `ConcatList` (delegates to its
  segments), `BaseMap`, `protoObj`, and `Optional`. Upstream's `reflect.Value`
  and `protoreflect.*` traversal is replaced by protobuf-es reflection plus
  native JS shape inspection. `protoObj` sizes the *adapted* CEL value of each
  set field so list and map fields route through their own implementations, and
  `ReflectMessage` iterates descriptor fields filtered by `isSet` — walking the
  plain message object instead would count every materialized proto3 default.
- **`931e003`** — upstream keeps this in its own Go submodule because of the
  extra dependency edge; the port has no such edge, so it sits with the other
  extensions and is exported from `@protoutil/cel/ext`. Two divergences, both
  forced by the port's shape:
  - `Token` is itself a CEL value rather than a Go struct read through
    `types.NewNativeType`. cel-go captures the environment's type adapter with
    an `EnvOption` closure and adapts the token with it; the port's `EnvOptions`
    is a plain object with no such hook, so a token adapted by the *default*
    adapter would decay into a map keyed by TypeScript property names. Making
    `Token` a value keeps its claims readable through any adapter. Its field
    types are still described to the checker, through the new
    `EnvOptions.nativeTypes` option and `Registry.ensureNativeTypes`.
  - `JwtOptions.adapter` replaces the captured environment adapter for custom
    claim values only. Claims decoded from a token string are plain JSON, which
    the default adapter already handles.

  Upstream's `TestClaimsCustomTypes` rows for `json.Number` and
  `json.RawMessage` decoding failures are skipped as `goOnly`: a claim which
  would fail their deferred decoding cannot survive `JSON.parse`.

### cel-spec `v0.25.2` → `v0.25.3`

- New `lists_ext` conformance suite (52 cases). Fixtures are auto-discovered by
  [conformance.spec.ts](src/conformance.spec.ts); the suite needed the `lists`
  extension wired into `extensionSuites` and `conformanceLibraries`.
- `timestamps.textproto` gained out-of-range epoch-int → timestamp cases.

Conformance is back to **100% (2505/2505)** with 3 pre-existing documented skips.

### cel-policy `40bf366` → `c531abc`

Four commits, all one feature: **aggregate semantics for the Policy Compiler**.

```
c531abc Add aggregate policy test cases to bundled tests.
01bcc1c Consolidate emit to output for aggregate policies
57ee86f Update README.md to include aggregate semantics
ba3a185 Add aggregate semantics to Policy Compiler
```

A rule may now use an `aggregate` block instead of `match`: every choice is
evaluated and the matching outcomes are collected into a `list(T)`, where an
unmatched aggregate is `[]` rather than `optional.none()`. See
[policy/README.md](src/policy/README.md#aggregate) for the authoring-level
description and [glossary.md](../../glossary.md#policy-evaluation-semantics)
for the terms.

Ported across [policy/parser.ts](src/policy/parser.ts) (the `aggregate` tag and
`Rule.semantic`), [policy/compiler.ts](src/policy/compiler.ts) (result type,
optionality, and the aggregate-specific validations) and
[policy/composer.ts](src/policy/composer.ts) (`optimizeAggregateRule`,
`optimizeRuleAsElements`).

Notes:

- **cel-policy publishes no implementation.** The four commits carry the README
  and ~812 lines of conformance testdata; cel-go `master` at `ef24047` has no
  `aggregate` in `policy/`. The port is written against the README and the
  conformance fixtures, so a later cel-go release may differ in details the
  fixtures do not pin down.
- A rule nested under an aggregate choice is composed as the *list of elements*
  it contributes, not as an optional which is then unwrapped. This is what
  prunes an unmatched nested rule, and it avoids evaluating the nested rule
  twice to test and then read its optional.
- Aggregate output-type agreement is checked against the *preceding* choice and
  reports every disagreement, where the first-match check compares against the
  first choice and stops at the first disagreement. The
  `aggregate_heterogeneous_outputs` fixture pins the aggregate behavior: it
  expects `map(string, string)` to be reported against `int`, not against the
  `string` of the first choice.
- `condition: "false"` is rejected only in an aggregate choice
  (`condition is always false`), matching the constraint upstream documents for
  `aggregate` and not for `match`. A folded constant such as `1 == 2` is not
  flagged.

Conformance is **100% (77/77)** across 37 fixture suites.

### Latent port bugs the new fixtures surfaced

Both were pre-existing defects in the port, not upstream changes.

1. **`distinct()` did not deduplicate most types.** `distinctList` in
   [ext/lists.ts](src/ext/lists.ts) compared with `equal(...) === True`, a
   *reference identity* check against the `Bool` singleton. Only `Int`,
   `Double`, `String`, and `Bool` return that singleton — `Uint`, `Bytes`,
   `Duration`, `Timestamp`, `Type`, `Null`, and `Optional` all return a fresh
   `new Bool(...)`, so `distinct()` silently returned the input unchanged for
   those types. Now compares by value.

   Other `=== True` / `=== False` identity comparisons remain in
   [ext/sets.ts](src/ext/sets.ts), [ext/comprehensions.ts](src/ext/comprehensions.ts),
   and [interpreter/prune.ts](src/interpreter/prune.ts). Those operate on
   `iterator.hasNext()`, which does return the singletons, so they are correct
   today — but the pattern is fragile and worth a sweep.

2. **`timestamp(int)` had no range guard.** `Int.convertToType(TimestampType)`
   in [common/types/int.ts](src/common/types/int.ts) constructed a timestamp
   from any int64, so `timestamp(253402300800)` produced a bogus value instead
   of a range error. Now guarded by `minUnixTime`/`maxUnixTime` returning
   `celErrTimestampOverflow`, matching `common/types/int.go:191`.

### Tooling fixes

- **`cel-conformance-sync` was broken and silently unused.** Its
  `wrapperProtoPath` still pointed at `proto/protoutil/cel/v1/conformance.proto`,
  which moved to `packages/testing/src/proto/...` when the testing schemas were
  split into their own package (commit `866a12d`). Every run failed with
  `buf build failed: no .proto files were targeted`. Fixed the const and
  `defaultProtoDir`, and the `-proto` argument in `package.json`.
- **Two formatters were competing over `testdata/`.** Added `sync:format` as the
  final step of `sync:testdata`, and raised `files.maxSize` in
  [biome.json](../../biome.json) to 8 MiB so the 1 MB
  `cel-go-test-cases.json` is no longer skipped for size.
- Root [go.mod](../../go.mod) no longer requires cel-go at all — `go mod tidy`
  showed nothing in that module depends on it.

---

## Verified already present (no action needed)

| Upstream  | Change | Why no port change |
| --------- | ------ | ------------------ |
| `2cf1626` | "Disabling declarations when using inherited declarations" (#1405) | The port's `cel.Env` rebuilds its checker and re-filters `isDeclarationDisabled()` on every init rather than sharing copy-on-write declarations with a parent, so the bug cannot arise. Verified: a declaration-disabled function stays undeclared in both a base env and an `extend()`ed child. |
| `5e21930` | Respect composed adapter for unregistered structs (#1384) | The port already gates native-object wrapping on a registry hit — `nativeToValue` requires a `$celTypeName` marker *and* a registered descriptor, falling through to the composed adapter otherwise. |
| `8c1485e` | Documented default max for `range` (#1392) | Doc-only; port value already correct at [ext/lists.ts](src/ext/lists.ts). |
| `8bbb639` | Fix the expression limit node test (#1390) | Upstream test-only; picked up by `cel-go-test-sync`. |
| `fa407aa` | Regex program plan size controls (#1383) | Ported ahead of the previous pin. |

## Intentionally skipped

| Upstream  | Change | Rationale |
| --------- | ------ | --------- |
| `9d5baaf`, `2cf1626` | Program plan optimizations, env copy-on-write (#1399, #1405) | Go allocation tuning — dispatcher reuse, copy-on-write registry internals. No TypeScript analogue. The one semantic fix in `2cf1626` is covered above. |
| `c15365a`, `ab72257`, `f10a2e6` | Native type consolidation and reflection tuning (#1393, #1396, #1400) | Moves Go-struct reflection between files and optimizes `reflect` paths. The port adapts plain JS objects through explicit descriptors; nothing transfers. |
| `f74ac42` | Go-native JSON type support in `NativeToValue` (#1402) | `json.Number` and Go `any` have no TypeScript analogue. |
| `ba6c27e` | Self-describing, self-adapting struct types (#1395) | A genuine new API concept, but the port's `$celTypeName` marker plus explicit `nativeType`/`nativeField` descriptors already covers the use case. Porting Go's self-description protocol would add a second, redundant mechanism. Revisit only if a concrete need appears. |
| `1a53cb7` | Release tag automation for Go submodules (#1401) | Upstream CI only. |

---

## Outstanding

### The cel-go coverage ledger regressed against the pinned checkout

[testdata/cel-go/coverage-ledger.md](testdata/cel-go/coverage-ledger.md) was
last generated against an older checkout than the pinned `ef24047`.
Regenerating it reports 110 missing upstream test functions rather than 37. The
new entries are pre-existing gaps this sync surfaced, not regressions:

- `common/types/native_test.go` (23) and `common/types/provider_test.go` (36) —
  the test files upstream's native-type consolidation (`c15365a`, `ab72257`,
  `f10a2e6`) and env copy-on-write (`2cf1626`) moved or added. The port covers
  the native-type behavior under the old `ext/native_test.go/...` keys, which
  the ledger matches literally and therefore counts as missing.
- `common/types/size_calc_test.go` and the `*CalculateSize` rows — synced with
  `ef24047` but keyed to the upstream files the port does not mirror one-to-one.
- Four `cel/env_test.go` concurrency tests, which have no analogue in a
  single-threaded runtime.

Deciding which of these deserve real specs, and which should be recorded as
deliberate skips, is its own pass.

### Consolidate the version pin

The same versions live in four Go constants plus this document. Proposal: add
`packages/cel/upstream.json` —

```json
{
  "cel-go": { "repo": "https://github.com/google/cel-go.git", "ref": "ef240479443ae9bbf89edd93430b1be2173350a7" },
  "cel-spec": { "repo": "https://github.com/cel-expr/cel-spec.git", "ref": "v0.25.3" },
  "cel-policy": { "repo": "https://github.com/cel-expr/cel-policy.git", "ref": "c531abcf97d3bd910b8ac9a106eda42ce9d1bec9" }
}
```

— have each sync tool read its default `-ref` from it, and have this document
and `benchmark-cel-go/go.mod` cite it. A CI job can then compare the pinned refs
against upstream releases and open an issue when they drift, so the next
catch-up is measured in commits rather than reconstructed from a reflog.

[cel-go]: https://github.com/google/cel-go
[cel-spec]: https://github.com/cel-expr/cel-spec
[cel-policy]: https://github.com/cel-expr/cel-policy

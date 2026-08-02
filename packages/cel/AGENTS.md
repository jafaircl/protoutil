# AGENTS.md

## Scope

These instructions apply to every change under `packages/cel`.

## Read This First

These rules are mandatory. They are not suggestions.

Before writing code in `packages/cel`, an agent must:

1. Read this file.
2. Identify the matching cel-go file, test, or control path.
3. Identify which layer owns the behavior.
4. Make the change at that layer.

If any of those are unclear, stop and inspect cel-go before editing.

If a requested change would require violating this file, stop and tell the user instead of making the change anyway.

## Top Priorities

1. Preserve semantic parity with cel-go.
2. Preserve cel-go structure, seams, naming, and control flow where practical.
3. Keep the package isomorphic and browser-safe.
4. Fix bugs at the layer where they originate.
5. Preserve or port upstream tests and comments unless a rule below says otherwise.

## Required Behavior

- Do not invent local architecture when a cel-go counterpart already exists.
- Keep local files and module boundaries aligned with the corresponding cel-go files and seams.
- Preserve cel-go implementation structure by default. Only simplify when the Go pattern is mechanical ceremony with no semantic value in TypeScript.
- If a Go API uses functional options, convert to a plain TypeScript options object.
- If a faithful upstream identifier violates local tooling, allow the smallest rename needed to satisfy the tool. Prefer local aliasing or narrowly scoped renames over structural changes.
- Keep the library isomorphic. Do not introduce Node-only runtime assumptions into shipped CEL behavior.
- Prefer browser-friendly runtime choices when they preserve cel-go behavior and materially reduce dependency weight, startup cost, or bundle size.

## Comments And Documentation

- Preserve upstream cel-go comments when porting unless the comment is incorrect after translation or is Go-tooling-only noise.
- Do not carry upstream TODO comments by default. Keep a TODO only when it reflects an intentional, still-relevant local follow-up.
- New public functions, classes, methods, constants, interfaces, and types must include JSDoc comments.
- Non-obvious control flow must include clear inline comments.
- Be especially explicit around parser, checker, planner, interpreter, activation, attribute, dispatch, optional-value, unknown/error propagation, and protobuf behavior.

## Protobuf Rules

- Use `@bufbuild/protobuf` descriptors, `create()`, `createRegistry()`, and generated schemas when they provide needed protobuf behavior, normalization, or safety.
- When the exact generated message shape is already known and valid, prefer directly composing the generated message object instead of paying unnecessary `create()` overhead.
- Keep protobuf well-known types as protobuf well-known types. Do not replace timestamps, durations, wrappers, `Struct`, `Value`, or related types with plain JavaScript objects when Buf or repo helpers already provide the protobuf-native form.
- Prefer existing helper surfaces, especially `@protoutil/core/wkt` and `@bufbuild/protobuf/wkt`, before adding local timestamp, duration, or WKT conversion logic in `packages/cel`.
- Do not use magic numbers for protobuf descriptor kinds, scalar tags, enum values, trait masks, or similar protocol/runtime constants when a named constant or enum is available.
- Before adding any protobuf shim, alias, or compatibility wrapper, search `src/gen` for an existing generated schema or message type.
- If the needed schema is not present in `src/gen`, stop and ask the user whether it should be brought in from the proper source. Do not hide the gap behind a local workaround.
- Do not recreate `src/common/types/pb/equal.ts`.

## Boundary Rules

- Fix bugs in the layer where they originate.
- Do not compensate downstream for upstream bugs.
- Do not patch lower layers to absorb parser, checker, or planner mistakes from higher-confidence source layers.
- If the failure belongs to parser, fix parser.
- If the failure belongs to checker, fix checker.
- If the failure belongs to runtime or interpreter, fix runtime or interpreter.

## Testing Rules

- Follow TDD.
- Use synced cel-go tests and conformance tests as the acceptance signal.
- For any ported file, port the corresponding cel-go tests.
- Bring over table-based cel-go tests with the sync script.
- Each spec should execute the synced cases for its upstream file. Example: `common/types/types.spec.ts` should cover keys beginning with `common/types/types_test.go/`.
- Use the synced-testdata pattern exactly. Specs should load rows through shared helpers from `packages/cel/testdata/cel-go/cel-go-test-cases.json` and iterate rows keyed by exact upstream test names.
- The canonical synced-testdata entrypoint is `src/common/spec-helpers.ts`.
- Package-local helper modules may add expression/value resolvers, but they must delegate case loading back to `src/common/spec-helpers.ts`.
- Do not create bespoke per-spec JSON loaders.
- Do not create renamed passthrough loaders such as `syncedTypeCases` or `syncedPbCases`.
- Do not add resolver switches that only hard-code a narrow set of rows from one test. Extend shared decoding generically instead.
- Check `packages/cel/testdata/cel-go/cel-go-test-cases.report.json`, but treat it as incomplete. Inspect the upstream cel-go test source directly before deciding a file's test coverage is complete.
- For upstream tests that are not table-based, write local manual specs near the corresponding implementation.
- Keep upstream coverage in the canonical spec file for the ported implementation. Do not create parallel audit-only spec files.
- Name local tests after the exact upstream cel-go test names whenever practical.
- If an upstream test cannot be ported yet, add a TODO in the local spec naming the exact upstream test and the blocker. Do not silently omit it.
- Do not introduce fixture-specific behavior to make tests pass.
- Do not normalize, reshape, or massage outputs just to satisfy tests.
- Before concluding any change, run the full `@protoutil/cel` test suite. Focused runs are fine during iteration, but not as final verification.

## Structure Rules

- Preserve cel-go package structure where practical.
- If an upstream directory only contains one meaningful implementation file, that file may stay flattened locally.
- Do not create wrapper-only barrel files just to mimic a one-file upstream subfolder.
- Do not collapse distinct cel-go seams into one local file for convenience.
- If cel-go has a dedicated file or runtime seam, prefer the corresponding local seam.
- Small local deviations are acceptable only when the TypeScript version would otherwise be a trivial proxy.
- One allowed example is omitting an upstream `new*` helper that would only forward to a constructor or another helper without adding behavior.
- New local filenames should use the repo's hyphenated TypeScript convention, not underscores.

## Forbidden Moves

- No test-only behavior in implementation code.
- No downstream workarounds for upstream drift.
- No convenience abstractions that make the code harder to compare against cel-go.
- No function names that begin with the word `new*` in ported implementation files.
- No no-op wrapper helpers that only forward, rename, or cast another helper result.
- No dropping upstream comments during a port unless they are incorrect, redundant Go-tooling noise, or no longer apply after translation.
- No copying upstream TODO comments into TypeScript just because they exist upstream.
- No claiming parity when structure or control flow still materially differs.
- No reinvention of protobuf message, WKT, or registry behavior when the same behavior can be delegated to `@bufbuild/protobuf` or existing repo helpers (i.e. from `@protoutil/core`).
- Do not run individual test suites ever. When you do that, you risk breaking things in other modules. Do not ever do that for any reason. The only test command you ever need to run is `pnpm run --filter @protoutil/cel test`
- You are never allowed to skip a test and claim you are finished.
- Do not run any git commands unless the user specifically asks you to.
- You are never allowed to run an `rm -rf` command or similar. If you need a directory deleted, ask the user.

## TypeScript Return Values

- Do not copy Go `(value, ok)` return tuples by default.
- If `ok` only reports whether a value exists, return `T | undefined`.
- Use a shared `Symbol` sentinel when `undefined` is a valid result.
- Keep a tuple only when both results have independent meaning.
- Do not allocate an array only to preserve a cel-go API shape.
- Before adding or porting a tuple return, state why a union or sentinel cannot preserve its semantics.
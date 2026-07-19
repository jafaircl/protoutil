# AGENTS.md

## Scope

These instructions apply to all work under `packages/cel`.

## Hard Requirements

- Mirror cel-go as closely as possible in file structure, concepts, naming, control flow, and behavior.
- Treat drift from cel-go as a bug unless a TypeScript constraint makes it unavoidable.
- Do not invent local architecture when a cel-go counterpart already exists.
- Keep local files and module boundaries aligned with the corresponding cel-go files and seams.
- Semantic parity with cel-go is the top-level goal. Exact Go implementation tooling is not.
- Keep the library isomorphic. Do not introduce Node-only runtime assumptions into shipped CEL behavior.
- Prefer browser-friendly runtime choices when they preserve cel-go behavior and materially reduce dependency weight, startup cost, or bundle size.
- Preserve cel-go implementation structure by default. Only simplify local TypeScript code when the existing pattern is purely mechanical ceremony with no semantic value.
- Preserve upstream cel-go comments when porting. Port the original comments with the code unless a comment is Go-tooling-specific noise or becomes incorrect after the TypeScript translation.
- Do not carry over upstream TODO comments by default. Only keep a TODO when it reflects an intentional, still-relevant local follow-up.
- Do not introduce handwritten `new*` helper functions or methods anywhere in the ported implementation. If an upstream `new*` helper would only proxy a constructor or another helper in TypeScript, omit that wrapper and keep the rest of the file aligned with cel-go.
- If a faithful upstream identifier would violate an enforced local tooling rule (for example, lint rules around restricted global names), keep the port behavior and structure aligned with cel-go but allow the smallest naming deviation needed to satisfy the tool. Prefer local aliasing or narrowly-scoped renames over broader structural changes.
- New public functions, classes, methods, constants, interfaces, and types must include JSDoc comments.
- Non-obvious control flow must be documented with clear inline comments.
- Keep comments aggressive and useful, especially around non-obvious parser, checker, planner, interpreter, activation, attribute, unknown/error propagation, dispatch, optional-value, and protobuf/message behavior.
- Leverage `@bufbuild/protobuf` descriptors, `create()`, `createRegistry()`, and generated message schemas where they add needed protobuf field behavior, normalization, or safety. When the exact generated message shape is already known and valid, prefer directly composing and returning the generated message object instead of paying unnecessary `create()` overhead.
- Keep protobuf well-known types as protobuf well-known types. Do not model timestamps, durations, wrappers, `Struct`, `Value`, or related types as plain JavaScript objects when Buf or existing repo helpers already provide the protobuf-native representation.
- Prefer existing protobuf helper surfaces, especially `@protoutil/core/wkt` in this repo and `@bufbuild/protobuf/wkt` where simpler constructs are needed, before adding local timestamp, duration, or WKT conversion logic in `packages/cel`.

## Boundary Rules

- Fix bugs in the layer where they originate.
- Do not compensate downstream for upstream bugs.
- Do not patch lower layers to absorb parser, checker, or planner mistakes from higher-confidence source layers.
- If a failure belongs to parser, fix parser.
- If a failure belongs to checker, fix checker.
- If a failure belongs to runtime or interpreter, fix runtime or interpreter.

## Testing Rules

- Follow test-driven development strictly.
- Use synced cel-go tests and conformance tests as acceptance signals.
- For files that have been ported, every corresponding cel-go test must also be ported 1:1 into the local test suite.
- Bring over table-based cel-go tests with sync script.
- Each file's spec will need to execute the cel-go tests along with any other testing that should be done. i.e. `common/types/types.spec.ts` should execute all test cases in `packages/cel/testdata/cel-go/cel-go-test-cases.json` under keys that start with "common/types/types_test.go/"
- Positive example: a small shared resolver such as `common/types/spec_helpers.ts` feeding the canonical per-file specs from `packages/cel/testdata/cel-go/cel-go-test-cases.json`, while keeping exact upstream test names and inline TODO blockers in those canonical specs, is the preferred pattern when synced table cases can be reused directly.
- When working on a file, check `packages/cel/testdata/cel-go/cel-go-test-cases.report.json` to see if there were any table-based tests that could not be brought over programatically. Those tests will need to be recreated.
- Treat `packages/cel/testdata/cel-go/cel-go-test-cases.report.json` as incomplete. The extraction report may miss non-table tests or unresolved upstream coverage, so inspect the corresponding cel-go test source directly before deciding a file's tests are complete.
- For upstream tests that are not table-based, write local manual spec files near the corresponding implementation instead of encoding one-offs into sync scripts.
- Keep upstream coverage in the canonical spec file for the ported implementation. Do not create parallel audit-only spec files just to track cel-go coverage.
- Name local tests after the exact upstream cel-go test names (i.e. "common/source_test.go/TestStringSource_Description") whenever practical so the relationship stays obvious and logic can be compared directly against cel-go.
- If a cel-go test cannot be ported yet because required functionality is not available, add a TODO in the local spec file naming the exact upstream test and the blocking dependency. Do not silently omit it.
- Do not introduce fixture-specific behavior to make individual tests pass.
- Do not normalize, reshape, or massage outputs just to satisfy tests.
- If outputs differ from expected behavior, fix the implementation rather than adapting the result afterward.
- If a test failure is caused by the wrong layer, fix that layer first before changing downstream code.
- During development, use focused runs as needed for iteration speed, but before concluding any change you must run the full `@protoutil/cel` test suite and treat that result as the final verification signal.

## Structure Rules

- Preserve cel-go package structure where practical.
- Do not collapse distinct cel-go seams into one local file for convenience.
- If cel-go has a dedicated file or runtime seam, prefer creating the corresponding local seam.
- Faithful means behaviorally exact and structurally comparable. It does not require copying Go-specific tooling choices when they would hurt the TypeScript/browser target.
- Small local deviations are only acceptable when the TypeScript code would otherwise be a trivial proxy. The main allowed example is omitting an upstream `new*` helper that would only forward to a constructor or another helper without adding behavior.

## Non-Goals

- Do not force a literal line-by-line transliteration of Go internals when a TypeScript-native equivalent preserves the same behavior and seam.
- Do not accept large parser-runtime or codegen dependencies solely to imitate upstream implementation choices.
- Do not split semantics into separate browser and server behavior modes.

## Workflow Rules

Before editing code:
1. Identify the corresponding cel-go file or control path.
2. Identify which layer owns the behavior being fixed.
3. Confirm the planned change fixes the bug at the correct boundary.

If any of these are unclear, inspect cel-go first.

## Forbidden Moves

- No test-only behavior in implementation code.
- No downstream workarounds for upstream drift.
- No convenience abstractions that make the code harder to compare against cel-go.
- No handwritten `new*` helper wrappers in ported implementation files.
- No dropping upstream comments during a port unless the comment is incorrect, redundant Go-tooling noise, or no longer applies after translation.
- No copying upstream TODO comments into TypeScript just because they exist upstream.
- No claiming parity when structure or control flow still materially differs.
- No reinvention of protobuf message, WKT, or registry behavior when the same behavior can be delegated to `@bufbuild/protobuf` or existing repo helpers (for example, the helpers found in this repo's `packages/core` library).

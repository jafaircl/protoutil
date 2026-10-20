# celql test strategy

Translation failures are silent. A predicate that widens a matched set returns rows instead of raising an error, and a predicate that narrows one hides rows. Neither shows up as a crash. The layers below exist because no single technique catches that class of defect.

Conformance layers are data and stay language-neutral. Implementation layers are TypeScript and may depend on internals.

## Layer 1: core conformance

**Scope.** Behavior that holds for every dialect: checked-expression validation, exact Boolean root, `match_all` and `match_none`, predicate success where output shape does not matter, limits measured over the input, profile selection, atomic failure, and rejection of reserved identifiers.

**Location.** `conformance/core/*.textproto`.

**Rules.** Each source-form case records one expectation for every built-in profile. A successful expectation contains the target's exact predicate and complete typed parameters. A rejected form records the profile's exact error boundary.

Asserting exact output is what gives these cases force. A case expecting `"name" IS NOT DISTINCT FROM ?` fails if a value leaks into the condition, if an identifier is left undelimited, if a parameter is dropped or merged, or if the translator emits plain `=` and silently loses rows whose column is null. A case that only checked that some predicate came back would catch none of that.

**Gate.** Every core case passes for every available profile it applies to. A case reported as not applicable is not a pass.

## Layer 2: profile conformance

**Scope.** One dialect profile at one major version, asserting that profile's real output message.

**Location.** Shared source-form cases live in `conformance/core/*.textproto`.
`conformance/profile/*.textproto` contains only target-specific libraries,
configuration, or semantic boundaries that have no shared test environment.

**The baseline.** Every implementation provides the ANSI SQL profile, so this layer is never empty. Its suite asserts exact SQL text and exact bound parameters, which is where output-level correctness is actually proven.

**Extending profiles.** A dialect whose target differs from ISO/IEC 9075 attaches
its expectation or explicit rejection to each shared source form. This makes
the output and record-selection agreement visible without copying the CEL
input. Its local suite covers only what the common environment cannot express.

**Rules.** Coverage follows `conformance/templates/PROFILE_CASE_REQUIREMENTS.md`: every declared overload and operand-shape combination, every field-path rule, every parameter rule, null and absence behavior, range boundaries, pattern and regular-expression rules, every comprehension form, output-growth limits, and the rejection boundary beside each. Expected output uses the type named by the profile's `output_type_name`. A synthetic predicate language is never a substitute.

**Gate.** Every declared capability has an accepting case and a rejecting case, and all pass.

## Layer 3: differential semantics

**Scope.** Agreement between CEL evaluation and target execution for each real profile.

**Method.** For each successful source-form profile expectation and each record in its generated domain: evaluate the CEL source with a conforming CEL evaluator; translate the checked expression; execute the predicate against the equivalent stored record; compare the selected record sets.

**Rules.** The two sets must be equal. Run against the real target engine, not a simulation of it, because the defects this layer catches are exactly the ones a simulation would reproduce incorrectly. Seed data covers null, absent fields, empty strings, values at each supported numeric boundary, values containing target pattern metacharacters, and values containing target quoting and comment syntax.

**Gate.** No record differs, for every profile that targets an executable system.

## Layer 4: implementation unit tests

**Scope.** Internal failure paths that conformance data cannot reach, because a conformance case is by construction a well-formed protobuf describing a supported operation.

**Location.** `src/**/*.spec.ts`.

**Coverage.**

- Malformed and truncated protobuf input, unknown fields, and wrong-typed `Any` payloads.
- Expressions that are extremely deep, extremely wide, or both, including trees that would overflow a recursive traversal.
- Counter behavior at its bounds: node counts, parameter positions, and output-growth accumulators near their maximum, with no wraparound past a configured limit.
- State leakage: repeated and interleaved translations through one translator, with fresh profile state for each call.
- A profile that returns the wrong output type or returns nothing, each surfacing as `INVALID_PROFILE_OUTPUT`.
- A profile that throws unexpectedly, with the original exception propagating unchanged.
- Missing profiles and invalid capability declarations at translator construction.
- Translation-library singleton resolution, dependencies, profile compatibility, and overload ownership conflicts.
- Diagnostic redaction, asserted directly against error contents.

## Layer 5: fuzz and property tests

**Scope.** Invariants that must hold across inputs nobody enumerated.

**Coverage.**

- Arbitrary `CheckedExpr` bytes never crash the translator and never produce a predicate alongside an error.
- Boolean grouping: a translated predicate agrees with CEL evaluation over generated records, for generated Boolean trees.
- Parameter ordering: emitted parameter references and the parameter list always correspond, under any start position.
- Identifier encoding: a generated path either encodes unambiguously or is rejected, and two distinct paths never encode identically.
- Pattern escaping: escaping a generated string always yields a pattern matching that string literally and nothing else.
- Resource limits: a translation that exceeds any configured limit always fails, and one below every limit never fails for a limit reason.
- Comprehension scoping: a generated nested comprehension preserves each binding, and no generated alias captures an enclosing reference.

**Gate.** No falsifying input outstanding. A discovered counterexample becomes a permanent case in layer 1, 2, or 4 according to what it tests.

## Production readiness

A release is production-ready when all of the following hold:

1. every core conformance case passes;
2. every shipped profile passes its full profile conformance suite;
3. differential tests pass for every profile targeting an executable system;
4. layer 4 and layer 5 suites pass with no outstanding counterexample.

Partial capability is acceptable; undeclared capability is not. A profile that translates a small fragment and rejects everything else can be production-ready. A profile whose declared capabilities exceed its tested capabilities cannot.

## Current status

The language-neutral corpus contains 198 cases and 924 profile expectations. It contains 180 shared core cases and 18 target-local cases. Each non-selection core source case stores its CEL source once and attaches an exact output or explicit rejection for ANSI SQL, PostgreSQL, MySQL, SQLite, and MongoDB.

The TypeScript entry point executes every published profile expectation directly from textproto. Focused unit tests cover profile-class extension, custom profile output, translation-library composition, validation, output-type enforcement, missing profiles, unexpected profile failures, PostgreSQL parameter numbering, PostgreSQL array composition, PostgreSQL timestamp-range operations, full-text search for each target binding, spatial containment and distance bounds, parameter binding for each client, and portable regular-expression boundaries.

- Layer 3 executes every successful executable expectation against PostgreSQL 14, MySQL 8.4, MongoDB 8.0, or SQLite. It generates records from checked field types and constants, then compares the complete selected-record set with CEL evaluation. Its domain contains hostile strings, nulls where the profile supports them, pattern metacharacters, membership, Boolean fields, and MongoDB reverse-order comparisons.
- Layer 5 has finite generated properties for half-open timestamp ranges and simple full-text term membership. It still needs generators for arbitrary checked expressions and profile inputs.

Run `pnpm test` with Docker available. The single conformance entry point starts the Compose services, waits for readiness, and removes them after the suite. Set `CELQL_POSTGRES_IMAGE`, `CELQL_MYSQL_IMAGE`, or `CELQL_MONGODB_IMAGE` before the command to test another target image.

The package test task parses every textproto fixture, prepares checked expressions, executes each case twice and in reverse order, and compares each observable result with the fixture expectation.

The exact output in layers 1 and 2 remains the stable compatibility contract. Layer 3 independently verifies record-selection semantics for each executable profile. ANSI SQL output has no direct execution engine, so a shared misreading of that target vocabulary remains a residual risk.

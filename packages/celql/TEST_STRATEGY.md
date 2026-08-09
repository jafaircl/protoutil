# celql test strategy

Translation failures are silent. A predicate that widens a matched set returns rows instead of raising an error, and a predicate that narrows one hides rows. Neither shows up as a crash. The layers below exist because no single technique catches that class of defect.

Conformance layers are data and stay language-neutral. Implementation layers are TypeScript and may depend on internals.

## Layer 1: core conformance

**Scope.** Behavior that holds for every dialect: checked-expression validation, exact Boolean root, `match_all` and `match_none`, predicate success where output shape does not matter, limits measured over the input, profile selection, atomic failure, and rejection of reserved identifiers.

**Location.** `conformance/core/*.textproto`.

**Rules.** A core case asserts an outcome kind, an error code, or the baseline profile's exact output. It introduces no query dialect: the baseline targets a published standard, and every implementation provides it.

Asserting exact output is what gives these cases force. A case expecting `"name" IS NOT DISTINCT FROM ?` fails if a value leaks into the condition, if an identifier is left undelimited, if a parameter is dropped or merged, or if the translator emits plain `=` and silently loses rows whose column is null. A case that only checked that some predicate came back would catch none of that.

**Gate.** Every core case passes for every available profile it applies to. A case reported as not applicable is not a pass.

## Layer 2: profile conformance

**Scope.** One dialect profile at one major version, asserting that profile's real output message.

**Location.** `conformance/profile/<profile-name>/*.textproto`, added with the profile.

**The baseline.** Every implementation provides the ANSI SQL profile, so this layer is never empty. Its suite asserts exact SQL text and exact bound parameters, which is where output-level correctness is actually proven.

**Extending profiles.** A dialect whose target differs from ISO/IEC 9075 extends the baseline. Its suite must cover every expression form the baseline accepts, so the record-selection agreement with the baseline is verified rather than assumed, plus everything it adds.

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
- State leakage: repeated and interleaved translations through one translator, with a fresh dialect visitor for each operation.
- A dialect that returns the wrong output type or returns nothing, each surfacing as `INVALID_PROFILE_OUTPUT`.
- A dialect that throws unexpectedly, with the original exception propagating unchanged.
- Missing dialect classes and invalid capability declarations at translator construction.
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

149 cases exist: 49 core cases across eight files, 93 ANSI SQL source cases across eight files, and 7 PostgreSQL-specific source cases. These cases contain 252 profile expectations. One case stores its CEL source once and can attach different ANSI SQL and PostgreSQL success or error expectations. The three forms that PostgreSQL adds—array-column membership, array-column `exists`, and regular expressions—therefore verify ANSI SQL rejection and PostgreSQL output without duplicating the source. Every declared ANSI SQL overload has an accepting case, and every rejection boundary next to it has one.

The TypeScript conformance runner executes all 252 published profile expectations. Focused unit tests cover dialect binding, custom dialect output, subclass dispatch through inherited visitors, validation, output-type enforcement, missing dialects, unexpected dialect failures, PostgreSQL parameter numbering, PostgreSQL array composition, and PostgreSQL regular-expression boundaries.

- Layer 3 executes all 80 successful PostgreSQL source expectations against PostgreSQL 14. It generates records from the checked field types and bound constants, then compares the complete selected-record set with CEL evaluation. ANSI SQL still needs an independent compatible execution engine.
- Layer 5 needs generators for arbitrary checked expressions and profile inputs.

Run `pnpm test` with Docker available. The PostgreSQL spec starts the Compose service, waits for readiness, and removes the service after the suite. Set `CELQL_POSTGRES_IMAGE` before the command to test another PostgreSQL image.

The package test task parses every textproto fixture, prepares checked expressions, executes each case twice and in reverse order, and compares each observable result with the fixture expectation.

The exact SQL in layers 1 and 2 remains the stable compatibility contract. PostgreSQL layer 3 independently verifies record-selection semantics against the target engine. ANSI SQL output has not received equivalent execution verification, so a shared misreading of that target vocabulary remains a residual risk.

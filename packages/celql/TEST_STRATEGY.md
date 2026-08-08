# celql test strategy

Translation failures are silent. A predicate that widens a matched set returns rows instead of raising an error, and a predicate that narrows one hides rows. Neither shows up as a crash. The layers below exist because no single technique catches that class of defect.

Conformance layers are data and stay language-neutral. Implementation layers are TypeScript and may depend on internals.

## Layer 1: core conformance

**Scope.** Behavior that holds for every dialect: checked-expression validation, exact Boolean root, `match_all` and `match_none`, predicate success where output shape does not matter, limits measured over the input, profile selection, atomic failure, and rejection of reserved identifiers.

**Location.** `conformance/core/*.textproto`.

**Rules.** A core case asserts an outcome kind, an error code, or the baseline profile's exact output. It introduces no query dialect: the baseline targets a published standard, and every implementation provides it.

Asserting exact output is what gives these cases force. A case expecting `"name" IS NOT DISTINCT FROM ?` fails if a value leaks into the condition, if an identifier is left undelimited, if a parameter is dropped or merged, or if the translator emits plain `=` and silently loses rows whose column is null. A case that only checked that some predicate came back would catch none of that.

**Gate.** Every core case passes for every registered profile it applies to. A case reported as not applicable is not a pass.

## Layer 2: profile conformance

**Scope.** One dialect profile at one major version, asserting that profile's real output message.

**Location.** `conformance/profile/<profile-name>/*.textproto`, added with the profile.

**The baseline.** Every implementation provides the ANSI SQL profile, so this layer is never empty. Its suite asserts exact SQL text and exact bound parameters, which is where output-level correctness is actually proven.

**Extending profiles.** A dialect whose target differs from ISO/IEC 9075 extends the baseline. Its suite must cover every expression form the baseline accepts, so the record-selection agreement with the baseline is verified rather than assumed, plus everything it adds.

**Rules.** Coverage follows `conformance/templates/PROFILE_CASE_REQUIREMENTS.md`: every declared overload and operand-shape combination, every field-path rule, every parameter rule, null and absence behavior, range boundaries, pattern and regular-expression rules, every comprehension form, output-growth limits, and the rejection boundary beside each. Expected output uses the type named by the profile's `output_type_name`. A synthetic predicate language is never a substitute.

**Gate.** Every declared capability has an accepting case and a rejecting case, and all pass.

## Layer 3: differential semantics

**Scope.** Agreement between CEL evaluation and target execution for each real profile.

**Method.** For each record in the tested domain: evaluate the checked expression with a conforming CEL evaluator; translate the expression; execute the predicate against the equivalent stored record; compare the selected record sets.

**Rules.** The two sets must be equal. Run against the real target engine, not a simulation of it, because the defects this layer catches are exactly the ones a simulation would reproduce incorrectly. Seed data covers null, absent fields, empty strings, values at each supported numeric boundary, values containing target pattern metacharacters, and values containing target quoting and comment syntax.

**Gate.** No record differs, for every profile that targets an executable system.

## Layer 4: implementation unit tests

**Scope.** Internal failure paths that conformance data cannot reach, because a conformance case is by construction a well-formed protobuf describing a supported operation.

**Location.** `src/**/*.spec.ts`.

**Coverage.**

- Malformed and truncated protobuf input, unknown fields, and wrong-typed `Any` payloads.
- Expressions that are extremely deep, extremely wide, or both, including trees that would overflow a recursive traversal.
- Counter behavior at its bounds: node counts, parameter positions, and output-growth accumulators near their maximum, with no wraparound past a configured limit.
- State leakage: repeated translations through one translator instance, interleaved translations, and translations that share a profile instance.
- A profile that returns the wrong output type, returns nothing, or throws, each surfacing as `INVALID_PROFILE_OUTPUT` or `INTERNAL_ERROR` rather than a leaked exception.
- Profile registration conflicts and unknown major versions.
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

142 cases exist: 50 in layer 1 across eight files, and 92 in layer 2 covering the baseline profile. Every declared ANSI SQL overload has an accepting case, and every rejection boundary next to it has one.

No translator implementation exists yet, so nothing executes those cases. Layers 3 through 5 need that implementation:

- Layer 3 additionally needs a live SQL engine to execute generated predicates against.
- Layers 4 and 5 need translator internals to exercise.

This package has no test task. There is no implementation to exercise, and a test that only restated the schema would verify nothing.

Verification available today is `buf lint`, `buf build`, code generation, and `tsc`. The fixtures are separately verified to parse against the schema; the runner that performs that parse as part of the build arrives with the translator, because parsing textproto needs a parser that no current TypeScript dependency provides.

The expected SQL in layers 1 and 2 was derived from ISO/IEC 9075 by reading, not by execution. Until layer 3 runs, a shared misreading of the standard would pass every case. That is the single largest residual risk, and it is why layer 3 is a release gate rather than an optional extra.

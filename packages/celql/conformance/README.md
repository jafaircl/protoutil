# celql conformance suite

Conformance cases are data. A runner in any language reads them, performs the requested operation, and compares the result against each profile expectation. One case stores its input once. Its repeated `expected` field contains independent `ProfileExpectation` values, so ANSI SQL and PostgreSQL can require different output or one can require an error. The schema is `protoutil.celql.conformance.v1.ConformanceSuite`.

## Layout

```text
conformance/
  core/                              dialect-independent cases
    validation.textproto             checked-expression validation and root typing
    outcomes.textproto               match_all, match_none, predicate success, validation success
    values.textproto                 value handling across supported CEL types
    sql-*.textproto                  shared SQL source forms with every profile's expectation
    relational.textproto             shared relational source forms
    full-text-search.textproto       shared full-text source forms with every profile's expectation
    geospatial.textproto             shared spatial source forms with every profile's expectation
    security.textproto               constants stay data and never become structure
    comprehensions.textproto         lowered macro structure and scope
    limits.textproto                 limits measured over the input
    rejection.textproto              rejection and atomic failure
    selection.textproto              profile selection
  profile/
    mongodb.textproto                MongoDB safety and rejection boundaries
    postgresql.textproto             PostgreSQL libraries, extensions, and configuration
  templates/
    PROFILE_CASE_REQUIREMENTS.md     required coverage for a dialect profile suite
```

## The two levels

**Core** cases test requirements every implementation must satisfy: checked-expression validation, exact Boolean root, outcome kinds, input-measured limits, profile selection, atomic failure, and the rule that a constant never becomes query structure.

Each core source-form case names all five profiles. A successful expectation asserts the profile's real predicate and complete parameters. An unsupported source form records that profile's explicit error. Asserting real output is what makes these cases meaningful: a case fails if syntax changes, a value leaks into text, or a parameter changes type, value, or position.

**Profile** cases contain only behavior that cannot be expressed as one source form across profiles, such as target-only libraries, configuration, or rejection limits. `google.protobuf.Any` carries a successful target message as a transport wrapper; the embedded type always equals the profile's declared `output_type_name`.

## How core cases select a profile

Translation always requires a profile, so a core case still runs against one.

A core case that expects an error before the fragment matters still records each built-in profile explicitly. Profile-selection cases name the reserved profile because profile resolution is the behavior under test.

Cases in `selection.textproto` name a reserved profile because profile resolution is what they test.

A profile expectation can list translation-library references. The runner constructs the translator with those libraries. If the runner does not provide one, it reports the expectation as unavailable; that result is neither a pass nor an expected translation rejection. Omitting an available library from an expectation leaves its overloads unsupported.

`ExpectedSuccess.predicate_produced` asserts that a predicate exists without comparing contents. No case in the current corpus uses it either. Every predicate case asserts exact output, which is what makes the corpus worth running.

## Reserved identifiers

Two prefixes exist so that core cases can force a known outcome without naming a real dialect:

- `celql.reserved.unsupported.` — an overload identifier that no profile may declare. Every translator rejects it with `TRANSLATION_ERROR_CODE_UNSUPPORTED_OVERLOAD`. Core uses it to test rejection and atomic failure.
- `celql.reserved.unregistered` — a profile name that no dialect profile may use.

Both are conformance instruments. Neither describes a query dialect.

## What the runner checks beyond individual cases

Some requirements are properties of the whole run rather than of one case. A conforming runner:

- executes each case twice and requires the same result, for determinism;
- runs the suite in reverse and requires the same per-case results, for isolation;
- requires that no error message or `details` entry contains a constant from the case input, for redaction;
- requires that every produced predicate has the selected profile's declared output type;
- requires that no predicate accompanies an error, for atomicity;
- requests an unsupported major version from each available profile and requires the version error;
- requires that no available profile declares an overload using the reserved unsupported prefix.

## What core leaves to profile suites

A core case records the shared CEL source once and enumerates every built-in profile's output or rejection. Target-only libraries, configuration, and semantic boundaries belong to profile conformance. `templates/PROFILE_CASE_REQUIREMENTS.md` lists the required capability coverage.

- The full operator and operand-shape matrix for a dialect.
- Every field-path encoding rule, including unencodable paths.
- Parameter composition, numbering, and any deduplication a dialect performs.
- Target-only pattern-language and regular-expression boundaries that have no cross-profile form.
- Comprehension output.
- Absence observation, which some dialects support and others refuse.
- Values outside a specific target's representable range.
- Limits measured over the output, such as parameter count and output growth.

An extending profile supplies an expectation for every shared expression form, so its promise to select the same records is verified without duplicating the input.

## The baseline profile

Every conforming implementation provides the ANSI SQL profile, so a profile always exists for a core case to select, and output-level coverage always has a real target. `profiles/ANSI_SQL_V1.md` defines it.

A dialect whose target differs from ISO/IEC 9075 extends the baseline rather than replacing it. An extending profile accepts everything the baseline accepts and selects the same records for those expressions, but emits its own output. The core case carries that profile's exact output beside the baseline expectation. Its profile-local suite contains only additional target behavior.

## Current status

The corpus contains 198 cases and 924 profile expectations. It contains 180 shared core cases and 18 target-local cases. Every declared ANSI SQL overload has at least one accepting case and, where a boundary exists, a rejecting case. Every non-selection core source case attaches an exact output or explicit rejection for all five profiles.

Most cases use `cel_source` as their readable fixture input. The runner parses and checks that source to prepare the `CheckedExpr` passed to the translator. Cases built from malformed or near-miss structures use an encoded checked expression, because no conforming parser would produce those structures.

`src/conformance.spec.ts` is the only conformance test entry point. It executes every profile expectation and verifies every exact predicate, including complete SQL parameter messages.

The same entry point starts PostgreSQL 14, MySQL 8.4, and MongoDB 8.0 through Compose and uses in-memory SQLite. It executes every successful executable profile expectation and compares selected record IDs with CEL evaluation. ANSI SQL output does not have an equivalent execution engine.

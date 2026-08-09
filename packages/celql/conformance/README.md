# celql conformance suite

Conformance cases are data. A runner in any language reads them, performs the requested operation, and compares the result against each profile expectation. One case stores its input once. Its repeated `expected` field contains independent `ProfileExpectation` values, so ANSI SQL and PostgreSQL can require different output or one can require an error. The schema is `protoutil.celql.conformance.v1.ConformanceSuite`.

## Layout

```text
conformance/
  core/                              dialect-independent cases
    validation.textproto             checked-expression validation and root typing
    outcomes.textproto               match_all, match_none, predicate success, validation success
    values.textproto                 value handling across supported CEL types
    security.textproto               constants stay data and never become structure
    comprehensions.textproto         lowered macro structure and scope
    limits.textproto                 limits measured over the input
    rejection.textproto              rejection and atomic failure
    selection.textproto              profile selection
  profile/
    ansisql/                         the baseline ANSI SQL profile
      operators.textproto            equality, logical operators, negation and null
      comparisons.textproto          every declared ordering overload
      patterns.textproto             LIKE emission and wildcard escaping
      membership.textproto           IN, and the exists comprehension form
      temporal.textproto             timestamp and duration conversion and comparison
      booleans.textproto             Boolean columns used directly as a condition
      values.textproto               identifiers, null, ranges, parameter binding
      limits.textproto               output growth and parameter count
    postgresql/                      the PostgreSQL extension profile
      postgresql.textproto           numbered parameters, arrays, regex, configuration
  templates/
    PROFILE_CASE_REQUIREMENTS.md     required coverage for a dialect profile suite
```

## The two levels

**Core** cases test requirements every implementation must satisfy: checked-expression validation, exact Boolean root, outcome kinds, input-measured limits, profile selection, atomic failure, and the rule that a constant never becomes query structure.

Because every implementation provides the ANSI SQL baseline, a core case that expects a predicate names that profile and asserts its exact output. Asserting real SQL is what makes these cases meaningful: a case expecting `"name" IS NOT DISTINCT FROM ?` fails if a value leaks into the condition text, if an identifier is not delimited, if a parameter is dropped, or if the translator emits plain `=` and loses rows whose column is null. There is still no test-only dialect and no invented canonical language — the target is a real standard.

**Profile** cases test one concrete dialect at one major version and assert that dialect's real output message. `google.protobuf.Any` carries that message as a transport wrapper; the embedded type always equals the profile's declared `output_type_name`.

## How core cases select a profile

Translation always requires a profile, so a core case still runs against one.

A core case that expects an error before the fragment matters leaves `profile` unset. The runner constructs a translator with any available profile, and the choice cannot change the result.

A core case that expects a predicate names the baseline profile and asserts exact SQL.

Cases in `selection.textproto` name a profile because profile resolution is what they test.

A case may instead set `requirements`, naming capabilities the selected profile must declare. The runner then runs it only against a profile that declares them, and reports it as not applicable otherwise. No case in the current corpus needs this, because the baseline covers every expectation written so far. The field exists for a case that must run only against profiles with a capability the baseline lacks.

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

A core case shows that a rule holds, using the baseline as the vehicle. It does not enumerate one dialect's surface. These belong to profile conformance, and `templates/PROFILE_CASE_REQUIREMENTS.md` lists them in full.

- The full operator and operand-shape matrix for a dialect.
- Every field-path encoding rule, including unencodable paths.
- Parameter composition, numbering, and any deduplication a dialect performs.
- Pattern-language escaping and regular-expression rendering.
- Comprehension output.
- Absence observation, which some dialects support and others refuse.
- Values outside a specific target's representable range.
- Limits measured over the output, such as parameter count and output growth.

An extending profile additionally supplies an expectation for every baseline expression form, so its promise to select the same records is verified without duplicating the input.

## The baseline profile

Every conforming implementation provides the ANSI SQL profile, so a profile always exists for a core case to select, and output-level coverage always has a real target. `profiles/ANSI_SQL_V1.md` defines it.

A dialect whose target differs from ISO/IEC 9075 extends the baseline rather than replacing it. An extending profile accepts everything the baseline accepts and selects the same records for those expressions, but emits its own output. It publishes its own suite under `conformance/profile/<name>/`, because its output differs from the baseline's.

## Current status

149 cases: 49 core cases across eight files, 93 ANSI SQL source cases across eight files, and 7 PostgreSQL-specific source cases. The cases contain 252 profile expectations. Every declared ANSI SQL overload has at least one accepting case and, where a boundary exists, a rejecting case. PostgreSQL expectations on the same source cases assert exact protobuf output for inherited forms. The PostgreSQL-specific cases assert both the ANSI SQL result and the PostgreSQL extension result.

Most cases use `cel_source` as their readable fixture input. The runner parses and checks that source to prepare the `CheckedExpr` passed to the translator. Cases built from malformed or near-miss structures use an encoded checked expression, because no conforming parser would produce those structures.

The TypeScript runner executes all 252 profile expectations and verifies exact output where the expectation supplies it.

The exact SQL was derived from ISO/IEC 9075 and the PostgreSQL documentation. The PostgreSQL spec executes all 80 successful PostgreSQL source expectations against PostgreSQL 14 and compares selected record IDs with CEL evaluation. ANSI SQL output does not yet have an equivalent execution engine.

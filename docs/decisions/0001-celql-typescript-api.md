# Use a throwing, dialect-bound translator for the celql TypeScript API

- Status: superseded by [ADR 0002](0002-celql-profile-library-composition.md)
- Date: 2026-08-08
- Decision makers: project owner

## Context and problem statement

The celql specification requires explicit profile selection, a built-in ANSI SQL profile, and extensible dialect implementations. The TypeScript package needs a small public API that reports every translation failure consistently and lets callers customize a built-in dialect without copying it.

## Decision drivers

- Preserve the specification's one-outcome-or-one-error contract.
- Permit callers to supply PostgreSQL, MySQL, MongoDB, and other dialect profiles without changing the translation core.
- Keep profile selection explicit and versioned.
- Make every input, capability, and implementation failure machine-readable.
- Keep successful return types free of failure branches.
- Reuse recursive visitor behavior through ordinary class inheritance.
- Keep each concrete predicate output type statically correct without casts.
- Prefer composition for responsibilities that do not require recursive visitor dispatch.
- Permit custom calls and comprehensions to participate in recursive visitor dispatch.

## Considered options

1. Bind a translator to a subclassable dialect constructor and throw machine-readable errors.
2. Bind a translator to an object whose callbacks implement a dialect.
3. Export one standalone function for each dialect.
4. Return a discriminated success or failure result from each operation.

The callback-object option separates capability declarations from behavior and makes recursive customization indirect. The standalone-function option does not provide one consistent custom-dialect contract. The discriminated-result option adds a failure branch to every successful call and duplicates normal exception handling.

## Decision outcome

The package will expose `createTranslator(DialectClass)`. Each translator is bound to exactly one caller-supplied dialect class and imports no concrete dialect. The translator creates a fresh dialect visitor for each operation. The package exports the ANSI SQL version 1 and PostgreSQL version 1 dialect classes so callers can select or subclass them explicitly. A caller that needs multiple dialects creates one translator for each dialect.

Translation will return only `match_all`, `match_none`, or a predicate outcome. Validation will return no value on success. Every rejection or failure will throw `CelqlError`, which carries the stable machine-readable `TranslationError` data. An unexpected dialect exception will propagate unchanged.

Each dialect class will publish its `DialectCapabilityProfile` and output schema as static metadata, validate profile configuration, visit checked expressions, and produce its declared protobuf predicate type. The translator will enforce common checked-expression validation, common limits, atomicity, and output-type validation around that dialect.

The public `Dialect` base class will contain only target-independent lifecycle state. A type-safe SQL dialect base will implement the ANSI-compatible SQL visitor and require each concrete dialect to construct its own declared predicate type. `AnsiSqlDialect` and `PostgreSqlDialect` will inherit that visitor. PostgreSQL will override only PostgreSQL-specific behavior. Visitor methods that define extension boundaries, including call and comprehension visiting, will be `protected`. A custom SQL dialect will subclass the closest built-in SQL dialect, extend its capability metadata when it accepts new forms, and delegate unchanged behavior with `super`.

The visitor uses inheritance because recursive traversal must dispatch through a custom dialect's overridden methods. Output construction, test database lifecycle, and other responsibilities that do not need recursive dispatch may use composition. The SQL base will not use a generic cast to claim that one concrete protobuf output is another dialect's output type.

A target with an incompatible representation, such as MongoDB, will extend `Dialect` through its own target-family base class. It will not inherit SQL parameter or output behavior.

## Consequences

- Callers handle all translation failures through one exception path and can branch on the stable error code.
- Successful calls have no failure branch in their return type.
- Translator construction fails when the caller supplies no dialect class.
- Per-operation profile overrides and mutable profile registries are not part of the API.
- Unexpected implementation defects remain visible to error monitoring and process-level policy.
- Dialect authors extend one public class and receive inherited traversal, validation, and safety enforcement.
- ANSI SQL, PostgreSQL, and later SQL dialects reuse one ANSI-compatible SQL visitor instead of translating through a separate baseline translator.
- A concrete dialect's TypeScript return type matches the protobuf value it constructs without `any` or `unknown` casts.
- Public API compatibility must be maintained for the translator, result, and dialect-constructor types.

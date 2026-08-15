# Project Glossary

This glossary defines domain terms used across the project. Each entry names one concept; project artifacts MUST use these terms rather than paraphrasing them.

Entries currently cover `packages/cel/src/composition/` (CEL environment and checked-expression composition) and `packages/celql/` (query translation). Add further sections here as later features introduce their own domain terms.

## CEL environment and checked-expression composition

Full normative detail for these terms lives in `packages/cel/src/composition/SPEC.md` §4. This glossary gives the canonical term and a short definition; the spec is authoritative for edge cases.

### Environment

A CEL environment: the state needed to parse, check, validate, plan, and evaluate CEL expressions (variables, types, functions and overloads, macros, validators, context type, type registry, parser and checker options, program options, standard-library configuration, applied library identities).

- Related concepts: [Additive state](#additive-state), [Non-additive state](#non-additive-state).

### Checked expression

A standard checked CEL AST: an expression tree plus checked type metadata, reference and overload metadata, and source metadata when available.

- Prohibited alternatives: "checked AST" when the code means the wrapper type generically rather than this specific concept; use "checked expression" for the concept, `AST` for the TypeScript type.

### Additive state

Environment state that can be combined by adding entries and applying the implementation's normal duplicate and conflict rules (for example: variable declarations, function overloads, type registrations, standard declarations, distinct macros, distinct validators, distinct libraries, parser and checker settings).

- Prohibited alternatives: "additive declarations", "additive settings", "additive configuration". Use "additive state" for this concept in comments and documentation.
- Related concepts: [Non-additive state](#non-additive-state).

### Non-additive state

Environment state for which one environment normally has one effective value or behavior (for example: container, context type, type adapter, certain semantic features, certain scalar program options).

- Prohibited alternatives: "non-additive declarations", "settings" alone (when the non-additive concept specifically is meant). Use "non-additive state" for this concept.
- Related concepts: [Additive state](#additive-state), [Semantic feature](#semantic-feature).

### Semantic feature

Environment or library behavior that changes evaluation behavior, as distinct from behavior that only changes which future source text checks successfully (see `packages/cel/src/composition/SPEC.md` §12.6–§12.7). Composition MUST treat two environments' semantic features as equal or explicitly composable; it MUST NOT gate composition on parser- or checker-only settings that merely widen or narrow what checks, since those are not semantic features.

- Scope: used to classify non-additive state in `packages/cel/src/composition/environment.ts` (`extendEnvironment`, `assignableEnvironment`, `equalNonAssignableState`).
- Related concepts: [Non-additive state](#non-additive-state), [Materialized state](#materialized-state).

### Materialized state

The declarations, types, macros, validators, and settings an environment holds after it is constructed, whatever produced them. A library's compile-time contribution is materialized state once the environment exists; the library value itself is a construction input, not materialized state. Composition combines materialized state and MUST NOT replay construction inputs.

- Prohibited alternatives: "effective configuration", "resolved options" (both suggest the construction inputs rather than the state they produced).
- Related concepts: [Library](#library), [Additive state](#additive-state).

### Library

A uniquely named CEL extension that may contribute compile-time environment options, program options, functions, runtime bindings, macros, validators, types, or semantic features. A library name MUST uniquely identify one semantic library definition within the implementation.

### Environment assignability

The relationship where an environment `Source` is assignable to an environment `Target`: every checked expression `Source` produces can be planned and evaluated by `Target` without rechecking.

- Prohibited alternatives: "environment compatibility" (too vague; use "environment assignability" for this specific, directional relationship).

### Registry composition

Combining the type registries of two environments into an independent registry holding the registrations of both, applying the registry's existing registration and conflict rules (`ExtendRegistry` in `packages/cel/src/composition/SPEC.md` §10.1; `Registry.extend` in `packages/cel/src/common/types/provider.ts`).

- Prohibited alternatives: "registry merge" (reserved for combining entries within one registry).
- Related concepts: [Materialized state](#materialized-state).

### Structural duplicate

Two checked expressions that are semantically identical per the structural-equality rules of `packages/cel/src/composition/SPEC.md` Part VI, excluding expression IDs and source positions.

- Prohibited alternatives: "logical duplicate", "equivalent expression" (both suggest the broader, unimplemented notion of logical equivalence; structural duplicate is narrower — see SPEC.md Part VI).

## Query translation

Full normative detail for these terms lives in `packages/celql/SPEC.md`. This glossary gives the canonical term and a short definition; the spec is authoritative for edge cases.

### Translation

Converting one checked expression into one query predicate for one selected dialect. Translation never parses CEL source text, evaluates the expression, or executes a query.

- Prohibited alternatives: "compilation", "conversion", "lowering". Use "translation".
- Related concepts: [Predicate](#predicate), [Dialect](#dialect).

### Dialect

The mapping from supported CEL operations to one target query language.

- Related concepts: [Profile](#profile).

### Profile

A versioned dialect contract, identified by a stable name and a major version. A profile fixes the base translatable fragment, the output protobuf type, and the null, absence, regular-expression, comprehension, parameter, and rejection rules for that dialect.

- Scope: a caller always selects a profile explicitly; a translator never infers or substitutes one.
- Prohibited alternatives: "driver", "backend", "adapter".
- Related concepts: [Dialect](#dialect), [Capability profile](#capability-profile), [Translatable fragment](#translatable-fragment).

### Baseline profile

The ANSI SQL profile that every conforming celql implementation must provide, targeting the SQL of ISO/IEC 9075. Its presence guarantees one portable dialect and gives core conformance a profile to select.

- Scope: an implementation must not alter its fragment, output type, or emitted output; a differing target requires an extending profile instead.
- Prohibited alternatives: "default profile" (selection is always explicit, so there is no default), "standard dialect".
- Related concepts: [Profile](#profile), [Profile extension](#profile-extension).

### Profile extension

Declaring one profile as the base of another. The extending profile accepts every expression the base accepts and selects the same records for those expressions, but may emit different output and may accept more. Extension is one level deep.

- Prohibited alternatives: "profile inheritance", "subclassing", "profile override".
- Related concepts: [Baseline profile](#baseline-profile), [Profile](#profile).

### Translation library

A named and versioned addition to a profile's translatable fragment. A translation library declares and evaluates the resolved overloads that it adds and supplies target-compatible translations for those overloads.

- Scope: the same library object configures a CEL environment and a translator. A translator materializes zero or more translation libraries when it is constructed. An operation cannot change that selection.
- Related concepts: [Profile](#profile), [Effective capability](#effective-capability), [Resolved overload](#resolved-overload), [CEL library](#cel-library).

### CEL library

The target-independent part of one named and versioned library: its type declarations, function declarations, and CEL evaluation. One CEL library defines what an expression means; a translation library binds that meaning to one profile's target syntax.

- Scope: a caller that only evaluates CEL, such as a differential test oracle, selects the CEL library alone. Every translation library of the same library name carries the same CEL library.
- Prohibited alternatives: "shared library", "base library".
- Related concepts: [Translation library](#translation-library), [Storage contract](#storage-contract).

### Closed containment

Containment of a position in a polygon where a position on the ring is contained. The alternative, interior containment, excludes a position on the ring.

- Scope: a library that publishes closed containment for several targets emits, per target, whichever operator reproduces it. A target operator whose own name suggests containment may implement interior containment instead.
- Prohibited alternatives: "inside", "covered by".
- Related concepts: [Storage contract](#storage-contract), [Translation library](#translation-library).

### Storage contract

The target storage, index, and configuration that a caller must map a query field path to before a profile's translation preserves the CEL semantics of an operation over that field.

- Scope: a storage contract is profile-local even when the CEL type and operation are shared. A field whose storage falls outside the contract is outside the profile's supported input domain, and the profile does not detect that at translation time.
- Prohibited alternatives: "column requirement", "mapping rule".
- Related concepts: [Supported input domain](#supported-input-domain), [Translation library](#translation-library), [Query field path](#query-field-path).

### Capability profile

The machine-readable declaration of what one profile major version supports, published as `protoutil.celql.v1.DialectCapabilityProfile`. A profile publishes a base capability profile. A constructed translator publishes an effective capability in the same message type. Every rule that decides acceptance or rejection appears in an enumerated or structured field rather than in prose.

- Prohibited alternatives: "feature matrix", "capability manifest".
- Related concepts: [Profile](#profile), [Effective capability](#effective-capability).

### Effective capability

The capability profile of one constructed translator after it materializes its selected profile and translation libraries.

- Related concepts: [Capability profile](#capability-profile), [Translation library](#translation-library).

### Translatable fragment

The exact set of expression forms one translator can translate correctly. The effective translatable fragment combines the selected profile's base fragment with the additive fragments of its selected translation libraries. A fragment restricts by resolved overload, operand type, operand shape, and other semantic conditions, so supporting an overload does not imply supporting every use of it.

- Related concepts: [Operand shape](#operand-shape), [Resolved overload](#resolved-overload).

### Predicate

A query fragment expressing one Boolean condition. A predicate is not a complete query and carries no selection list, ordering, pagination, or transaction behavior.

- Prohibited alternatives: "filter", "clause", "where clause" (each names a target-specific construct rather than the concept).

### Translation outcome

The result of a successful translation: `match_all`, `match_none`, or a predicate. `match_all` and `match_none` mean the expression is unconditionally true or unconditionally false across the profile's supported input domain, and are distinct from a predicate that happens to select every record or no record.

- Prohibited alternatives: "empty predicate" for either constant outcome.
- Related concepts: [Predicate](#predicate), [Supported input domain](#supported-input-domain).

### Supported input domain

The set of records and values for which a profile guarantees that its predicate selects a record exactly when the checked expression evaluates to true. Correctness claims hold only inside this domain.

- Related concepts: [Profile](#profile).

### Query field path

An identifier or selection path that remains after the caller substitutes every value known independently of the queried record. It maps directly to a field path in the selected dialect.

- Scope: a translator performs no application-specific schema discovery or field mapping; it applies only mechanical dialect encoding such as quoting and escaping.
- Prohibited alternatives: "column", "attribute", "field reference".

### Resolved overload

The specific CEL overload a checker bound to a call, identified by overload identifier. A dialect keys its behavior on this rather than on the source function name, because one name can resolve to several overloads with different semantics.

- Related concepts: [Translatable fragment](#translatable-fragment).

### Operand shape

The role one operand plays at one operand position: a query field path, a constant value, a translated expression, a scoped comprehension variable, or a collection element. A profile declares support per position.

- Prohibited alternatives: "operand kind", "argument form".
- Related concepts: [Translatable fragment](#translatable-fragment).

### Output growth

The size of generated output, counted in the deterministic unit a profile declares. It is limited separately from input size, because one small expression can expand into a large predicate.

- Related concepts: [Profile](#profile).

### Core conformance

Conformance cases that test behavior holding for every dialect. Core cases assert outcome kinds and error codes only, never target query syntax.

- Prohibited alternatives: "base conformance", "generic conformance".
- Related concepts: [Profile conformance](#profile-conformance).

### Profile conformance

Conformance cases that test one dialect profile at one major version and assert that profile's real declared output message.

- Related concepts: [Core conformance](#core-conformance), [Differential conformance](#differential-conformance).

### Differential conformance

Testing a profile by evaluating the checked expression with a CEL evaluator, executing the translated predicate against the real target query system, and requiring the two selected record sets to be equal.

- Prohibited alternatives: "round-trip test", "integration test".
- Related concepts: [Profile conformance](#profile-conformance).

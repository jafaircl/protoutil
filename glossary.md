# Project Glossary

This glossary defines domain terms used across the project. Each entry names one concept; project artifacts MUST use these terms rather than paraphrasing them.

Entries currently cover `packages/cel/src/composition/` (CEL environment and checked-expression composition). Add further sections here as later features introduce their own domain terms.

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

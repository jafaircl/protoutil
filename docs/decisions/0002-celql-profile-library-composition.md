# Use profile classes and translation libraries for the celql TypeScript API

- Status: accepted
- Date: 2026-08-13
- Decision makers: project owner
- Supersedes: [ADR 0001](0001-celql-typescript-api.md)

## Context and problem statement

The former celql API exposed dialect visitor classes. Independent overload extensions did not compose because a JavaScript class has one superclass path and recursive visitor overrides depended on inheritance order.

Applications need two distinct extension mechanisms. A subclass must be able to customize one target profile, while named libraries must compose additional CEL overloads. The package is unpublished, has no downstream consumers, and remains at major version zero, so it does not need a compatibility adapter for the former API.

## Decision drivers

- Compose independent translation extensions without inheritance or mixins.
- Let applications subclass a built-in profile for target-specific behavior.
- Keep profile selection explicit and versioned.
- Preserve recursive dispatch for library operations nested inside base operations.
- Detect conflicting overload ownership before an operation begins.
- Keep library selection immutable for the lifetime of a translator.
- Represent selected libraries in machine-readable capabilities and conformance data.
- Keep concrete dialect implementations out of the root package entry point.
- Preserve exact predicate output, error behavior, limits, atomicity, and operation-state isolation.

## Considered options

1. Bind a translator to a constructed, subclassable profile and named translation libraries.
2. Bind a translator to a profile factory that creates per-call operation objects.
3. Compose dialect classes with TypeScript mixins.
4. Accept independent top-level function handlers beside libraries.

An operation factory makes built-in profile customization depend on an additional public abstraction. Mixins make overload composition depend on an inheritance chain and override order. Independent top-level handlers duplicate the contribution model because a local application can define a local library.

## Decision outcome

The package will expose:

```ts
const translator = createTranslator(new PostgreSqlProfile(), {
  libraries: [caseInsensitiveStrings()],
});
```

A profile class owns its target capability, output schema, configuration rules, validation, and translation. The translator calls the constructed profile directly. A translation library owns a stable name and major version, CEL compile and evaluation options, its dependencies, its operation capability declarations, and its operation translations. The same library object configures the CEL environment and celql translator.

Translator construction materializes one immutable overload registry. One library name identifies one semantic library definition. A selected library may add an overload but may not replace an overload owned by the profile or another library. Duplicate occurrences of the same library name and major version are idempotent. Conflicting major versions fail during construction.

Each profile method creates fresh internal translation state. Recursive traversal resolves every call through the materialized registry, including calls nested inside Boolean operations and comprehensions.

The effective capability contains the selected library references and their added operation declarations. A conformance expectation may select library references. Omitting a provided library from an expectation leaves its overloads unsupported. A runner that does not provide a referenced library reports that expectation as unavailable rather than as passed or rejected by translation.

The root entry point exports only target-independent APIs and contracts. Each concrete profile and its compatible library bindings live in a separate source folder and use a target subpath such as `@protoutil/celql/postgresql`.

Shared translation contexts MUST expose only operations whose semantics and rendering are target-independent. A target-specific library MUST use a context declared and implemented by its target profile; it MUST NOT add target-specific methods, types, or SQL syntax to a shared core context.

The implementation removes the former public dialect visitor API without a compatibility adapter. Built-in profiles are normal exported classes. Applications construct and may subclass them. Profile names, profile major versions, output protobuf messages, translation outcomes, and error codes remain unchanged.

## Consequences

- One translator can use base operations and several independent translation libraries.
- Standard case-sensitive operations and library-defined case-insensitive operations can occur in one expression.
- Library conflicts fail before validation or translation can produce partial output.
- A library binding can use one portable library identity across target subpaths while keeping target code isolated.
- Capability inspection depends on the constructed translator because installed libraries change the effective translatable fragment.
- Target customization uses subclasses of built-in profile classes.
- Added CEL overloads use named libraries and do not depend on profile inheritance.
- Internal per-call translation contexts isolate mutable state and are not part of the public profile contract.
- Each target subpath must export its profile and compatible library bindings explicitly.

# Composable celql profile libraries

- Status: accepted
- Date: 2026-08-13
- Owner: project owner

## Summary

Replace the public celql dialect visitor API with profile classes and named translation libraries. A caller constructs one profile and selects zero or more libraries when it creates a translator:

```ts
import { createTranslator } from "@protoutil/celql";
import {
  PostgreSqlProfile,
  caseInsensitiveStrings,
} from "@protoutil/celql/postgresql";

const translator = createTranslator(new PostgreSqlProfile(), {
  libraries: [caseInsensitiveStrings()],
});
```

Profiles own target fundamentals and can be subclassed for target-specific behavior. Libraries add resolved CEL overload translations. The package exposes profiles through target-specific subpaths.

## Motivation

The former public API used dialect classes and protected visitor overrides for both target behavior and CEL overloads. Independently authored overload extensions did not compose. Combining two extensions required another subclass that knew both inheritance paths and resolved their override order.

CEL environments already solve the analogous problem with named libraries. celql needs the same construction model so applications can select several independent translation extensions without inheritance or mixins.

The package also needs target-specific entry points. Importing the translation core must not import unrelated dialect implementations.

## Goals

- Let one translator use base profile operations and multiple translation libraries.
- Let an application subclass a built-in profile for target-specific behavior.
- Keep standard CEL operations and added overloads available at the same time.
- Make recursive translation use the same composed overload registry at every expression depth.
- Give each library a stable name and major version.
- Detect incompatible library combinations when the translator is created.
- Let language-neutral conformance expectations select the libraries they require.
- Let one conformance case prove both success with a library and rejection without it.
- Expose each dialect through a package subpath.

## Non-goals

- Change CEL parsing, checking, or evaluation.
- Load libraries dynamically during one translation operation.
- Let a library silently replace an existing overload translation.
- Add backward compatibility for the unpublished class-based API.
- Require a database driver at translation runtime.
- Define case-insensitive string semantics in this RFC.

## Guide-level design

### Translator construction

`createTranslator(profile, options)` accepts one constructed profile. `options.libraries` contains translation libraries. Omitting the option selects only the operations built into the profile.

A translator materializes the profile and libraries once. It calls `profile.validate` and `profile.translate` directly. Each profile call creates fresh internal state for parameters, limits, output growth, and diagnostics.

### Profiles

A profile class supplies:

- its capability profile;
- its predicate output schema;
- its target-family translation implementation;
- profile-configuration validation;
- the built-in operation translations required by the profile contract.

The package exports each built-in profile as a normal class. A caller constructs it with `new` and may subclass it to customize target behavior. A subclass uses the inherited capability unless it defines a distinct versioned profile contract. New CEL overloads belong in translation libraries, not in profile overrides.

### Translation libraries

A translation library supplies:

- a stable library reference;
- CEL compile and evaluation options;
- optional required library references;
- operation capability declarations;
- translations for the overload identifiers it owns.

A library is target-compatible by construction. A target subpath can export a target binding under the same portable library identity as another target subpath. For example, the PostgreSQL and MySQL subpaths can each export `caseInsensitiveStrings()` while using different target translations.

One library name identifies one semantic library definition. The translator treats two occurrences of the same library name and major version as one singleton library. It rejects different major versions under one library name.

A library cannot claim an overload identifier already owned by the profile or another selected library. Replacement semantics require a different profile.

### Effective capability

`translator.capability()` returns the materialized capability. It contains the selected profile's capabilities, the selected library references, and the operations added by those libraries.

### Conformance

Each profile expectation can list library references. The conformance runner resolves those references before it creates the translator.

If the runner does not provide a referenced library, the expectation is unavailable and is not a pass or a translation rejection. If the runner provides the library but an expectation omits it, the translator does not install it. A checked call owned by that omitted library fails with `UNSUPPORTED_OVERLOAD`.

### Package entry points

The root entry point exports the translator, errors, profile and library contracts, and common protobuf types. It does not import or re-export a concrete dialect.

Target entry points export their profile, output types, configuration types, and compatible library bindings:

- `@protoutil/celql/ansisql`
- `@protoutil/celql/postgresql`
- `@protoutil/celql/mysql`
- `@protoutil/celql/mongodb`
- `@protoutil/celql/sqlite`

Each target implementation and its entry point live in a separate source folder, such as `src/ansisql/` or `src/postgresql/`.

Subpath isolation controls the module graph. A dialect that needs an unavoidable large runtime dependency belongs in a separate package because package subpaths do not change package-manager installation behavior.

## Reference-level design

The public TypeScript shapes are equivalent to:

```ts
interface Profile<Desc extends DescMessage> {
  readonly capability: DialectCapabilityProfile;
  readonly outputSchema: Desc;
  readonly validate: (
    context: ProfileContext,
    functions: ReadonlyMap<string, OperationTranslation>,
  ) => void;
  readonly translate: (
    context: ProfileContext,
    functions: ReadonlyMap<string, OperationTranslation>,
  ) => MessageShape<Desc>;
}

interface TranslationLibrary extends SingletonLibrary, LibraryVersioner {
  readonly reference: LibraryReference;
  readonly profile: ProfileReference;
  readonly requiredTranslationLibraries?: readonly LibraryReference[];
  readonly functions: readonly TranslationFunction[];
}

interface TranslationFunction {
  readonly capability: OperationCapability;
  readonly translate: OperationTranslation;
}
```

The same library object is accepted by the CEL environment and celql translator. Its CEL singleton name and version must equal its `LibraryReference` name and major version.

The implementation can use narrower target-family contexts for library translations. A shared translation context MUST contain only target-independent operations. A target-specific operation MUST be declared on a target-profile context and MUST NOT be added to a shared core context. Those contexts must preserve parameter binding, path encoding, resource limits, diagnostic redaction, and recursive dispatch through the materialized registry.

`LibraryReference` is part of the public protobuf contract. `DialectCapabilityProfile` records the installed library references. `ProfileExpectation` records the libraries selected for that execution.

Library references form an unordered set. Resolution applies dependencies before materialization, but dependency order and caller input order do not change translation output.

## Compatibility

This is a breaking TypeScript API change. The package is unpublished, has no downstream consumers, and remains at major version zero. The implementation removes `Dialect`, `SqlDialect`, `DialectConstructor`, `AnsiSqlDialect`, and `PostgreSqlDialect` from the public API without an adapter.

The existing profile names, profile major versions, predicate protobuf messages, translation outcomes, error codes, and predicate output remain unchanged. Existing conformance cases that select no libraries retain their current meaning.

## Testing

- Unit tests verify profile selection, effective capabilities, singleton library resolution, dependency resolution, overload-conflict rejection, output-type enforcement, and isolated per-call state.
- A regression test translates a library overload nested inside base Boolean operations.
- Conformance fixtures verify success with an explicitly selected library and `UNSUPPORTED_OVERLOAD` when the same library is omitted.
- Conformance-runner tests distinguish an unavailable referenced library from an expected translation rejection.
- Existing ANSI SQL and PostgreSQL exact-output cases remain unchanged and pass through the new registry.
- Differential conformance compares PostgreSQL, MySQL, MongoDB, and SQLite record sets with CEL evaluation.
- Build tests verify that the root and target subpath exports resolve independently.

## Drawbacks

- Profile and library implementations need an explicit registry contract.
- A portable semantic library needs one binding per target profile family.
- Callers must choose between profile subclassing for target behavior and libraries for new CEL overloads.
- The effective capability depends on translator construction rather than the profile object alone.

## Alternatives

### Use profile factories

A factory can create isolated per-call operation objects. It adds a public abstraction that callers must understand and makes built-in target customization depend on factory internals.

### Use TypeScript mixins

Mixins can construct a combined subclass, but composition order becomes part of recursive method dispatch and conflict detection remains implicit. The selected design uses profile subclasses only for target behavior and explicit library ownership for CEL overloads.

### Accept both libraries and top-level functions

A separate `functions` option is smaller for local handlers, but it creates two ways to contribute the same behavior. A local application can define a local library, so the selected API accepts libraries only.

### Create a new profile for every library combination

This preserves a fixed profile capability but forces applications to invent profile names for ordinary additive extensions. Explicit library references identify the effective contract without multiplying profile identities.

## Unresolved questions

None.

## Future possibilities

- Additional SQL and document-query profiles can use the same core contract.
- Tooling can validate that the CEL environment and celql translator select matching semantic libraries.
- Portable envelopes can include selected library references when translated outcomes need to carry the complete effective contract.

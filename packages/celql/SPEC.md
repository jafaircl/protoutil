# celql Specification

Status: Draft v0.12

The schema for this specification is `protoutil/celql/v1/celql.proto`. The conformance schema is `protoutil/celql/conformance/v1/conformance.proto`.

## 1. Purpose

`celql` translates a checked CEL expression into a predicate for a query dialect.

The input is a standard `cel.expr.CheckedExpr` protobuf message.

The output is a dialect-defined predicate.

The source of the checked expression does not matter. A conforming producer can use any CEL parser, checker, partial evaluator, expression rewriter, or other implementation.

A conforming translator does not parse CEL source text. It does not type-check CEL source text. It does not evaluate CEL expressions. It does not execute queries.

## 2. Scope

This specification defines:

- the input requirements;
- the translation contract;
- the dialect profile contract;
- the translation library contract;
- the security requirements;
- the resource limits;
- the error model;
- the versioning model;
- the conformance requirements.

This specification does not define:

- a CEL parser;
- a CEL checker;
- a CEL evaluator;
- partial evaluation;
- variable substitution;
- application schema discovery;
- application field mapping;
- a preferred query dialect;
- a preferred database;
- a preferred query library;
- full query construction;
- query execution;
- database connections;
- transaction handling;
- an internal traversal algorithm;
- an implementation language.

## 3. Normative Terms

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHALL`, `SHALL NOT`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in BCP 14 [RFC 2119] [RFC 8174] when, and only when, they appear in all capitals, as shown here.

- [RFC 2119]: https://www.rfc-editor.org/rfc/rfc2119
- [RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174

## 4. Terms

### 4.1 Checked expression

A checked expression is a `cel.expr.CheckedExpr` protobuf message.

It contains a CEL expression tree, resolved types, and resolved references.

### 4.2 Query field path

A query field path is an identifier or selection path that remains after the caller prepares the checked expression.

A query field path MUST map directly to a field path in the selected dialect.

### 4.3 Variable substitution

Variable substitution replaces a CEL variable with a CEL constant or another checked expression before query translation.

The caller performs variable substitution before it calls the translator.

### 4.4 Dialect

A dialect defines how supported CEL operations map to one target query language.

### 4.5 Profile

A profile is a versioned dialect contract.

A profile defines:

- accepted input forms;
- supported CEL types and overloads;
- query field path rules;
- null and absence behavior;
- regular-expression behavior;
- comprehension behavior;
- output protobuf type;
- parameter and value behavior;
- typed operand and operand-shape restrictions;
- required rejection cases.

### 4.6 Translation library

A translation library is a named and versioned extension to a profile's translatable fragment.

A translation library declares and evaluates the resolved overloads that it adds and supplies target-compatible translations for those overloads. One library object configures both a CEL environment and a translator.

A CEL library is the target-independent part of one library: its type declarations, function declarations, and CEL evaluation. Every translation library that publishes the same library name and major version MUST carry the same CEL library, so one CEL expression has one meaning across every target that binds it. An implementation SHOULD let a caller select a CEL library without a profile binding, because a differential test oracle evaluates CEL without translating it.

### 4.7 Effective capability

An effective capability is the machine-readable capability of one translator after it materializes its selected profile and translation libraries.

### 4.8 Predicate

A predicate is a query fragment that represents one Boolean condition.

A predicate is not a full query.

## 5. Architecture

The conceptual flow is:

```text
checked CEL expression
        |
        v
query translation
        |
        v
dialect-defined predicate
```

The translator is constructed for exactly one dialect profile, one profile major version, and an unordered set of translation libraries.

The translator accepts checked expressions only for that bound profile and library set.

The translator returns one complete translation outcome or one error.

A successful translation outcome is `match_all`, `match_none`, or a dialect-defined predicate.

The specification does not define how an implementation traverses the CEL expression.

## 6. Input Requirements

### 6.1 Root type

The root expression type MUST be exactly CEL `bool`.

The translator MUST reject a root type of `dyn`.

The translator MUST reject an optional Boolean root.

The translator MUST reject any other root type.

### 6.1.1 Optional values

CEL `optional_type` is not restricted to the root.

A profile MUST declare whether it supports `optional_type` at any operand position.

A profile that does not declare support MUST reject each reachable node whose resolved type is an `optional_type`, and each resolved overload that introduces or consumes an optional value.

The applicable error code is `unsupported expression` for an optional-typed node and `unsupported overload` for an optional-producing or optional-consuming overload.

A profile that declares support MUST define the translation of optional presence, optional absence, and optional unwrapping for every supported operation.

### 6.2 Checked form

The input MUST contain enough checked information for translation.

Each reachable node that requires a type MUST have a valid type entry.

Each reachable identifier or call that requires a reference MUST have a valid reference entry.

The translator MUST NOT perform type inference to repair an incomplete checked expression.

### 6.3 Reachable nodes

The translator MUST process the nodes that are reachable from the root expression.

The translator MUST validate each reachable node and each metadata entry that it uses.

An implementation MAY reject malformed unreachable metadata.

### 6.4 Node identifiers

Each reachable expression node MUST have a valid node identifier.

Reachable node identifiers MUST be unique.

### 6.5 Errors and unknowns

The caller MUST NOT submit an expression result that contains an unresolved CEL error or unknown value.

If the input representation exposes an unresolved CEL error or unknown value, the translator MUST reject it.

A standard `cel.expr.CheckedExpr` does not normally contain runtime CEL errors or unknowns.

A remaining query field path is not a CEL unknown.

A dialect MAY translate an expression that can produce a data-dependent CEL error only when it preserves the applicable CEL behavior for all values in the profile's supported domain.

A dialect MUST reject the expression when it cannot preserve that behavior.

### 6.6 Query field paths

Before translation, the caller SHOULD evaluate or substitute each value that is known independently of the queried record.

Before translation, the caller MUST substitute each variable that does not represent queryable data.

Each remaining identifier or selection MUST map directly to a query field path.

The translator MUST NOT perform application-specific schema discovery.

The translator MUST NOT perform application-specific field mapping.

The dialect MAY apply mechanical dialect encoding. Mechanical encoding includes identifier quoting and path escaping.

The dialect MUST reject a field path that it cannot encode directly, safely, and without ambiguity.

## 7. Translation Contract

The abstract operations are:

```text
CREATE_TRANSLATOR(profile, libraries)
    -> translator | translation_error

TRANSLATE(translator, checked_expression, limits, profile_configuration)
    -> match_all | match_none | dialect_predicate | translation_error

VALIDATE(translator, checked_expression, limits, profile_configuration)
    -> valid | translation_error
```

The translator MUST:

1. validate the reachable checked expression;
2. verify that the root type is CEL `bool`;
3. enforce the configured resource limits throughout the operation;
4. apply the profile, profile version, and translation libraries bound at translator construction;
5. translate each reachable expression part;
6. reject each expression part that the profile cannot translate correctly;
7. return `match_all`, `match_none`, or one complete predicate result of the profile's declared output protobuf type.

This list enumerates obligations, not an execution order. An implementation MAY interleave them in any order that produces the required outcome. In particular, obligation 3 is a continuous obligation rather than a single phase; section 16 requires limits to be enforced while the translator consumes input and produces output, not only before or after.

### 7.1 Logical validation phase

Translation MUST include a logical validation phase before predicate generation.

The validation phase MUST verify that the complete reachable expression is inside the translator's effective translatable fragment.

An implementation MAY expose this validation phase as a separate operation.

A separate validation operation MUST apply the same profile rules as translation.

The specification does not require a separate public validation function.

### 7.2 Translation behavior

The translator MUST NOT:

- evaluate the expression;
- execute a query;
- omit a subexpression;
- weaken a subexpression;
- approximate a subexpression;
- return usable partial output after a failure.

Translation MUST be atomic.

If one reachable expression part cannot be translated correctly and safely, the complete translation MUST fail.

For the same translator, checked expression, profile configuration, and limits, the translator MUST produce an equivalent result or an equivalent error.

State from one translation operation MUST NOT affect another translation operation.

## 8. Semantic Correctness

A dialect MUST reject each expression that it cannot translate with equivalent semantics.

A profile MUST define its supported input domain.

The profile and each compatible translation library MUST identify their contribution to the supported input domain. The effective supported input domain MUST identify:

- supported CEL types;
- supported resolved overloads;
- supported custom overloads;
- supported field value representations;
- supported null and absence behavior;
- supported error behavior;
- supported regular-expression behavior;
- supported comprehension forms.

For each record in the supported input domain, the generated predicate MUST select the record if and only if the checked CEL expression produces `true` under the profile's declared CEL evaluation model.

A generated predicate MUST NOT select a record when the checked CEL expression produces `false`.

A profile MUST define or reject cases in which CEL evaluation can produce an error or unknown result.

A dialect MUST NOT use an implicit conversion that changes CEL semantics.

A dialect MUST reject an operation when the target query language cannot preserve the CEL value range, comparison behavior, ordering behavior, or result behavior.

A dialect MUST reject an operation whose result depends on external state, nondeterministic behavior, or execution-time context unless the target query language represents that behavior with equivalent semantics.

The caller SHOULD substitute known time, environment, request, and external-data values before translation.


### 8.1 Semantics-preserving rewrites

An implementation MAY normalize, simplify, or rewrite an expression before it emits a predicate.

It MUST apply a rewrite only when the rewrite preserves CEL semantics for all values in the profile's supported input domain.

A rewrite MUST preserve:

- Boolean grouping;
- operand meaning;
- null and absence behavior;
- error behavior;
- unknown behavior, when applicable;
- type and value ranges;
- scoped variable bindings.

A profile MUST define rewrite behavior that changes its translatable fragment, accepted input domain, outcome kind, or other observable translation behavior.

An implementation does not need to expose an internal rewrite that does not change acceptance, outcome kind, predicate semantics, or another observable result.

The implementation MUST reject an expression when a required rewrite cannot preserve the applicable CEL semantics.

## 9. Dialect Profiles

### 9.1 Profile selection

The caller MUST select one profile and one profile major version explicitly when it constructs a translator.

The caller MAY select zero or more translation libraries when it constructs a translator.

One translator instance MUST be bound to exactly one profile major version.

A translation or validation operation MUST NOT accept a per-operation profile or translation-library override.

An implementation MUST NOT infer a profile from the expression.

An implementation MUST NOT silently use a different profile when the selected profile rejects an expression.

This specification defines no default profile. Translator construction always requires an explicit profile, including when only one profile is available.

Beyond the baseline profile in section 9.6, this specification does not prefer any query dialect. An implementation MAY provide any further set of dialect profiles.

### 9.2 Custom dialects

The profile model MUST support dialect profiles that are defined independently of this specification.

A conforming implementation MUST NOT require a profile to be named or standardized by this specification.

An implementation MAY choose how profiles are made available. It MAY use static inclusion, registration, generated code, plugins, or another mechanism. An implementation MAY ship a closed set of profiles.

Every profile that an implementation accepts MUST comply with the core correctness, security, limit, versioning, and error requirements.

Every accepted profile MUST declare one exact protobuf output type.

### 9.3 Resolved overloads

A dialect MUST identify a CEL operation by its resolved overload identity.

A dialect MUST NOT rely only on the source-level function name.

The same rule applies to standard CEL overloads and custom CEL overloads.

A dialect MUST reject an overload when its semantics are not fully defined for that dialect.

### 9.4 Translatable fragment

Each dialect profile MUST define its base translatable CEL fragment.

Each translation library MUST define the additive expression forms that it can translate correctly for the selected profile.

The effective translatable fragment is the union of the profile's base fragment and the fragments of the selected compatible translation libraries.

The fragment MAY restrict an operation by:

- resolved overload identity;
- operand type;
- operand position;
- constant or query-field-path position;
- field-to-field use;
- use under negation;
- Boolean nesting;
- comprehension form;
- null or absence behavior;
- another semantic condition required by the target query language.

A translator MUST reject an expression outside its effective translatable fragment.

Support for an overload identifier alone MUST NOT imply support for all valid uses of that overload.

A machine-readable capability declaration MUST identify the supported operand types and operand shapes for each declared operation.

An operand shape is the role one operand plays at one position. The defined shapes are the values of `protoutil.celql.v1.OperandShape`:

- a query field path;
- a constant value;
- another translated expression;
- a scoped comprehension variable;
- a collection element.

A restriction that spans more than one position, such as permitting or rejecting a field-to-field comparison, is expressed as the combination of the per-position shapes the profile declares, and where necessary as an entry in `OperationCapability.additional_restrictions`. It is not itself an operand shape.

If a profile recognizes a lowered macro or comprehension form, it MUST validate the complete required expression structure.

A profile MUST reject a near match, malformed form, or ambiguous form.

A profile MUST NOT classify a macro or comprehension from one node, one type, or another incomplete structural test.

### 9.5 Capability profile

Each dialect profile MUST publish a machine-readable base capability profile as a `protoutil.celql.v1.DialectCapabilityProfile` message.

The capability profile MUST identify:

- the profile name;
- the profile major version;
- the output protobuf type name;
- supported CEL types;
- supported operations, each identified by its resolved overload identifier, with the accepted operand types and operand shapes for every operand position;
- supported comprehension forms;
- null behavior;
- absence behavior;
- regular-expression behavior;
- parameter style;
- parameter composition behavior, when applicable;
- the output-growth unit and the default output-growth limit;
- default resource limits;
- additional cost or rejection rules.

Standard and custom overloads are declared through the same `operations` field. There is no separate declaration for custom overloads.

Every element of the capability profile that determines whether a given expression is accepted or rejected MUST be expressed in an enumerated or structured field. A profile MUST NOT state such a rule only in a documentation string.

The `*_documentation` fields carry explanatory prose. They MUST NOT be the sole statement of any rule that affects translation behavior. They are the correct place for material that cannot be enumerated, such as the complexity differences required by section 14.

A constructed translator MUST publish its effective capability as a `protoutil.celql.v1.DialectCapabilityProfile` message.

The effective capability MUST contain every selected translation-library reference and every operation that those libraries add.

The effective capability MUST retain the selected profile's identity, output type, target semantics, and resource-limit defaults.

### 9.6 Baseline profile

A conforming implementation MUST provide the ANSI SQL profile defined in `profiles/ANSI_SQL_V1.md`.

The baseline profile is `protoutil.celql.ansisql` at major version 1. Its target language is the SQL defined by ISO/IEC 9075.

The baseline profile gives every implementation one dialect with a fixed translatable fragment, a fixed output type, and fixed emitted output. Two consequences follow. A caller can target a portable dialect without depending on which further profiles an implementation ships. Core conformance always has a profile to select, because at least one profile always exists.

An implementation MUST NOT change the baseline profile's translatable fragment, output type, or emitted output.

WHEN a target differs from ISO/IEC 9075, the implementation MUST provide an extending profile under section 9.7. It MUST NOT modify the baseline profile to fit that target.

### 9.7 Profile extension

A profile MAY extend another profile. The extended profile is the base profile.

An extending profile MUST declare its base profile name and base profile major version in its capability profile.

An extending profile exists so that a concrete target can emit correct output for expressions the baseline already accepts, and can accept expressions the baseline cannot express.

An extending profile MUST accept every expression that its base profile accepts. An extending profile MUST NOT remove an operation, operand shape, or CEL type that its base declares.

An extending profile MAY declare further operations, operand shapes, CEL types, comprehension forms, and regular-expression support.

An extending profile MUST select the same records as its base profile for every expression the base accepts, over the intersection of the two supported input domains.

An extending profile MAY emit different output text, a different parameter style, and different identifier encoding. Output equality with the base profile is not required, because the reason to extend is that the target differs.

An extending profile MAY declare the base profile's output type or its own output type.

An extending profile MUST comply with every core requirement in its own right. Extension does not transfer conformance. A profile that extends the baseline MUST still pass core conformance and MUST publish its own profile conformance suite.

A profile MUST NOT declare a base profile that itself declares a base profile. Extension is one level deep, so a caller can determine the full contract from two documents rather than a chain.

An extending profile MUST use a profile name that differs from its base profile name.

### 9.8 Translation library composition

`CELQL-LIB-001`: A translation library MUST publish a `LibraryReference` that
contains a non-empty stable name and a non-zero major version.

`CELQL-LIB-002`: A translation library name MUST uniquely identify one semantic
library definition within an implementation.

`CELQL-LIB-003`: WHEN the caller selects the same library name and major version
more than once, the translator MUST materialize that singleton library once.

`CELQL-LIB-004`: WHEN the caller selects different major versions under one
library name, translator construction MUST fail with `invalid library
configuration`.

`CELQL-LIB-005`: WHEN a selected library requires another library that is not
selected at the required major version, translator construction MUST fail with
`invalid library configuration`.

`CELQL-LIB-006`: WHEN a selected library declares an overload identifier owned
by the profile or another selected library, translator construction MUST fail
with `invalid library configuration`.

`CELQL-LIB-007`: A translation library MUST publish one
`OperationCapability` for each resolved overload that it adds.

`CELQL-LIB-008`: A translation library MUST supply one target-compatible
translation for each operation that it declares.

`CELQL-LIB-009`: A translation library MUST NOT replace the translation of an
overload declared by the selected profile.

`CELQL-LIB-010`: WHEN a checked expression contains an overload owned by a
library that is not selected, the translator MUST reject the expression with
`unsupported overload`.

`CELQL-LIB-011`: The caller's library order MUST NOT change the effective
capability, translation output, or error.

`CELQL-LIB-012`: The translator MUST use the same materialized operation
registry for a library overload at every expression depth.

`CELQL-LIB-013`: A translation or validation operation MUST create fresh
mutable operation state and MUST NOT modify the selected profile, selected
libraries, or materialized operation registry.

`CELQL-LIB-014`: A translation library MUST preserve the CEL semantics of each
overload that it declares over its documented supported input domain.

`CELQL-LIB-015`: WHEN a translation library cannot preserve its declared CEL
semantics for the selected target, the library MUST reject the expression.

`CELQL-LIB-016`: WHEN a selected translation-library binding identifies a
different profile name or major version from the selected profile, translator
construction MUST fail with `invalid library configuration`.

`CELQL-LIB-017`: A translation library's CEL singleton name and version MUST
equal its `LibraryReference` name and major version.

Profile extension and translation-library composition are different concepts.
Profile extension specifies target compatibility under section 9.7. A
translation library adds resolved overloads to one constructed translator and
does not change the selected profile's identity.

## 10. Translation Outcomes

A successful translation MUST produce exactly one of these outcomes:

- `match_all`;
- `match_none`;
- a dialect-defined predicate.

`match_all` means that the checked expression is unconditionally `true` for the profile's supported input domain.

`match_none` means that the checked expression is unconditionally `false` for the profile's supported input domain.

A translator MUST NOT encode `match_all` or `match_none` as an empty predicate.

A caller MUST treat `match_all` and `match_none` as distinct outcomes.

The dialect-defined predicate outcome MUST contain the profile's declared output protobuf type.

### 10.1 When the constant outcomes are produced

The translator MUST return `match_all` when the root expression is a Boolean constant `true`.

The translator MUST return `match_none` when the root expression is a Boolean constant `false`.

A profile MUST define which other expression forms, if any, translation reduces to `match_all` or `match_none`. This behavior is part of the observable profile contract.

Two conforming implementations of the same profile major version MUST agree on the outcome kind for those expression forms.

An implementation MAY perform additional internal constant folding when that folding does not change the required outcome kind, predicate semantics, or another observable result.

Section 8.1 governs the correctness of all rewrites and folding.

## 11. Output Contract

### 11.1 Dialect-defined output

Each dialect profile MUST define exactly one protobuf message type for successful translation output.

The output type is part of the profile contract.

The output type MUST remain stable for the lifetime of the profile major version.

The output MUST contain only a predicate or filter fragment and the data required to use that fragment.

The output MUST NOT contain query-execution state, database connections, transactions, or a complete query statement.

### 11.2 Parameters and values

A profile that produces textual query syntax MUST define how parameters are represented and associated with the predicate text.

The output MUST contain enough information for the caller to bind each parameter without parsing or modifying the predicate.

A textual profile MUST define how its parameter references compose with parameters outside the generated predicate.

If the target syntax uses numbered positional parameters, the profile MUST support a caller-supplied starting position or another safe composition mechanism.

The composition mechanism MUST NOT require the caller to rewrite generated predicate text.

A profile that produces structured query data MUST define which parts are query structure and which parts are data values.

A profile that supports an operation over a collection constant MUST define whether the collection binds as one composite parameter or as one parameter per element, and MUST apply that rule consistently. The parameter-count limit in section 16 applies to the parameters the profile actually emits under that rule.

The output protobuf MUST preserve each supported CEL value without silent loss.

### 11.3 Optional portable envelope

An implementation MAY provide a portable translation envelope for systems that select profiles at runtime.

The envelope MAY contain the profile reference and an `Any` value.

The selected profile MUST define the one permitted protobuf type for the `Any` value.

The envelope MUST NOT permit a different output type for the same profile major version.

Use of the envelope is not required for normal in-process translation APIs.

## 12. Parameter and Value Safety

A value from a CEL constant MUST remain data during translation.

A value from a CEL constant MUST NOT become:

- an identifier;
- a field path;
- an operator;
- a function name;
- a query keyword;
- a script;
- raw query syntax.

A profile that emits textual query syntax MUST use bound parameters for CEL string values.

A profile that emits textual query syntax MUST use bound parameters for CEL bytes values.

A profile MUST NOT escape and concatenate a CEL string or bytes value into textual query syntax.

A profile SHOULD use bound parameters for other CEL constant values when the target system supports safe parameter binding for those values.

A profile MAY encode a CEL value directly as a typed structured data value when the target query API cannot interpret that value as query structure.

If a profile translates an operation through a target pattern language, it MUST encode or escape each data character that the target would otherwise interpret as pattern syntax.

The translated pattern MUST preserve the source CEL operation's literal-value semantics.

Safe parameter binding does not remove this requirement.

The core translation interface MUST NOT accept raw query fragments from the checked expression.

Trusted profile configuration MAY contain query structure when the profile defines that configuration.

A dialect MUST NOT derive trusted query structure from CEL constant values.

## 13. Null and Absence

CEL `null` is the normative explicit null value.

A dialect MUST preserve CEL `null` semantics for each supported operation.

A profile MUST define the behavior of an absent query field.

If the target system does not distinguish absence from null, the profile MUST either define an equivalent supported domain or reject expressions that require the distinction.

A profile MUST define the relationship between:

- CEL `null`;
- an absent query field;
- a target-system null value;
- a target-system default value, when applicable.

A dialect MUST reject a translation when it cannot preserve the profile's declared behavior.

## 14. Regular Expressions

A dialect MAY translate CEL regular-expression operations.

CEL regular expressions use RE2 syntax and semantics.

A dialect that translates a regular-expression operation MUST preserve the applicable RE2 syntax and matching semantics.

A dialect MUST reject a pattern when the target query system cannot represent it with equivalent semantics.

A dialect MUST NOT enable target-specific regular-expression features that are not valid for the translated CEL operation.

A regular-expression pattern MUST remain data.

A profile that supports regular expressions MUST document material complexity differences between RE2 and the target regular-expression engine.

A profile that supports regular expressions MUST define a finite default maximum regular-expression pattern size.

Deciding whether a pattern is valid RE2, and whether the target can represent it with equivalent semantics, requires the implementation to analyze the pattern's syntax. A profile that declares `REGEX_SUPPORT_FULL_RE2` or `REGEX_SUPPORT_RE2_SUBSET` therefore requires an RE2 syntax analyzer for the accepted subset. This obligation is a consequence of the preceding requirements and is stated here so that implementers account for it.

Section 1 excludes parsing CEL source text. It does not exclude analyzing a regular-expression pattern that appears as a CEL constant.

A profile MUST NOT accept a pattern it has not analyzed.

## 15. Comprehensions

A dialect MAY support CEL comprehensions.

A profile that supports comprehensions MUST identify each supported comprehension form.

The dialect MUST preserve the semantics of each supported form.

The dialect MUST reject each unsupported comprehension form.

A translated comprehension MUST preserve the scope of each introduced variable.

A generated variable, alias, or field reference MUST NOT shadow another binding in a way that changes expression meaning.

A reference to an enclosing scope MUST continue to refer to that enclosing scope after translation.

Comprehension nesting MUST be subject to a finite configured limit.

A comprehension-capable profile MUST document how callers can use static cost-estimation facilities from compatible CEL checkers.

The documentation MUST identify any size estimate, function cost, overload cost, or other estimate input that the caller must provide.

The translator MUST NOT reimplement CEL static cost estimation as a core requirement.

When compatible CEL cost estimation is not available, the profile MUST define a finite limit or a rejection rule for the supported comprehension forms.

## 16. Resource Limits

An implementation MUST define finite default limits for:

- expression depth;
- reachable node count;
- parameter count;
- per-constant size;
- aggregate constant size;
- comprehension nesting;
- regular-expression pattern size, when regular expressions are supported;
- output growth.

These correspond one to one with the fields of `protoutil.celql.v1.TranslationLimits`.

A caller MUST be able to configure different finite limits for each of them.

An unset limit field means the selected profile's declared default. An unset limit field MUST NOT mean an unlimited value.

A configured limit MAY be lower or higher than the default limit.

The implementation MUST reject an expression that exceeds an applicable limit.

The implementation MUST apply limits during translation.

The implementation MUST NOT first create an unbounded intermediate result and only then apply a limit.

Resource accounting MUST NOT wrap or bypass a configured limit.

Each profile MUST define a finite default output-growth limit.

The profile MUST define a deterministic unit for this limit, declared as `OutputGrowthUnit`.

The unit MAY be encoded bytes, characters, structured nodes, clauses, operators, or another profile-defined measure. A profile that declares `OUTPUT_GROWTH_UNIT_PROFILE_DEFINED` MUST define how the unit is counted.

A caller MAY override the default through `TranslationLimits.max_output_growth`, expressed in the profile's declared unit.

The implementation MUST apply the output-growth limit while it generates the output.

A profile MUST define finite operation-specific limits when a supported operation can cause disproportionate output growth or target-system work.

A profile MAY define more finite limits when its output or operations require them.

## 17. Security Requirements

The translator MUST treat the checked expression as untrusted input.

The translator MUST validate each expression field that it uses.

Unknown protobuf fields MUST NOT change translation behavior unless a later compatible specification version assigns meaning to them.

A dialect MUST validate and safely encode each identifier and field path component.

A dialect MUST reject an identifier or field path that it cannot encode without ambiguity.

A structured-query dialect MUST NOT interpret a query field path as an operator name.

Structured query operators MUST come only from trusted profile translation rules.

A dialect MUST NOT silently widen the set of matching records.

A dialect MUST NOT silently narrow the set of matching records.

A dialect MUST NOT convert an error or unknown result to `true`.

Finite resource limits MUST be active by default.

Direct text inlining of CEL string and bytes values MUST NOT be configurable.

Silent omission or approximation MUST NOT be configurable.

Diagnostics MUST NOT include bound parameter values by default.

This applies to every part of `TranslationError`, including the `message` string and every entry of the `details` map.

By default, `details` MUST NOT contain a CEL constant value, a bound parameter value, or regular-expression pattern text. It MAY contain non-secret context such as the offending overload identifier, the name of the limit that was exceeded, and the configured and observed magnitudes of that limit.

An implementation MAY offer an explicitly enabled debugging mode that relaxes this rule. That mode MUST be off by default and MUST NOT be reachable through the profile configuration carried in a checked expression.

## 18. Caller Enforcement

The translator produces a predicate outcome. It does not attach, execute, or enforce that outcome.

The caller MUST apply the complete outcome to the intended query.

The caller MUST NOT execute an unrestricted query after a `match_none` outcome or a translation error.

The caller MUST NOT treat a translation error as `match_all`.

The caller MUST NOT ignore part of a dialect-defined predicate output.

The caller is responsible for binding all parameters and structured data exactly as the selected profile specifies.

## 19. Errors

Translation returns one result or one error.

The error model MUST use stable machine-readable codes.

The error message is informational.

Conformance MUST NOT depend on exact error message text.

The core error codes are:

- invalid checked expression;
- non-Boolean root;
- unresolved error value;
- unresolved unknown value;
- unsupported expression;
- unsupported overload;
- unresolved query field path;
- unsafe translation;
- resource limit exceeded;
- unsupported profile;
- unsupported profile version;
- invalid profile configuration;
- invalid profile output;
- internal error;
- invalid library configuration.

An error MUST NOT include secret constant or parameter values by default.

### 19.1 Node identification

An error MUST identify the relevant expression node when exactly one reachable node caused the error.

When more than one reachable node independently satisfies a rejection rule, the reported node is unspecified. The translator MUST still report exactly one error, and that error MUST identify one of the at-fault nodes or no node at all.

A conformance case MUST set `expression_node_id` only when exactly one reachable node can cause the expected error. A runner MUST NOT compare the reported node when the case leaves that field unset.

This keeps section 5's freedom of traversal order intact. Two implementations that walk the tree differently remain conforming.

### 19.2 Multiple applicable errors

One input MAY violate more than one requirement.

Translator construction MUST establish the selected profile, profile major version, and translation libraries. Translation MUST establish the profile configuration before it applies profile-dependent translation rules. Therefore, `unsupported profile`, `unsupported profile version`, and `invalid library configuration` are construction errors, and `invalid profile configuration` takes precedence over profile-dependent translation errors.

An implementation MAY return `resource limit exceeded` for an input-measured limit before it performs deeper expression validation or profile-fragment analysis. This rule permits early rejection of oversized untrusted input.

For other combinations of independent violations, this specification does not define a global error-precedence order. The translator MUST return one applicable error code.

A conformance case MUST avoid inputs for which more than one error code is valid.

## 20. Versioning

This specification controls core specification versions and dialect profile versioning rules.

A profile reference MUST contain a stable profile name and a major version.

A library reference MUST contain a stable library name and a major version.

A portable translation envelope MUST identify the profile name and major version that produced it.

An in-process translation result is not required to carry a profile reference inside its output message. The caller selected the profile explicitly under section 9.1, so the association is established by the translator instance. A profile MAY include a profile reference in its output type, and MUST do so if its output can be detached from the translator that produced it.

A profile major version defines:

- accepted checked-expression forms;
- supported CEL types and overloads;
- output protobuf type;
- parameter and value rules;
- null and absence rules;
- regular-expression rules;
- comprehension rules;
- error behavior;
- capability metadata.

A conforming implementation MUST reject an unsupported profile major version.

A published profile major version MUST NOT change incompatibly.

An incompatible behavior or output-type change requires a new profile major version.

Compatible additions MAY be published without changing the major version only when protobuf compatibility and observable translation behavior are preserved.

The profile owner is responsible for publishing and maintaining each profile version.

A translation-library major version defines its operation identities, CEL semantics, operand constraints, dependency requirements, and target translation behavior.

A conforming implementation MUST reject incompatible selected library versions.

A published translation-library major version MUST NOT change incompatibly.

## 21. Conformance

The specification MUST publish conformance protobuf messages and textproto test cases.

A conforming implementation MUST run the applicable textproto cases without changing their checked expressions, expected outcomes, or expected error codes.

The conformance artifacts MUST be independent of an implementation language and test framework.

### 21.1 Conformance levels

The conformance suite has two levels:

1. core translation conformance;
2. dialect profile conformance.

Core translation conformance tests requirements that every implementation satisfies. A core case MAY use the required baseline profile to verify the complete output of a core translation requirement.

Profile conformance tests one or more concrete profile major versions and their declared translatable fragments.

The core conformance suite MUST NOT define or require a test-only query dialect, canonical predicate language, or synthetic rendering syntax. Output-level testing uses a real profile, and the baseline profile in section 9.6 guarantees that one exists.

A conforming implementation MUST pass the core conformance suite.

A conforming implementation MUST pass the baseline profile conformance suite, because section 9.6 requires every implementation to provide that profile.

A dialect profile MUST pass the profile conformance suite for each profile major version that it claims.

An extending profile MUST pass its own profile conformance suite. Passing the base profile suite does not satisfy that requirement, because the extending profile emits different output.

Before it executes a profile expectation, the runner MUST construct a translator for that expectation's profile. A core expectation MAY omit a concrete profile reference when the behavior under test is profile-independent. The runner MUST construct a translator for an available supported profile for that expectation. The expectation MUST NOT depend on that profile's translatable fragment or predicate representation.

A core expectation MAY select the baseline profile when exact predicate output is necessary to verify a core requirement. Such an expectation MUST use the baseline profile's declared output type and emitted output. A core expectation MUST NOT assert the output of another profile.

A core expectation that omits a profile reference MAY use the case requirements to declare the capabilities a selected profile must have. The runner MUST run the expectation only against a profile that declares every listed capability. WHEN no available profile declares them, the runner MUST report the expectation as not applicable. The runner MUST NOT report a not-applicable expectation as passed.

The baseline profile in section 9.6 always exists, so a core case whose requirements the baseline satisfies always runs.

A core expectation that expects predicate success MUST declare the capabilities that make that success required. No profile is obliged to accept a particular expression form, so an undeclared expectation of predicate success is not profile-independent.

`CELQL-CONF-CASE-001`: A conformance case MUST contain one input and one or more
profile expectations.

`CELQL-CONF-CASE-002`: Each profile expectation MUST independently identify the
selected profile, selected translation libraries, profile configuration,
limits, and expected success or error.

`CELQL-CONF-CASE-003`: A conformance case MAY contain profile expectations with
different outcomes for different profiles.

`CELQL-CONF-CASE-004`: WHEN two profiles apply to the same CEL source, the
conformance corpus MUST store that source once and MUST attach both profile
expectations to that case.

`CELQL-CONF-CASE-005`: WHEN a conformance case expects a predicate, the case
MUST state its input as CEL source text.

`CELQL-CONF-CASE-006`: WHEN a profile expectation lists a translation library,
the runner MUST construct the translator with that library.

`CELQL-CONF-CASE-007`: WHEN a runner does not provide a translation library
listed by a profile expectation, the runner MUST report that expectation as
unavailable and MUST NOT report it as passed or as a translation rejection.

The absence of an expectation for a profile makes no assertion about that
profile. It does not mean that the profile accepts or rejects the case.

#### 21.1.1 Runner obligations

Some requirements are properties of every applicable case rather than the subject of one case. A conforming runner MUST enforce all of the following across the suite that it executes.

**Determinism.** The runner MUST execute each case at least twice in the same process and MUST assert that both executions produce an equivalent outcome or an equivalent error code. This operationalizes the determinism requirement in section 7.2.

**Isolation.** The runner MUST assert that case order does not change any result. Running the suite in reverse order MUST produce the same per-case results. This operationalizes the state-independence requirement in section 7.2.

**Diagnostic redaction.** For every case that expects an error and whose checked expression contains a string, bytes, or regular-expression constant, the runner MUST assert that neither the error message nor any entry of the error `details` map contains that constant value. This operationalizes section 17.

**Output-type validation.** For every case that produces a predicate, the runner MUST assert that the output message's full name equals the selected profile's declared `output_type_name`. This operationalizes section 11.1.

**Atomicity.** For every case that expects an error, the runner MUST assert that no predicate output is returned with the error. This operationalizes section 7.2.

**Profile version rejection.** For each available profile, the runner MUST attempt to construct a translator for a major version that the profile does not support and MUST assert the `unsupported profile version` error code. A published case cannot express this for an implementation-specific profile name.

**Capability agreement.** For each available profile, the runner MUST assert that the profile's published capability profile declares no overload identifier that uses the reserved prefix in section 21.2.2.

**Library agreement.** For each available translation library, the runner MUST assert that the effective capability contains the library reference and every operation capability that the library declares.

For a core case that expects exact baseline predicate output, the runner MUST compare the complete output message. For any other core case that expects predicate success, the runner MUST verify the output type and MUST NOT compare target-specific predicate contents.

### 21.2 Core conformance cases

A core conformance case tests behavior that every conforming implementation must provide. It MAY use the required baseline profile as the concrete representation for output-level verification.

A core case MAY test translation or preflight validation.

For validation, the expected success is `valid`.

For translation, the expected success is `match_all`, `match_none`, predicate success, or an exact baseline predicate. Predicate success means only that translation returned one complete predicate of the selected profile's declared output type.

A core case that does not select the baseline profile MUST NOT assert:

- query text;
- placeholder syntax;
- field-path encoding;
- pattern-language syntax;
- regular-expression rendering;
- comprehension rendering;
- another target-specific representation detail.

A core case that selects the baseline profile MAY assert these details only as the exact `AnsiSqlPredicate` output required by that profile.

Exact human-readable error messages MUST NOT be part of core conformance.

#### 21.2.1 Source-form input

The normative input to the celql translation operation is a cel.expr.CheckedExpr.

A conformance case MUST provide exactly one fixture input: CEL source text or an encoded checked expression.

A conformance case MAY use CEL source text for readable fixture authoring.

When a conformance case provides CEL source text, the runner MUST parse and check that source with a conforming CEL implementation before it invokes the translator.

The runner MUST invoke the translator with the resulting cel.expr.CheckedExpr.

Parsing and checking performed by the conformance runner are test-fixture preparation. They are not part of the celql translation operation.

A case whose input is a malformed or near-miss structure MUST use an encoded checked expression, because no conforming parser produces that structure.

An encoded checked expression MUST NOT have a successful predicate expectation.

#### 21.2.2 Reserved rejection identifiers

Some core behavior requires an expression part that every profile rejects. Atomic failure and unsupported-overload reporting are examples. A core case cannot name a real unsupported overload, because the runner selects the profile.

This specification reserves the overload identifier prefix `celql.reserved.unsupported.` for that purpose.

A profile MUST NOT declare an overload identifier that uses this prefix.

A translator MUST reject a resolved overload that uses this prefix with the `unsupported overload` error code.

A core case MAY use an overload identifier with this prefix to make a rejection occur under any selected profile.

This specification also reserves the profile name `celql.reserved.unregistered`.

An implementation MUST NOT register a profile under that name.

A core case MAY use that name to test profile resolution without depending on which profiles an implementation registers.

These reserved identifiers are conformance instruments. They are not a query dialect and they define no target representation.

### 21.3 Profile conformance cases

A profile conformance case MUST identify:

- a unique case name;
- the operation under test;
- one CEL source input, except for a malformed or near-miss rejection case;
- one or more profile expectations;
- the profile name and major version for each expectation;
- optional limits and profile configuration;
- zero or more selected translation-library references;
- one expected successful outcome or one expected error code for each profile;
- optional expected node identification;
- profile-specific expected predicate output when the expected outcome is a predicate.

For a case whose operation is validation, the only legal expected success is `valid`. For a case whose operation is translation, the only legal expected successes are `match_all`, `match_none`, and a predicate.

Expected predicate output MUST use the exact protobuf output type declared by the selected profile. A generic conformance or transport envelope MAY carry that message in `google.protobuf.Any`. The embedded message type MUST equal the profile's declared output type.

A profile MUST NOT use a synthetic core predicate language as a substitute for its actual output type.

A profile case MAY compare:

- the exact output protobuf;
- a profile-defined canonical form of that protobuf;
- semantic execution results;
- or more than one of these.

The profile MUST document which comparison method its cases use.

Exact human-readable error messages MUST NOT be part of profile conformance.

A profile conformance case MAY attach expectations for the same profile with different selected translation libraries.

### 21.4 Required core cases

The core conformance suite MUST include cases for:

- `match_all` from a Boolean `true` root;
- `match_none` from a Boolean `false` root;
- rejection of non-Boolean roots, including `dyn` and an optional Boolean;
- malformed checked expressions;
- missing required type entries;
- missing required reference entries;
- duplicate reachable node identifiers;
- a reachable node with no expression kind;
- expression-depth limits;
- reachable-node-count limits;
- per-constant and aggregate constant-size limits;
- comprehension-nesting limits;
- explicit profile selection;
- rejection without profile fallback;
- rejection of a resolved overload that uses the reserved prefix in section 21.2.2;
- atomic failure when one part of a larger expression is untranslatable;
- predicate success for a record-dependent expression, under declared capability requirements.

Determinism, isolation, diagnostic redaction, output-type validation, atomic absence of partial output, profile version rejection, and capability agreement are runner obligations under section 21.1.1.

Two core error codes are not reachable through a standard `cel.expr.CheckedExpr`:

- `unresolved error value`;
- `unresolved unknown value`.

`cel.expr.CheckedExpr` has no representation for a CEL error or unknown value. An implementation whose input representation exposes those values MUST add applicable cases. The published core suite MUST NOT fabricate an unreachable representation.

Two further codes describe implementation defects rather than normal input rejection:

- `invalid profile output`;
- `internal error`.

The published core suite does not require an input case that intentionally causes either defect.

### 21.5 Required profile cases

A profile conformance suite MUST cover every capability and rejection boundary that the profile declares.

A translation-library conformance suite MUST cover every capability and rejection boundary that the library declares for each compatible profile.

It MUST include accepted and rejected cases for each supported overload and operand-shape combination.

When applicable, it MUST test:

- query field paths and field-path encoding;
- identifiers that are unsafe, ambiguous, reserved, or otherwise rejected by the profile;
- string and bytes values that contain query-language injection characters;
- parameter value types, ordering, composition, and count limits;
- collection-parameter behavior;
- null and absence behavior;
- numeric boundaries and signed or unsigned range restrictions;
- floating-point edge cases that the profile supports;
- timestamp and duration boundaries;
- target pattern metacharacters and literal-value escaping;
- RE2 compatibility and regular-expression limits;
- malformed and near-matching lowered macro or comprehension structures;
- comprehension scope, shadowing, nesting, and profile-specific output;
- output-growth limits;
- operation-specific limits;
- valid and invalid profile configuration;
- custom overloads declared by the profile;
- observable `match_all` and `match_none` reductions beyond Boolean literal roots;
- rewrite boundaries that affect acceptance or observable output.

A profile suite MUST use the profile's real declared output type for predicate cases.

For each library operation, the conformance corpus MUST include one expectation that selects the library and one expectation for the same profile that omits it. The selected expectation MUST verify the declared success or profile-specific rejection. The omitted expectation MUST require `unsupported overload`.

For each expression form that a base profile accepts, the conformance corpus MUST attach an expectation for the extending profile to the same source-form case. The extending profile expectation verifies the record-selection agreement required by section 9.7 without duplicating the CEL input.

### 21.6 Differential conformance

`CELQL-CONF-DIFF-001`: WHEN the target query system is available for automated
tests, profile conformance MUST include differential execution tests against
that target query system.

A differential test SHOULD:

1. evaluate the checked CEL expression against test records with a conforming CEL evaluator;
2. translate the expression;
3. execute the generated predicate against equivalent stored records;
4. compare the selected records.

The selected records MUST be equal for all records in the tested supported domain.

`CELQL-CONF-DIFF-002`: WHEN a source-form profile expectation successfully
produces a predicate for an executable database target, the implementation MUST
execute that expectation against the target database during differential
conformance.

`CELQL-CONF-DIFF-003`: A differential runner MUST manage the target database
lifecycle and MUST release the database resources after success or failure.

`CELQL-CONF-DIFF-004`: A profile that extends another profile MUST attach its
expectation to the same source-form case whenever both profiles support that
source form. A profile-local case is reserved for a target-specific capability,
output distinction, or rejection boundary. The shared fixture is the durable
matrix of dialect output for one CEL expression.

### 21.7 Robustness testing

Implementation readiness SHOULD include fuzz or property-based tests for:

- malformed checked expressions;
- deep and wide expression trees;
- resource-limit boundaries;
- parameter ordering and composition;
- identifier and path encoding;
- pattern escaping;
- Boolean rewrites;
- comprehension scope and aliasing;
- unsupported overloads.

This specification does not prescribe a fuzzing or property-testing framework.

## 22. Non-Goals

`celql` does not build complete queries.

`celql` does not add selection lists, joins, grouping, ordering, pagination, mutation, or transaction behavior.

`celql` does not define application field mappings.

`celql` does not define how a caller obtains a checked expression.

`celql` does not define how a caller executes a translated predicate.

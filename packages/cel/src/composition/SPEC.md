# CEL Environment and Checked-Expression Composition Specification

**Status:** Draft
**Version:** 0.4.0

## 1. Purpose

This specification defines behavior for:

1. Composing multiple CEL environments into one environment.
2. Determining equality and assignability between CEL environments.
3. Determining whether a checked CEL expression can be evaluated by an environment.
4. Composing checked Boolean CEL expressions using conjunction, disjunction, and negation.

The resulting environment and expressions MUST use the implementation’s standard CEL types.

An implementation MUST NOT modify, extend, or wrap the standard checked-AST representation to implement this specification.

---

## 2. Scope

This specification applies to environments created by the same CEL implementation.

All environments supplied to one composition operation MUST:

* Be created by the same CEL implementation.
* Use compatible versions of that implementation.
* Use the same definitions for standard CEL behavior.
* Use library names that uniquely identify library semantics within that implementation.

This specification does not define portable composition between environments created by unrelated CEL implementations.

### 2.1 Implementation boundary

The composition implementation MUST have access to the effective environment state required for composition.

That access MAY be internal to the CEL implementation. It MUST NOT require exposing environment-construction state through the public API.

An environment is described by what it can compile and evaluate, not by the option values that produced it. Composition therefore reads materialized state, and MUST NOT require an environment to retain the construction inputs which produced that state.

---

## 3. Design principles

A conforming implementation MUST follow these principles:

1. Environment composition uses the implementation’s native environment-extension behavior.
2. Environment composition MUST NOT use environment configuration serialization.
3. Existing declaration, overload, type, and registry conflict handling remains authoritative.
4. Library identity is determined by unique library name.
5. Composition combines materialized environment state. It does not replay the construction inputs which produced that state.
6. Environment composition occurs before checked-expression composition.
7. Checked expressions are not rechecked during composition.
8. Checked expressions do not carry environment metadata.
9. Expression composition produces ordinary checked CEL ASTs.
10. Expression composition performs only conservative Boolean simplification.
11. Operand order is preserved.

---

## 4. Terminology

### 4.1 Environment

A CEL environment containing the state needed to parse, check, validate, plan, and evaluate CEL expressions.

Environment state may include:

* Variables.
* Types.
* Functions and overloads.
* Runtime function bindings.
* Macros.
* Validators.
* Context types.
* Type registries.
* Type providers.
* Type adapters.
* Parser and checker options.
* Program options.
* Standard-library configuration.
* Applied library identities.
* Cost-related options.
* Semantic feature flags.

### 4.2 Checked expression

A standard checked CEL AST containing:

* An expression tree.
* Checked type metadata.
* Reference and overload metadata.
* Source metadata, when available.

### 4.3 Additive state

Environment state that can be combined by adding entries and applying the implementation’s normal duplicate and conflict rules.

Examples include:

* Variable declarations.
* Function overloads.
* Type registrations.
* Standard declarations.
* Distinct macros.
* Distinct validators.
* Distinct libraries.
* Parser and checker settings.

### 4.4 Non-additive state

Environment state for which one environment normally has one effective value or behavior.

Examples may include:

* Container.
* Context type.
* Type adapter.
* Certain semantic features.
* Certain scalar program options.

### 4.5 Library

A uniquely named CEL extension that may contribute:

* Compile-time environment options.
* Program options.
* Functions.
* Runtime bindings.
* Macros.
* Validators.
* Types.
* Semantic features.

A library name MUST uniquely identify one semantic library definition within the CEL implementation.

### 4.6 Environment assignability

An environment `Source` is assignable to an environment `Target` when checked expressions produced by `Source` can be planned and evaluated by `Target` without rechecking.

### 4.7 Structural duplicate

Two checked expressions are structural duplicates when they are semantically identical according to the structural-equality rules of Part VI, excluding expression IDs and source positions.

---

# Part I: Conceptual Operations

## 5. Required operations

A conforming implementation MUST provide behavior equivalent to these conceptual operations:

```text
ComposeEnvironments(E₁, E₂, …, Eₙ) → Environment

EqualEnvironments(A, B) → Boolean

AssignableEnvironment(Source, Target) → Boolean

CanEvaluate(Target, CheckedExpression) → Boolean

CreateComposition(Target) → Composition

Composition.And(X₁, X₂, …, Xₙ) → CheckedExpression

Composition.Or(X₁, X₂, …, Xₙ) → CheckedExpression

Composition.Not(X) → CheckedExpression
```

Language bindings MAY use different naming and calling conventions.

---

# Part II: Environment Composition

## 6. `ComposeEnvironments`

### 6.1 Input count

`ComposeEnvironments` MUST require at least one environment.

Calling it with no environments MUST fail.

When exactly one environment is supplied, the operation MAY return:

* The original environment; or
* A semantically equivalent independent environment.

### 6.2 Immutability

The operation MUST NOT mutate any input environment.

The resulting environment MUST be safe to use independently of the input environments.

### 6.3 Native extension mechanism

Composition MUST use the implementation’s normal environment-extension mechanism.

Conceptually:

```text
result := E₁

for each Eᵢ after E₁:
    result := ExtendEnvironment(result, Eᵢ)

return result
```

`ExtendEnvironment` is an implementation operation that extends one environment using the effective state of another environment.

It MAY be implemented as:

* An environment overload of the normal extension operation.
* A package-private environment option.
* A package-private environment-state transfer operation.
* Another mechanism that ultimately uses the normal environment extension and construction path.

It MUST NOT require conversion through a serialized environment configuration.

### 6.4 Existing behavior is authoritative

The environment implementation’s existing rules for merging declarations, overloads, types, and registries MUST remain authoritative.

`ComposeEnvironments` MUST NOT implement a separate incompatible version of CEL declaration or overload resolution.

For example:

* Compatible duplicate variables MUST be accepted if normal environment extension accepts them.
* Conflicting variable declarations MUST fail if normal environment extension rejects them.
* Compatible function overloads MUST merge if normal environment extension merges them.
* Conflicting overloads MUST fail if normal environment extension rejects them.

### 6.5 Immediate validation

Composition MUST surface declaration and environment conflicts before returning.

If the implementation normally validates some declaration conflicts lazily, composition MUST trigger the validation needed to establish that the result is usable.

A successful call MUST NOT defer a known variable, overload, type, or registry conflict until the first subsequent expression check.

---

## 7. General merge rule

For every environment component:

1. State present in only one environment MUST be retained.
2. Compatible overlapping state MUST be merged or deduplicated.
3. Conflicting state MUST cause composition to fail.
4. State that cannot be safely merged MUST be equal.
5. The operation MUST NOT silently choose one conflicting semantic definition over another.

---

## 8. Variable and function declarations

### 8.1 Variables

Variable declarations MUST be combined using the implementation’s existing variable-declaration rules.

Equivalent declarations MAY be deduplicated.

A conflicting declaration MUST fail.

Example:

```text
principal: Principal
principal: Principal
→ one compatible declaration
```

```text
principal: Principal
principal: string
→ composition failure
```

### 8.2 Functions

Function declarations MUST be combined using the implementation’s existing function-declaration and overload-merging behavior.

Functions with different names MAY coexist.

Functions with the same name MAY contribute different compatible overloads.

A repeated compatible overload MAY be deduplicated.

A repeated incompatible overload MUST fail.

The implementation MUST preserve runtime bindings associated with retained overloads.

---

## 9. Libraries

### 9.1 Unique name identity

A library name MUST uniquely identify the complete semantics of that library within the implementation.

This includes:

* Compile-time behavior.
* Runtime behavior.
* Version.
* Configuration.
* Functions and overloads.
* Program options.
* Validators.
* Features.

Two semantically different library variants MUST NOT use the same name.

### 9.2 Presence checking

Library composition MUST use library names as the library identity.

Composition MUST NOT compare library objects, callbacks, runtime binding objects, or implementation fingerprints.

Composition MUST NOT require an environment to retain concrete library values in order to be composed later.

### 9.3 Materialized library state

By the time an environment is composed, a library’s compile-time effects may already be materialized as:

* Variables.
* Types.
* Functions.
* Macros.
* Validators.
* Parser or checker options.
* Feature settings.

Those materialized effects MUST be merged through the normal environment-extension behavior.

### 9.4 Required result

The composed environment MUST contain:

* The union of the applied library names of every input environment.
* The materialized compile-time state of every input environment (Section 9.3).
* The resolved program options every retained library contributed.

WHEN one library name is applied in more than one input environment, the composed environment MUST apply that library’s program options once.

Composition MUST NOT reapply a library to produce this result. An implementation MAY carry each library’s resolved program options with the environment, keyed by library identity, so that the union is taken by identity rather than by replaying compile options.

Program options are subject to Section 12.9.

### 9.5 Direct custom behavior

Custom semantic behavior that cannot be safely merged as ordinary environment state SHOULD be installed through a uniquely named library.

This includes custom behavior such as:

* Opaque runtime program options.
* Custom parser behavior.
* Custom checker behavior.
* Validator groups.
* Function binding groups.

---

## 10. Type registry and descriptors

### 10.1 Registry composition

The effective type registries of the input environments MUST be combined, however each registry was populated.

The implementation MUST provide a registry composition operation:

```text
ExtendRegistry(Base, Incoming) → Registry
```

`ExtendRegistry` MUST:

1. Start from an independent copy of `Base`.
2. Add the types, descriptors, and native registrations of `Incoming`.
3. Apply the implementation’s existing registration and conflict validation.
4. Accept compatible duplicate registrations.
5. Reject incompatible registrations of one identity.

`ExtendRegistry` MUST NOT modify `Base` or `Incoming`.

An implementation MUST NOT define a separate descriptor-compatibility rule where its existing registration methods already establish compatibility.

WHERE an existing registration method rejects every duplicate registration, including a compatible one, `ExtendRegistry` MUST accept the compatible duplicate. An implementation MUST document the comparison it uses to establish that compatibility.

### 10.2 Distinct types

Types with different fully qualified names MAY coexist.

### 10.3 Duplicate types

Duplicate registrations of compatible types MUST be accepted or deduplicated.

Types with the same fully qualified name but incompatible definitions MUST cause composition to fail.

Compatibility MUST include details that affect CEL behavior, including:

* Message identity.
* Field names.
* Field numbers.
* Field types.
* Repeated and map structure.
* Presence.
* Oneof membership.
* Enum values.

The existing registration rules of the registry establish this compatibility. WHERE those rules identify a registration by a coarser key than the details above, such as a descriptor file name, an implementation MUST document that two different definitions sharing that key are combined as the first of the two rather than rejected.

### 10.4 Registry independence

The composed registry MUST be independent of the mutable state of the input environments.

Modifying a registry after composition, where such modification is allowed, MUST NOT silently alter another input environment.

---

## 11. Context types

If no input environment has a context type, the composed environment has no context type.

If one effective context type exists, it MUST be retained.

Repeated compatible declarations of the same context type MUST be deduplicated.

Different context types MUST conflict unless the implementation explicitly supports multiple simultaneous context declarations.

```text
Book + Book
→ Book
```

```text
Book + Publisher
→ composition failure
```

---

## 12. Non-additive state

### 12.1 Default rule

Non-additive state MUST be equal unless this specification or the implementation defines a safe composition rule.

An implementation MUST classify each setting individually. It MUST NOT compare a multi-field configuration object, such as a parser, checker, or program option object, for equality as a whole, because the fields of one object have different composition rules.

Each setting is classified by one question: does it change the evaluation of an already-checked expression, or does it only change which future source text checks successfully?

* A setting that only changes source admission MUST NOT gate composition. Composition combines or ignores it.
* A setting that changes the planning or evaluation of an already-checked expression MUST be compatible across the inputs.

A setting is not evaluation-semantic merely because it is Boolean, and not source-admission-only merely because it is also present in a parser or checker option object.

### 12.2 Container

Different non-empty containers SHOULD be treated as conflicting.

An implementation MAY define a more permissive rule only if name resolution remains unambiguous and assignability is preserved.

### 12.3 Type adapters

Type adapters MUST be identical or explicitly composable.

If adapter compatibility cannot be established, composition MUST fail.

### 12.4 Type providers

Type providers MAY be merged when the implementation defines provider composition.

Otherwise, providers MUST be identical or share the composed registry in a way that preserves all required types.

WHERE the type provider and the type adapter are the type registry, Section 10.1 defines their composition.

### 12.5 Standard-library configuration

Standard declarations are additive. Adding a standard declaration back cannot invalidate an expression an environment already checked without it.

The composed environment MUST contain the standard declarations of every input environment, including the declarations an input excluded through a standard-library subset or by disabling the standard library.

Composition MUST NOT fail because the inputs installed different standard-library subsets, or because one input disabled the standard library.

WHEN the composed environment merges two standard-library subsets, it MUST express the result as the merged declarations rather than as a subset filter, since no single filter selects the union.

### 12.6 Parser and checker behavior

Parser and checker settings govern source admission. Composition MUST NOT fail because two inputs disagree about one of them.

The composed environment SHOULD admit at least the source text every input admitted: a syntax feature either input enabled stays enabled, and a limit widens to the more permissive of the two.

A checker setting that changes which overloads the checker selects, such as one widening implicit numeric comparisons, is source admission: it does not change the runtime binding of an overload that is already selected in a checked expression.

A setting that changes runtime behavior directly, such as one governing how already-resolved field access is evaluated, is not a parser or checker setting for this section. It is classified under Section 12.7.

### 12.7 Semantic features

A semantic feature that changes evaluation behavior MUST be equal or explicitly composable.

### 12.8 Limits

Checking-only limits MUST NOT gate composition.

A limit that affects program planning or evaluation MUST preserve program assignability from each input environment. The composed environment MUST NOT enforce a limit tighter than an input enforced, since the composed environment would then reject an expression that input could evaluate.

### 12.9 Program options

Program options are classified individually, like every other setting.

* An additive program option, such as a list of planner hooks or a map of per-overload runtime rules, MUST be merged.
* An identical scalar program option MUST be deduplicated.
* A scalar program option which changes what an already-checked expression evaluates to MUST be equal across the inputs, counting an unset option as its default value. Otherwise composition MUST fail.
* A scalar program option which changes how a program is planned or observed, but not what it evaluates to, MUST NOT be set to two different values by the inputs. Otherwise composition MUST fail. An input which leaves it unset does not conflict with an input which sets it.

WHERE the implementation merges program options elsewhere by letting the last value win, composition MUST NOT inherit that precedence for a scalar option covered by this section. Silent precedence would change the semantics of a program the other input already checked.

Source-only and check-only settings MUST NOT gate program assignability.

---

## 13. Validators and macros

Distinct validators and macros MAY be combined.

A validator or macro contributed by a uniquely named library MUST be deduplicated with that library.

A macro signature and a validator name each identify one semantic definition within the implementation, in the same way a library name does (Section 9.1).

For directly registered validators or macros:

* Two registrations of one identity MUST be combined into one.
* Composition MUST retain the registration of the earlier environment.
* Composition MUST NOT compare macro expanders or validator callbacks to establish that two registrations of one identity are compatible.

Validators control admission of source expressions. They do not invalidate already checked expressions solely because the composed environment contains additional validators.

---

## 14. Successful composition guarantee

For:

```text
Combined := ComposeEnvironments(E₁, E₂, …, Eₙ)
```

the following MUST be true for every input environment:

```text
AssignableEnvironment(Eᵢ, Combined) = true
```

This means a checked expression from any input environment can be planned and evaluated in the composed environment without rechecking, provided the expression itself is a valid checked artifact.

---

# Part III: Environment Comparison

## 15. `EqualEnvironments`

`EqualEnvironments(A, B)` determines whether the two environments have equivalent effective CEL behavior.

Equality MUST consider all state that affects:

* Checked-expression compatibility.
* Program construction.
* Function dispatch.
* Runtime evaluation.
* Type adaptation.
* Type lookup.
* Semantic feature behavior.

`EqualEnvironments` compares effective checked-program and runtime behavior. It MUST NOT be defined as equality of a serialized environment configuration.

The implementation MAY use:

* Native object identity.
* Canonical internal representations.
* Bidirectional assignability.
* Library-name sets.
* Registry equality.
* Existing declaration-equality operations.

The implementation MUST NOT introduce configuration hashing or an environment fingerprint solely to implement this operation.

A sufficient conceptual relationship is:

```text
EqualEnvironments(A, B) :=
    AssignableEnvironment(A, B)
    AND AssignableEnvironment(B, A)
    AND EqualNonAssignableState(A, B)
```

Environment equality is useful for:

* Tests.
* Cache reuse.
* Detecting redundant composition.
* Validating generated environments.

---

## 16. `AssignableEnvironment`

`AssignableEnvironment(Source, Target)` is directional.

It MUST return true only when every valid checked expression produced by `Source` can be planned and evaluated by `Target` without rechecking.

IF assignability cannot be proven, THEN the operation MUST return false.

A true result MUST NOT mean only that the required declarations are present while a required runtime capability may be absent.

The operation MUST consider at least:

* Variables.
* Types.
* Fields.
* Functions.
* Selected overloads.
* Runtime bindings, including whether a declared overload dispatches to an implementation.
* Required libraries.
* Program options which change planning or evaluation (Section 12.9).
* Type providers.
* Type adapters.
* Evaluation-semantic features.
* Limits which affect planning or evaluation (Section 12.8).

`Target` MUST NOT be required to accept the same source text as `Source`.

The following do not make an environment non-assignable:

* The container, which resolves names while checking source text that a checked expression has already resolved.
* Source validators.
* Parser and checker settings, including parsing limits.
* Cost-estimation settings.

Checking a type for this operation MAY be limited to confirming that `Target` has a compatible type registered under the same fully qualified name, without reproducing the field-level compatibility check of Section 10.3. The registry establishes that compatibility when the type is registered.

---

## 17. `CanEvaluate`

`CanEvaluate(Target, Expression)` determines whether one particular checked expression can be planned and evaluated by the target environment.

This operation is narrower than environment assignability.

It MUST return true only when `Target` has everything required to plan and evaluate that expression.

IF evaluability cannot be established, THEN the operation MUST return false.

A true result MUST NOT mean only that the referenced declarations are present while a required runtime binding may be absent.

It SHOULD inspect only the capabilities used by the expression, including:

* Referenced variables.
* Referenced types.
* Selected fields.
* Selected overload IDs.
* Runtime bindings, including whether a referenced overload dispatches to an implementation.
* Required semantic features.

It MUST NOT reparse or recheck the expression.

It MUST NOT:

* Resolve names again.
* Select overloads again.
* Infer types again.
* Run source validators.
* Rewrite the expression from source syntax.

`CanEvaluate` is for a checked expression whose originating environment is unknown.

WHEN the originating environment is already known to be assignable to `Target`, `CanEvaluate` does not need to be called for each request.

---

# Part IV: Checked-Expression Composition

## 18. Composition object

`CreateComposition(Target)` creates a composition object bound to one target environment.

The composition object MUST be safe for reuse.

It SHOULD be created and cached during initialization.

It MUST NOT infer or construct another environment from its operands.

---

## 19. Operand requirements

Every operand supplied to conjunction, disjunction, or negation MUST:

1. Be a checked CEL expression.
2. Have a Boolean root type.
3. Contain internally valid checked metadata.
4. Be evaluable by the target environment.

Requirement 3 MUST NOT be established by rechecking (Section 20). In practice it is established incidentally while establishing requirement 4: for example, a call node with no recorded overload id fails both the metadata check and the evaluability check. An implementation is not required to validate requirement 3 as a separate, independent step when doing so would add no coverage beyond requirement 4.

The implementation MAY establish requirement 4 by:

* Prior environment assignability.
* Calling `CanEvaluate`.
* Trusting an unforgeable in-process checked-expression representation.

A parsed-only AST MUST be rejected.

A checked non-Boolean expression MUST be rejected.

---

## 20. No rechecking

Expression composition MUST NOT recheck its operands.

It MUST NOT:

* Reparse source.
* Perform name resolution.
* Select overloads.
* Infer types.
* Run validators.
* Modify existing checked decisions.

Composition constructs new checked logical nodes around already checked operands.

---

## 21. Standard checked-AST output

Every expression-composition operation MUST return the implementation’s standard checked-AST type.

The result MUST be accepted by normal CEL operations such as:

* Program construction.
* Evaluation.
* Optimization.
* Serialization.
* Unparsing.
* Checked-expression translation.

The implementation MUST NOT attach:

* An environment.
* An environment fingerprint.
* Composition provenance.
* Library metadata.
* Application-specific metadata.

Any optional provenance MUST remain external to the checked AST.

---

# Part V: Logical Operations

## 22. Conjunction

### 22.1 Zero operands

Conjunction with no operands MUST return checked Boolean `true`.

```text
And() → true
```

### 22.2 One operand

Conjunction with one operand MUST return a semantically equivalent expression.

The implementation MAY return the original operand.

### 22.3 Multiple operands

Conjunction MUST preserve operand order.

```text
And(A, B, C) → A && B && C
```

### 22.4 Flattening

Nested standard CEL conjunctions MUST be flattened.

```text
And(A, And(B, C), D)
→ And(A, B, C, D)
```

Custom Boolean functions that resemble conjunction MUST NOT be flattened.

### 22.5 Identity

Checked constant `true` operands MUST be removed.

```text
And(true, A, true)
→ A
```

### 22.6 Absorbing constant

A checked constant `false` operand makes the result `false`.

```text
And(A, false, B)
→ false
```

### 22.7 Duplicate elimination

Structural duplicates MUST be removed.

The first occurrence MUST be retained.

```text
And(A, B, A, C, B)
→ And(A, B, C)
```

---

## 23. Disjunction

### 23.1 Zero operands

Disjunction with no operands MUST return checked Boolean `false`.

```text
Or() → false
```

### 23.2 One operand

Disjunction with one operand MUST return a semantically equivalent expression.

### 23.3 Multiple operands

Disjunction MUST preserve operand order.

```text
Or(A, B, C) → A || B || C
```

### 23.4 Flattening

Nested standard CEL disjunctions MUST be flattened.

### 23.5 Identity

Checked constant `false` operands MUST be removed.

### 23.6 Absorbing constant

A checked constant `true` operand makes the result `true`.

### 23.7 Duplicate elimination

Structural duplicates MUST be removed while retaining the first occurrence.

---

## 24. Negation

Negation MUST accept one checked Boolean operand.

```text
Not(true)  → false
Not(false) → true
```

Double negation SHOULD be simplified:

```text
Not(Not(A)) → A
```

Only the implementation’s standard CEL logical-negation operation may be recognized for double-negation simplification.

---

# Part VI: Structural Equality

## 25. Purpose

Structural equality is used for exact duplicate elimination.

It is not general logical equivalence.

### 25.1 Ignored metadata

Structural equality MUST ignore:

* Expression IDs.
* Source offsets.
* Line and column numbers.
* Source descriptions.
* Formatting metadata.

### 25.2 Required semantic content

Structural equality MUST include:

* Node kind.
* Constant type and value.
* Identifier and resolved reference.
* Checked type.
* Select operand.
* Selected field.
* Presence-test behavior.
* Function name.
* Member or global call form.
* Ordered arguments.
* Selected overload IDs.
* List ordering.
* Map entries.
* Struct or message type.
* Comprehension structure.
* Local-variable binding structure.

### 25.3 Overloads

Expressions selecting different overload IDs MUST NOT be treated as duplicates.

This remains true when the visible source syntax is otherwise identical.

### 25.4 Constants

Constants are equal only when their CEL type and value are equal.

```text
int(1) ≠ uint(1)
int(1) ≠ double(1.0)
```

### 25.5 Comprehensions

The required profile MAY treat bound comprehension variable names as significant.

Alpha-equivalent comprehension comparison is optional.

### 25.6 Conservative behavior

When equality cannot be proven, the expressions MUST be treated as distinct.

False negatives are allowed.

False positives are prohibited.

---

## 26. Fingerprinting

Implementations SHOULD use structural fingerprints to accelerate duplicate detection.

Section 39.2’s approximately-linear duplicate-elimination target assumes this section is implemented. Duplicate elimination that compares each retained operand structurally against every other retained operand (Section 22.7, Section 23.7), without a fingerprint or equivalent hash-based acceleration, is quadratic in the number of retained operands, not linear, and still conforms to this specification: fingerprinting is a SHOULD, not a MUST. An implementation that skips it is not required to meet Section 39.2’s performance target and SHOULD document that tradeoff, particularly if composition may see operand counts large enough for the difference to matter.

Fingerprints MUST exclude:

* Expression IDs.
* Source positions.
* Formatting.

A matching fingerprint MUST NOT be treated as proof of equality.

Structural equality MUST be checked after a fingerprint match.

---

# Part VII: Checked Metadata Construction

## 27. Expression IDs

All expression IDs in a composed result MUST be unique.

When operands contain overlapping IDs, the implementation MUST remap them.

Remapping MUST update every ID-indexed structure, including:

* Expression nodes.
* Type maps.
* Reference maps.
* Source-position maps.
* Macro-call maps.

### 27.1 Determinism

Implementations SHOULD assign IDs using deterministic traversal order.

---

## 28. Type and reference metadata

Checked metadata for retained nodes MUST be preserved.

New Boolean constants MUST have Boolean checked types.

New logical call nodes MUST:

* Have Boolean result types.
* Reference the implementation’s standard logical overloads.

---

## 29. Source metadata

Source metadata for retained operand nodes SHOULD be preserved when practical.

An implementation MAY omit source locations from composed results.

Program construction and evaluation MUST NOT require source metadata.

WHEN source metadata is retained, the implementation MUST remap source offsets and macro-call metadata through the same id translation used for the expression tree (Section 27), rather than copying the operand’s original source metadata unchanged.

WHEN source metadata is omitted, the implementation MUST document that composed results carry no source location. Section 42 lists provenance sidecars as a future compatible extension covering the same need.

New synthetic nodes MAY have:

* No source location.
* A synthetic location.
* An external provenance entry.

A synthetic node MUST NOT falsely claim to originate from one operand’s original source text.

---

# Part VIII: Simplification Boundary

## 30. Required simplifications

Composition performs:

* Same-operator flattening.
* Boolean identity elimination.
* Boolean absorbing constants.
* Exact structural duplicate elimination.
* Constant negation.
* Double-negation elimination when supported.

### 30.1 Excluded optimizations

Composition is not required to perform:

```text
x > 10 && x > 20
→ x > 20
```

```text
x && (x || y)
→ x
```

```text
x == "A" && x == "B"
→ false
```

```text
a && b
→ b && a
```

General logical optimization belongs to a separate optimizer.

---

# Part IX: Errors

The error categories in this part are a conceptual checklist of failure conditions this specification requires an implementation to distinguish in some form, not a mandate to define a parallel typed-error hierarchy. An implementation SHOULD report these failures using its host language’s existing error-reporting convention (for example, a single error type with a descriptive message, if that is how the rest of the implementation reports invalid input) rather than introducing a new categorized error type solely for this specification.

## 31. Environment-composition errors

Recommended error categories include:

```text
ENVIRONMENT_REQUIRED
IMPLEMENTATION_MISMATCH
CONTEXT_CONFLICT
CONTAINER_CONFLICT
VARIABLE_CONFLICT
OVERLOAD_CONFLICT
TYPE_CONFLICT
REGISTRY_CONFLICT
ADAPTER_CONFLICT
PROVIDER_CONFLICT
LIBRARY_CONFLICT
OPTION_CONFLICT
FEATURE_CONFLICT
UNSUPPORTED_ENVIRONMENT_STATE
```

Errors SHOULD identify:

* The conflicting component.
* The environments involved.
* The existing definition.
* The incoming definition.

---

## 32. Expression-composition errors

Recommended error categories include:

```text
TARGET_ENVIRONMENT_REQUIRED
AST_REQUIRED
AST_NOT_CHECKED
AST_RESULT_NOT_BOOLEAN
AST_NOT_EVALUABLE
AST_METADATA_INVALID
AST_ID_REMAP_FAILED
```

Errors SHOULD identify the operand and relevant expression node where possible.

---

# Part X: Conformance Requirements

## 33. Environment-composition tests

A conforming implementation MUST test:

1. One input environment.
2. Multiple disjoint environments.
3. Environments sharing a common base.
4. Input immutability.
5. Compatible duplicate variables.
6. Conflicting variables.
7. Compatible function overloads.
8. Conflicting overloads.
9. Distinct type registrations.
10. Registry union, including registries supplied directly to each input environment.
11. Registry independence from the input registries.
12. Compatible duplicate descriptors.
13. Conflicting descriptors.
14. Same context type.
15. Different context types.
16. Distinct uniquely named libraries.
17. Duplicate library names installed once.
18. Preservation of library program options contributed by one input.
19. Program options of one library name applied once.
20. Conflicting evaluation-semantic program options.
21. Conflicting planning program options.
22. Different compatible validators.
23. Conflicting non-additive state.
24. Merged standard-library configuration.
25. Immediate validation before return.
26. Assignability from every input to the result.

---

## 34. Environment-comparison tests

Tests MUST cover:

1. Environment equality with identical effective state.
2. Inequality caused by variables.
3. Inequality caused by overloads.
4. Inequality caused by types.
5. Inequality caused by libraries.
6. Directional assignability.
7. A strict target superset.
8. A target overload declared without a runtime binding.
9. Missing type.
10. Missing library program behavior.
11. Incompatible evaluation-semantic program options.
12. A target limit tighter than the source limit.

---

## 35. Expression-evaluability tests

Tests MUST cover:

1. Expression using only available variables.
2. Missing variable.
3. Available overload with a runtime binding.
4. Missing overload.
5. Overload declared without a runtime binding.
6. Available message type and field.
7. Missing message type.
8. Incompatible field descriptor.
9. Checked non-Boolean expression where Boolean is required.
10. No reparsing or rechecking.

---

## 36. Logical-composition tests

Tests MUST cover:

### Conjunction

1. Zero operands.
2. One operand.
3. Operand order.
4. Flattening.
5. Identity elimination.
6. Absorbing false.
7. Duplicate elimination.
8. Distinct overloads retained.
9. Input AST immutability.

### Disjunction

1. Zero operands.
2. One operand.
3. Operand order.
4. Flattening.
5. Identity elimination.
6. Absorbing true.
7. Duplicate elimination.
8. Input AST immutability.

### Negation

1. Negated true.
2. Negated false.
3. Checked non-Boolean rejection.
4. Double-negation behavior.
5. Custom functions not mistaken for standard negation.

---

## 37. Metadata tests

Tests MUST verify:

1. Unique result expression IDs.
2. Complete type metadata.
3. Complete reference metadata.
4. Standard logical overload references.
5. Preservation of operand metadata.
6. No mutation of input ASTs.

WHEN the implementation retains source metadata (Section 29), tests MUST also verify that source-position IDs and macro-call IDs are valid after expression-ID remapping.

WHEN the implementation omits source metadata, tests MUST verify that composed results carry no source location.

---

## 38. Evaluation-equivalence tests

Representative composed expressions MUST evaluate equivalently to expressions constructed and checked normally in the composed environment.

Tests MUST include:

* Normal Boolean values.
* Short-circuit behavior.
* CEL errors.
* CEL unknowns.
* Custom overloads.
* Message-field selection.
* Library-provided functions.

---

# Part XI: Performance

## 39. Initialization path

Environment composition SHOULD occur during initialization.

Applications SHOULD cache:

* Composed environments.
* Composition objects.
* Static checked expressions.

### 39.1 Request path

Expression composition MAY occur on a request path.

No environment construction or expression rechecking should be necessary on that path.

### 39.2 Complexity

Environment composition SHOULD be approximately linear in the combined environment state, excluding registry validation.

Expression composition SHOULD be approximately linear in the number of retained AST nodes under expected hash-map behavior. This target depends on Section 26: it assumes fingerprint-accelerated duplicate detection.

---

# Part XII: Security and Correctness

## 40. Untrusted checked expressions

A checked-AST data structure received from an untrusted source MUST NOT automatically be trusted as a valid checked artifact.

Untrusted callers SHOULD provide CEL source that is parsed and checked normally.

Serialized checked expressions SHOULD pass through the implementation’s checked-expression import validation before composition.

---

## 41. Failure behavior

Environment composition MUST fail closed.

It MUST NOT:

* Replace conflicting variables silently.
* Replace conflicting overloads silently.
* Select one incompatible descriptor arbitrarily.
* Install a semantically different library under an existing library name.
* Drop required program options.
* Ignore incompatible non-additive state.

---

# Part XIII: Non-goals

This specification does not define:

* Environment configuration serialization.
* Composition across unrelated CEL implementations.
* AIP filtering.
* Authorization policy behavior.
* SQL translation.
* Query planning.
* General Boolean theorem proving.
* Contradiction detection.
* Changes to checked-AST types.
* Environment fingerprints attached to expressions.
* Automatic discovery of an expression’s source environment.
* Rechecking during expression composition.

---

# Part XIV: Versioning

## 42. Specification compatibility

A breaking specification change includes:

* Weakening environment-conflict detection.
* Changing assignability semantics.
* Allowing structurally different expressions to deduplicate incorrectly.
* Changing required Boolean identities.
* Changing operand-order guarantees.
* Requiring changes to the standard checked-AST shape.

Future compatible extensions may include:

* Alpha-equivalent comprehension comparison.
* Additional safe simplifications.
* More precise provider composition.
* Portable environment-comparison reports.
* External expression-provenance sidecars.
* Optimizer integration.

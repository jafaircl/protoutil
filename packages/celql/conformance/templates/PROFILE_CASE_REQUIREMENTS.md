# Profile conformance case requirements

A profile conformance suite tests one dialect profile at one major version. Its cases assert the profile's real output message. There is no shared predicate language, so every expected output in a profile suite uses the type named by `DialectCapabilityProfile.output_type_name`.

A profile suite must cover every capability the profile declares and every rejection boundary next to it. Declaring a capability without an accepting case and a rejecting case leaves the boundary untested.

A profile that extends the baseline must additionally include a case for every expression form the baseline accepts. Extension promises that the extending profile selects the same records as the baseline for those expressions; only a case per form verifies that promise rather than assuming it.

## Required coverage

### Operations

- Every declared overload, accepted.
- Every declared overload at each declared operand-shape combination.
- Each operand-shape combination the profile does not declare, rejected. A constant-to-constant comparison is a common example.
- Every custom overload the profile declares.
- Each restriction listed in `OperationCapability.additional_restrictions`, exercised in both directions.
- Operands whose CEL types differ where the profile requires them to agree.

### Query field paths

- A single-component path.
- A multi-component path from a selection chain.
- A multi-component path from a qualified identifier name.
- Each character class the profile accepts in a path component.
- A component that exceeds the profile's length limit.
- A component that is empty after the profile splits a qualified name.
- A component that collides with a target reserved word, in each letter case the profile compares.
- A path containing target statement or comment syntax.
- A path the profile cannot encode without ambiguity.

### Values and parameters

- Each supported CEL scalar type, bound and read back without loss.
- Signed and unsigned integers at their minimum and maximum.
- An unsigned value above the target's representable range, if the target has one.
- Floating-point values the profile supports, including any special value it accepts or rejects.
- Timestamp and duration boundaries.
- String and bytes values containing target quoting, escaping, statement, and comment syntax.
- Bytes values containing non-printable bytes.
- Parameter ordering across a multi-clause expression.
- Repeated equal values, to fix whether the profile deduplicates.
- Parameter composition with a caller-supplied start position or name prefix, when declared.
- Invalid composition configuration, rejected.
- A collection constant, to fix whether it binds as one parameter or as one per element.
- The parameter-count limit at and above its boundary.

### Null and absence

- Equality and inequality against CEL `null`.
- The declared behavior for an absent field.
- Rejection of absence observation, when the profile declares `ABSENCE_SEMANTICS_REJECTED`.
- Any expression that would require distinguishing null from absence in a target that merges them.

### Patterns and regular expressions

- Each declared pattern operation.
- Data containing every target pattern metacharacter, escaped and still bound as a parameter.
- Data containing the target's own escape character.
- Each RE2 construct the profile accepts.
- Each non-RE2 construct the profile rejects, including backreferences and lookaround.
- The pattern-size limit at and above its boundary.
- A pattern that exceeds the size limit and also uses a rejected construct, to fix the reported code.

### Comprehensions

- Each declared comprehension form, translated to its real output.
- A near match for each declared form, rejected. Vary one structural element at a time.
- An iteration variable that shadows the accumulator.
- A nested comprehension whose iteration variable shadows an enclosing one.
- A reference from an inner scope to an enclosing scope.
- Nesting at and above the configured limit.

### Outcomes and limits

- `match_all` and `match_none` from Boolean literal roots.
- Every other expression form the profile reduces to `match_all` or `match_none`, as declared under specification section 10.1.
- A record-dependent expression that must produce a predicate.
- The output-growth limit at and above its boundary.
- Every operation-specific limit the profile declares.
- Each rewrite the profile depends on, and an input where the rewrite precondition fails.

### Configuration

- Valid profile configuration.
- Missing, wrong-typed, and out-of-range profile configuration.

## Comparison method

A profile suite states which comparison it uses for predicate cases:

- exact protobuf equality;
- a profile-defined canonical form of the output message;
- execution against the target system;
- more than one of these.

Exact protobuf equality is the default. A profile that permits more than one valid output for an input states the canonical form that its cases compare.

## Differential execution

A profile that targets a real query system should also run differential tests. For each record in the tested domain, evaluate the checked expression with a CEL evaluator, execute the translated predicate against the stored equivalent, and require the selected record sets to be equal. Differential tests catch semantic drift that fixed expected output cannot, because they compare against the target's real behavior rather than against a recorded string.

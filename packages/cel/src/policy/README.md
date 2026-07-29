# CEL Policy

The Common Expression Language (CEL) supports simple expressions: no variables,
functions, or modules. However, CEL expression graphs can be composed together,
allowing for reuse and development clarity which is not otherwise possible
within CEL.

To address this case, we're introducing the CEL Policy format which is fully
runtime compatible with CEL. All of the same performance and safety hardening
guarantees which apply to CEL also apply to CEL Policy. The net effect is
significantly improved authoring and testability. The YAML-based policy format
is easily extensible and inspired by [Kubernetes Admission
Policy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
with CEL.

## Policy Language

A policy is a named instance of a rule which consists of a set of conditional
outputs and conditional sub-rules. Matches within the rule and subrules are
combined and ordered according to the policy evaluation semantic. The default
semantic is `FIRST_MATCH`. The supported top-level fields in a policy include:
`name`, `description`, `imports`, and `rule.`

- `name (string)`: a system-specific identifier for the policy
- `description (string)`: a human-readable description of the policy
- `imports (list[string])`: a list of aliases. see description below
- `rule (object)`: the entry point for the policy. see description below

### Rule

The `rule` node in a policy is the primary entry point to CEL computations.
Fields above the `rule` are intended to simplify or support the CEL expressions
within the `rule` block. For example, the [`imports` list refers to a set of
type names](#Imports) who should be imported by their simple name within the CEL
expressions contained in the `rule`.

#### Variables

A `rule` has a single `variables` block. Variables are written as an ordered
list. Variables may refer to another variable; however, the variable must be
declared before use, i.e. be defined before it is referenced. A variable has a
`name` and an `expression`.

```
variables:
  -   name: first_item
    expression: "1"
  -   name: list_of_items
    expression: "[variables.first_item, 2, 3, 4]"
```

Variables in CEL Policy are lazily evaluated and memoized as CEL is side-effect
free. Only the variables which are accessed during a `match` `condition` or an
`output` are evaluated. The use of a variable is equivalent to using the
`cel.bind()` macro to introduce local computations within a CEL expression.

#### Match

A `rule` has a single `match` block. The match block should have at least one
`output` value, though `output` expressions may be `condition`al. The default
evaluation order for the sequence of matches is top-down, first-match.

```
rule:
  match:
    -   condition: "request.user.name.startsWith('j')"
      output: "Hi, J!"
    -   output: "Hi, " + request.user.name + "!"
```

In the example, the policy will alternate the decision based on the user's first
name, choosing either to greet them by first initial or by full name if the name
does not start with `j`. This is equivalent to the following CEL expression:

```
request.user.name.startsWith('j')
  ? "Hi, J!"
  : "Hi, " + request.user.name + "!"
```

For simple cases, this ternary may be simpler to write; however, as the number
of cases grows the ternary becomes less and less readable and the policy format
allows for simpler edits in addition to expression composition:

```
rule:
  variables:
    -   name: name
      expression: "request.user.name"
  match:
    -   condition: "variables.name.startsWith('j')"
      output: "Hi, J!"
    -   output: "Hi, " + variables.name + "!"
```

When the `condition` is absent it defaults to `true`. Since the evaluation
algorithm is first-match, an `output` without a `condition` behaves like a
default evaluation result if no other match conditions are satisfied.

#### Condition

A `condition` expression must type-check to a `bool` return type. When a
`condition` predicate evaluates to `true`, either an `output` expression is
returned or a nested `rule` result is returned. Using a `condition` with nested
`rule` values allows for the declaration of `rule` blocks with local `variables`
and reduces the complexity of `condition` expressions within the nested `rule`.

If all `output` expressions within a `rule` have associated `condition`
predicates, then the return type of the policy is `optional_type(type(output))`.
In other words, if the policy is evaluating `true` or `false` output
expressions, but all output values are conditional, then the output type of the
policy is `optional_type(bool)`. If the nested `rule` does not result in an
output, then the `optional.none()` value is returned as the overall policy
result.

Taking our example from earlier, since the `match` is exhaustive and includes a
default `output`, then the result type of this policy is `string`

```
rule:
  variables:
    -   name: name
      expression: "request.user.name"
  match:
    -   condition: "variables.name.startsWith('j')"
      output: "Hi, J!"
    -   output: "Hi, " + variables.name + "!"
```

If we remove the last output, then the result type is `optional_type(string)`
since not all evaluation paths will result in an `output`.

```
rule:
  match:
    -   condition: "request.user.name.startsWith('j')"
      output: "Hi, J!"
```

For more information on optionals, see
https://github.com/google/cel-spec/wiki/proposal-246 for more information about
`optional` values within CEL.

#### Output

The `output` field is optional and is, effectively, just like any other CEL
expression; however, the output expression types must all agree within the
policy expression graph. An output expression may be simple, such as a `bool` or
`string` value, or it may be much more complex such as a JSON-like `map` or a
strongly-typed object like a protocol buffer message.

The following example presents a very subtle distinction between the output
types with a `bool` or a `string` as the possible output type.

```
rule:
  match:
    -   condition: "true"
      output: "true"
    -   output: "'true'"
```

This configuration is invalid and will trigger a compilation error:

```
incompatible output types: bool not assignable to string
```

#### Nesting

Rules may be nested as part of a `match`. A `match` that nests a rule specifies
only a `condition` and the nested `rule`.

Example:
```
rule:
  match:
    - condition: "outer == 'condition_a'"
      rule:
        match:
          - condition: "inner == 'condition_a_1'"
            output: "'outer_a_inner_1'"
          - output: "'outer_a_inner_default'"
    - output: "'outer_default'"
```

##### Using Unconditional Nested Rules

In a first-match policy, a nested rule may be specified without an
explicit condition (or the condition set as exactly `true`). This is an
unconditional rule.

Unconditional rules are useful for two primary purposes:

_Scoping Variables_

Unconditional rules may declare variables (like foo in the example below) that
only apply to a specific group of matches. This avoids cluttering the global
scope.

_Fallback Behavior (Chaining)_

The inner matches inside an unconditional rule do not need to cover every
possible scenario. If an input runs through the inner conditions and doesn't
find a match, the engine doesn't fail or return an optional none value.
Instead, it steps back out to the parent rule and continues down the list.

Important: if an unconditional nested rule covers every possible scenario
(meaning it is exhaustive and will always generate an output), it must be the
last item in the parent rule's match list. Placing it anywhere else will
create dead code, as the engine can never reach the matches written beneath
it.

Example:

```
# Policy is a string (not wrapped)
# input -> output
# 3 -> 'b'
# 2 -> 'c'
rule:
  match:
    - rule:
        variables:
          - name: "foo"
            expression: "3"
        match:
          - condition: "input > variables.foo"
            output: '"a"'
          - condition: "input == variables.foo"
            output: '"b"'
    - output: '"c"'

```


### Imports

When constructing complex object types such as protocol buffers, `imports` can
be useful in simplifying object construction.

As an example, let's use the following protocol buffer message definitions:

```
package dev.cel.example;

message ComplexDocument {
   message Section {
     string name = 1;
     string author = 2;
     google.protobuf.Timestamp created_at = 3;
     google.protobuf.Timestamp last_modified = 4;
   }
   string title = 1;
   Section sections = 2;
}
```

To construct an instance of a document like this within CEL, the fully
qualified type names must be used:

```
rule:
  match:
    -   output: >
      dev.cel.example.ComplexDocument{
        title: "Example Document"
        sections: [
          dev.cel.example.ComplexDocument.Section{
            name: "Overview",
            author: "tristan@cel.dev",
            created_at: timestamp("2024-09-20T16:50:00Z")
          }
        ]
     }
```

Using the `imports` clause the policy, the type name and expression can be
simplified:

```
imports:
  -   name: dev.cel.example.ComplexDocument
  -   name: dev.cel.example.ComplexDocument.Section

rule:
  match:
    -   output: >
      ComplexDocument{
        title: "Example Document"
        sections: [Section{
          name: "Overview",
          author: "tristan@cel.dev",
          created_at: timestamp("2024-09-20T16:50:00Z")
        }]
      }
```

### Non-standard YAML Behaviors

CEL Expression values follow special parsing rules to preserve source location
information inside the policy document. This means that the indent and any
newline characters are included in the effective CEL expression. There is no
difference in behavior for the literal or folded style for multiline
expressions.

Example:

```yaml
name: policy

rule:
  match:
    - condition: 'true'
    - output: >
      strings.quote('''A mutiline string
      second line''')

```

Results in:

```
"A multiline string\n      second line"
```
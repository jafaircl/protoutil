# @protoutil/cel

The Common Expression Language (CEL) is a non-Turing complete language designed
for simplicity, speed, safety, and portability. CEL's C-like [syntax][1] looks
nearly identical to equivalent expressions in C++, Go, Java, and TypeScript.

```typescript
// Check whether a resource name starts with a group name.
resource.name.startsWith("/groups/" + auth.claims.group)
```

```typescript
// Determine whether the request is in the permitted time window.
request.time - resource.age < duration("24h")
```

```typescript
// Check whether all resource names in a list match a given filter.
auth.claims.email_verified && resources.all(r, r.startsWith(auth.claims.email))
```

A CEL "program" is a single expression.

CEL is ideal for lightweight expression evaluation when a fully sandboxed
scripting language is too resource intensive.

`@protoutil/cel` is a TypeScript port of [cel-go][7], and is, to our knowledge,
the only TypeScript implementation of CEL with full conformance parity against
the upstream `cel-go` test suite. See [conformance.md](./testdata/conformance/conformance.md) for
the generated CEL dashboard and [policy.md](./testdata/policy/policy.md) for the
cel-policy conformance results.

---

- [@protoutil/cel](#protoutilcel)
  - [Overview](#overview)
    - [Environment Setup](#environment-setup)
    - [Parse and Check](#parse-and-check)
      - [Macros](#macros)
    - [Evaluate](#evaluate)
      - [Partial State](#partial-state)
    - [Errors](#errors)
  - [Performance and Benchmarking](#performance-and-benchmarking)
  - [Install](#install)
  - [Common Questions](#common-questions)
    - [Why not JavaScript, Lua, or WASM?](#why-not-javascript-lua-or-wasm)
    - [Do I need to Parse _and_ Check?](#do-i-need-to-parse-and-check)
    - [Where can I learn more about the language?](#where-can-i-learn-more-about-the-language)
    - [How can I contribute?](#how-can-i-contribute)
  - [License](#license)

---

## Overview

Determine the variables and functions you want to provide to CEL. Parse and
check an expression to make sure it's valid. Then evaluate the output AST
against some input. Checking is optional, but strongly encouraged.

### Environment Setup

Let's expose `name` and `group` variables to CEL using the `variable`
declaration:

```ts
import { StringType, env, variable } from "@protoutil/cel";

const myEnv = env({
  variables: [
    variable("name", StringType),
    variable("group", StringType),
  ],
});
```

That's it. The environment is ready to be used for parsing and type-checking.
CEL supports all the usual primitive types in addition to lists, maps, as well
as first-class support for JSON and Protocol Buffers.

### Parse and Check

The parsing phase indicates whether the expression is syntactically valid and
expands any macros present within the environment. Parsing and checking are
more computationally expensive than evaluation, and it is recommended that
expressions be parsed and checked ahead of time.

The parse and check phases are combined for convenience into the `tryCompile`
step:

```ts
const result = myEnv.tryCompile(`name.startsWith("/groups/" + group)`);
if (result.errors) {
  console.error(result.errors.toDisplayString());
  throw result.errors.err();
}
const program = myEnv.program(result.ast);
```

The program generated at the end of parse and check is stateless and
cachable.

Type-checking is an optional, but strongly encouraged step that can reject some
semantically invalid expressions using static analysis. Additionally, the check
produces metadata which can improve function invocation performance and object
field selection at evaluation-time.

#### Macros

Macros are optional but enabled by default. Macros were introduced to
support optional CEL features that might not be desired in all use cases
without the syntactic burden and complexity such features might desire if
they were part of the core CEL syntax. Macros are expanded at parse time and
their expansions are type-checked at check time.

For example, when macros are enabled it is possible to support bounded
iteration / fold operators. The macros `all`, `exists`, `exists_one`, `filter`,
and `map` are particularly useful for evaluating a single predicate against
list and map values.

```typescript
// Ensure all tweets are less than 140 chars
tweets.all(t, t.size() <= 140)
```

The `has` macro is useful for unifying field presence testing logic across
protobuf types and dynamic (JSON-like) types.

```typescript
// Test whether the field is a non-default value if proto-based, or defined
// in the JSON case.
has(message.field)
```

Both cases traditionally require special syntax at the language level, but
these features are exposed via macros in CEL.

### Evaluate

Now, evaluate for fun and profit. The evaluation is side-effect free. Many
different inputs can be sent to the same program and if fields are present in
the input, but not referenced in the expression, they are ignored.

```ts
// The `result` contains the output of a successful evaluation.
// Use `evalWithDetails()` instead of `eval()` if intermediate evaluation
// state should be captured. This can be useful for visualizing how the
// result was arrived at.
const result = program.eval({
  name: "/groups/acme.co/documents/secret-stuff",
  group: "acme.co",
});
console.log(result.value()); // 'true'
```

#### Partial State

What if `name` hadn't been supplied? CEL is designed for this case. In
distributed apps it is not uncommon to have edge caches and central services.
If possible, evaluation should happen at the edge, but it isn't always possible
to know the full state required for all values and functions present in the
CEL expression.

To improve the odds of successful evaluation with partial state, CEL uses
commutative logical operators `&&`, `||`. If an error or unknown value (not the
same thing) is encountered on the left-hand side, the right hand side is
evaluated also to determine the outcome. While it is possible to implement
evaluation with partial state without this feature, this method was chosen
because it aligns with the semantics of SQL evaluation and because it's more
robust to evaluation against dynamic data types such as JSON inputs.

In the following truth-table, the symbols `<x>` and `<y>` represent error or
unknown values, with the `?` indicating that the branch is not taken due to
short-circuiting. When the result is `<x, y>` this means that the both args
are possibly relevant to the result.

| Expression          | Result   |
|----------------------|----------|
| `false && ?`        | `false`  |
| `true && false`     | `false`  |
| `<x> && false`      | `false`  |
| `true && true`      | `true`   |
| `true && <x>`       | `<x>`    |
| `<x> && true`       | `<x>`    |
| `<x> && <y>`        | `<x, y>` |
| `true \|\| ?`       | `true`   |
| `false \|\| true`   | `true`   |
| `<x> \|\| true`     | `true`   |
| `false \|\| false`  | `false`  |
| `false \|\| <x>`    | `<x>`    |
| `<x> \|\| false`    | `<x>`    |
| `<x> \|\| <y>`      | `<x, y>` |

In the cases where unknowns are expected, `partialEval: true` should be
enabled on the program. The `details` value returned by `evalWithDetails()`
will contain the intermediate evaluation values and can be provided to
`Env.residualAst()` to generate a residual expression. e.g.:

```typescript
// Residual when `name` omitted:
name.startsWith("/groups/acme.co")
```

This technique can be useful when there are variables that are expensive to
compute unless they are absolutely needed. This functionality will be the
focus of many future improvements, so keep an eye out for more goodness here!

### Errors

Parse and check errors have friendly error messages with pointers to where the
issues occur in source:

```sh
ERROR: <input>:1:40: undefined field 'undefined'
    | TestAllTypes{single_int32: 1, undefined: 2}
    | .......................................^
```

Both the parsed and checked expressions contain source position information
about each node that appears in the output AST. This information can be used
to determine error locations at evaluation time as well.

## Performance and Benchmarking

Compile and plan an expression once, then reuse the resulting program for
steady-state evaluation. Use `eval()` when only the value is needed;
`evalWithDetails()` additionally records evaluation state and runtime cost
metadata requested by the program options.

```ts
const checked = myEnv.compile(`name.startsWith("/groups/" + group)`);
const program = myEnv.program(checked, { optimize: true });

for (const input of requests) {
  const allowed = program.eval(input);
  // Consume the CEL value for this request.
  console.log(allowed.value());
}
```

The cross-runtime suite measures parse, check, compile, plan, and evaluation
against `cel-go`. It also measures synchronized policy fixtures through policy
parse, compile/composition, optimized planning, and evaluation. Diagnostic rows
form an evaluation ladder covering literals, activation lookup, calls, dynamic
and protobuf attributes, indexing, folds, details allocation, and state
observation. Residual rows separately measure partial evaluation, residual AST
construction, and the combined round trip. Run it with:

```sh
pnpm run --filter @protoutil/cel benchmark
```

See [BENCHMARK.md](./BENCHMARK.md) for the methodology and latest results.

## Install

```sh
npm install @protoutil/cel
```

## Common Questions

### Why not JavaScript, Lua, or WASM?

JavaScript and Lua are rich languages that require sandboxing to execute
safely. Sandboxing is costly and factors into the "what will I let users
evaluate?" question heavily when the answer is anything more than O(n)
complexity.

CEL evaluates linearly with respect to the size of the expression and the input
being evaluated when macros are disabled. The only functions beyond the
built-ins that may be invoked are provided by the host environment. While
extension functions may be more complex, this is a choice by the application
embedding CEL.

But, why not WASM? WASM is an excellent choice for certain applications and
is far superior to embedded JavaScript and Lua, but it does not have support
for garbage collection and non-primitive object types require semi-expensive
calls across modules. In most cases CEL will be faster and just as portable
for its intended use case.

### Do I need to Parse _and_ Check?

Checking is an optional, but strongly suggested step in CEL expression
validation. It is sufficient in some cases to simply parse and rely on the
runtime bindings and error handling to do the right thing.

### Where can I learn more about the language?

* See the [CEL Spec][1] for the specification and conformance test suite.
* See [cel-go][7] for the reference implementation this package tracks for
  conformance.

### How can I contribute?

* Use [GitHub Issues][4] to request features or report bugs.

## License

Released under the [Apache License](LICENSE).

[1]: https://github.com/google/cel-spec
[4]: https://github.com/jafaircl/protoutil/issues
[7]: https://github.com/google/cel-go

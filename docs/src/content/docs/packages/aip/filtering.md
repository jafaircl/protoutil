---
title: Filtering
description: "AIP-160: Filtering implementation"
---

This package provides a complete implementation of the [AIP-160](https://aip.dev/160) filtering grammar. It can parse filter strings, type-check them against declarations, optimize the resulting AST, and convert it back to a canonical string.

The AST uses the [`google.api.expr.v1alpha1`](https://github.com/google/cel-spec/blob/master/proto/cel/expr/syntax.proto) protobuf schema.

## Pipeline

The typical flow is: **parse** → **check** → **optimize** (optional) → use or **unparse**.

```typescript
import { parse, check, optimize, fold, unparse, ident, STRING, INT64 } from "@protoutil/aip/filtering";

// 1. Parse a filter string into a ParsedExpr
const parsed = parse('status = "active" AND rating > 3');

// 2. Type-check with declarations
const { checkedExpr, errors } = check(parsed, {
  decls: [ident("status", STRING), ident("rating", INT64)],
});

// 3. Optionally optimize the AST
const optimized = optimize(checkedExpr, fold({ min_rating: 3n }));

// 4. Convert back to a filter string
const filter = unparse(optimized.expr!);
```

## Parsing

`parse()` converts a filter string into a `ParsedExpr` containing an expression tree with source position info.

```typescript
const parsed = parse('title = "hello" AND rating >= 4');
```

An optional `maxDepth` parameter limits parenthesization nesting (default: 32):

```typescript
const parsed = parse(input, 10);
```

### Supported Literals

| Type | Examples |
|------|----------|
| String | `"hello"`, `'world'` |
| Integer | `42`, `-1` |
| Unsigned Integer | `42u` |
| Double | `3.14`, `-0.5`, `2.997e9` |
| Boolean | `true`, `false` |
| Null | `null` |
| Duration | `5s`, `1.5h`, `1h30m`, `500ms`, `100us`, `50ns`, `-10s` |
| Timestamp | `2024-01-15T10:30:00Z`, `2024-01-15T10:30:00+05:30` |

### Supported Operators

| Operator | Description |
|----------|-------------|
| `=`, `!=` | Equality / inequality |
| `<`, `<=`, `>`, `>=` | Ordering comparisons |
| `:` | Has — membership/substring test |
| `AND` | Logical conjunction (also implicit via whitespace) |
| `OR` | Logical disjunction |
| `NOT`, `-` | Logical negation |

Per AIP-160, **OR binds tighter than AND**. The expression `a OR b AND c` is parsed as `(a OR b) AND c`.

### Member Access and Functions

Dotted field paths and function calls are supported:

```
address.city = "NYC"
title.startsWith("Dr.")
author.name.contains("Smith")
```

## Type Checking

`check()` validates a parsed expression against type declarations and produces a `CheckedExpr` with type and reference annotations. Built-in declarations (comparison operators, logical operators, string methods, type coercion, etc.) are always included. Pass an options object with `decls`, `registry`, and/or `source`:

```typescript
const { checkedExpr, errors } = check(parsed, {
  decls: [ident("status", STRING)],
  source: filterString,
});

if (errors.length > 0) {
  for (const err of errors) {
    console.error(err.toString());
    //  ERROR <input>:1:5: undeclared reference to 'foo'
    //   | foo > 5
    //   | ....^
  }
}
```

Type checking is non-throwing — errors are returned as an array of `TypeCheckError` objects with source positions. The `CheckedExpr` is still returned even if there are errors.

### Built-in Declarations

The following are always available without configuration:

- **Comparison operators** — overloads for `int64`, `uint64`, `double`, `string`, `bytes`, `timestamp`, `duration`
- **Logical operators** — `AND`, `OR`, `NOT`
- **String methods** — `startsWith()`, `endsWith()`, `contains()`, `matches()`
- **Type coercion** — `int()`, `uint()`, `double()`, `string()`, `bytes()`, `bool()`
- **Utility** — `size()`, `has()`, `timestamp()`, `duration()`

### Custom Declarations

Extend the type system by passing declarations via the options object:

```typescript
import { check, ident, func, overload, BOOL, STRING } from "@protoutil/aip/filtering";

const { checkedExpr } = check(parsed, {
  decls: [
    // Declare a known field with a specific type
    ident("status", STRING),
    // Declare a custom function
    func("customMatch",
      overload("custom_match_string", [STRING, STRING], BOOL),
    ),
  ],
  source: filterString, // optional — enables source pointers in errors
});
```

### Context Declarations from Protobuf Messages

`contextDecls()` generates field declarations from a protobuf message descriptor, making all fields available as top-level identifiers in filter expressions:

```typescript
import { parse, check, contextDecls } from "@protoutil/aip/filtering";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";

const decls = contextDecls(TimestampSchema);
// → [ident("seconds", INT64), ident("nanos", INT64)]

const { checkedExpr } = check(parse("seconds > 100 AND nanos < 500"), { decls });
```

This is useful when your resource type is defined as a protobuf message — you get type-safe filtering for free without manually declaring each field.

### Registry-Based Type Checking

Pass a `@bufbuild/protobuf` `Registry` to enable field resolution on message types. When the checker encounters a select expression on a `messageType` (e.g., `ts.seconds`), it looks up the message in the registry, finds the field, and resolves its type:

```typescript
import { createRegistry } from "@bufbuild/protobuf";
import { TimestampSchema } from "@bufbuild/protobuf/wkt";
import { parse, check, ident } from "@protoutil/aip/filtering";

const registry = createRegistry(TimestampSchema);

const { checkedExpr, errors } = check(parse("ts.seconds > 100"), {
  decls: [ident("ts", messageType(TimestampSchema))],
  registry,
});
// ts.seconds resolves to INT64 via the registry
```

Without a registry, select expressions on message types fall back to `DYN` (dynamic type). With a registry, unknown fields produce type errors instead of silently succeeding.

### Struct Literals

The parser supports struct literal syntax for constructing protobuf messages in filter expressions:

```
proto3_unittest.TestAllTypes{optional_string: "hello", optional_int32: 42}
```

When a registry is provided, the checker validates that:
- The message type exists in the registry
- Each field name exists on the message
- Each field value matches the expected type

Without a registry, struct literals are accepted without validation.

### Type Builders

Primitive types: `BOOL`, `BYTES`, `DOUBLE`, `INT64`, `STRING`, `UINT64`

Well-known types: `ANY`, `DURATION`, `TIMESTAMP`

Special types: `DYN`, `NULL`, `ERROR`

Composite builders: `listType()`, `mapType()`, `messageType()`, `typeType()`, `abstractType()`

Declaration builders: `ident()`, `func()`, `overload()`, `memberOverload()`

Protobuf helpers: `contextDecls()`, `descFieldToType()`

### Output Type

Inspect the output type of a checked expression:

```typescript
import { outputType } from "@protoutil/aip/filtering";

const type = outputType(checkedExpr);
```

## Optimization

`optimize()` applies a sequence of AST transformers to a `CheckedExpr`:

```typescript
const optimized = optimize(checkedExpr, fold({ x: 5n }), inline({ alias: parse("real.field") }));
```

### Constant Folding

`fold()` substitutes identifiers with constant values and evaluates any expression where all operands are constants:

```typescript
import { optimize, fold } from "@protoutil/aip/filtering";

const optimized = optimize(checkedExpr, fold({
  retries: 3n,          // bigint for int64
  threshold: 0.95,      // number for double
  enabled: true,        // boolean
  prefix: "prod",       // string
  nothing: null,        // null
}));
```

The folder runs iteratively (up to 10 passes) until no more reductions are possible. It evaluates arithmetic, string concatenation, comparisons, logical operators, and string methods.

### Inlining

`inline()` replaces identifiers with arbitrary expression subtrees:

```typescript
import { optimize, inline, parse } from "@protoutil/aip/filtering";

const optimized = optimize(checkedExpr, inline({
  display_name: parse("user.profile.display_name"),
}));
```

Each replacement is deep-cloned with fresh node IDs on every substitution.

## Unparsing

`unparse()` converts an expression tree back into a canonical filter string, inserting parentheses only where required by operator precedence:

```typescript
import { unparse } from "@protoutil/aip/filtering";

const filter = unparse(checkedExpr.expr!);
```

## Debugging

`toDebugString()` renders an expression tree with optional annotations:

```typescript
import { toDebugString, KindAdorner, LocationAdorner } from "@protoutil/aip/filtering";

// Plain structure
toDebugString(expr);

// With Go-style type annotations
toDebugString(expr, new KindAdorner());

// With source locations
toDebugString(expr, new LocationAdorner(checkedExpr.sourceInfo!));
```

## Depth Validation

Guard against deeply nested expressions:

```typescript
import { assertExprDepth, exprDepth } from "@protoutil/aip/filtering";

const depth = exprDepth(expr);
assertExprDepth(expr);        // throws ExprDepthError if > 32
assertExprDepth(expr, 10);    // custom max
```

## Error Handling

All errors extend `AipFilterError` and include source position information:

- **`ParseError`** — thrown by `parse()` for syntax errors
- **`TypeCheckError`** — returned (not thrown) by `check()` for type errors
- **`ExprDepthError`** — thrown by `assertExprDepth()` when nesting exceeds the limit

Each error renders with a source pointer:

```
ERROR <input>:1:12: undeclared reference to 'xyz'
 | status = xyz
 | ...........^
```

## AST Structure

Key types from the `google.api.expr.v1alpha1` schema (re-exported from this module):

- **`ParsedExpr`** — parser output with `expr` and `sourceInfo`
- **`CheckedExpr`** — checker output adding `typeMap` and `referenceMap`
- **`Expr`** — a single AST node with an `exprKind` discriminator (`constExpr`, `identExpr`, `selectExpr`, `callExpr`, `listExpr`, `structExpr`)
- **`Constant`** — literal values with `constantKind` discriminator (`stringValue`, `int64Value`, `doubleValue`, `boolValue`, `nullValue`, `durationValue`, `timestampValue`, etc.)

# PostgreSQL profile, major version 1

Status: Draft

This profile extends `protoutil.celql.ansisql` major version 1.

Profile name: `protoutil.celql.postgresql`
Major version: `1`
Output type: `protoutil.celql.postgresql.v1.PostgreSqlPredicate`
Configuration type: `protoutil.celql.postgresql.v1.PostgreSqlConfiguration`
Target: PostgreSQL 14 or later with UTF-8 server encoding

The profile accepts every expression in the ANSI SQL version 1 fragment. Unless this document states a different rule, the ANSI SQL rule and emitted operator apply.

## Parameters and configuration

The profile emits numbered placeholders. Without configuration, the first placeholder is `$1`. When `start_position` is set, the first placeholder uses that positive number and each following placeholder increments it by one.

The profile MUST reject configuration of another protobuf type. The profile MUST reject a `start_position` of zero. Both failures use `invalid profile configuration`.

Each `PostgreSqlParameter` records the source CEL type and the exact value that the caller binds. A pattern operation can derive that bound value as specified below. Equal values are not deduplicated.

## Array columns

The profile adds `list(bool)`, `list(int)`, `list(uint)`, `list(double)`, `list(string)`, `list(bytes)`, `list(google.protobuf.Timestamp)`, and `list(google.protobuf.Duration)` to the supported CEL types. Array element constants follow the ANSI SQL version 1 value-range rules, including the portable `uint` maximum.

The caller MUST map a `list(T)` query field path only to a one-dimensional PostgreSQL array column with the corresponding element type.

The profile supports a query field path with CEL type `list(T)` as the right operand of `in_list` when the left operand is a constant of type `T`.

For `C in P`, the profile emits:

```text
CASE WHEN P IS NULL THEN NULL ELSE array_position(P, $n) IS NOT NULL END
```

`array_position` uses PostgreSQL's not-distinct comparison and therefore preserves CEL equality for null array elements. The `CASE` preserves the error behavior of a null list under negation.

The profile supports the lowered `exists` comprehension over an array query field path when its predicate is equality between the iteration variable and one constant of the array element type. It emits the same `array_position` form.

Other comprehensions over array columns MUST be rejected with `unsupported expression`.

## Regular expressions

The profile supports `matches_string` for a string query field path and a constant pattern in the common Boolean-language subset of RE2 and PostgreSQL ARE syntax.

The accepted subset supports ASCII literals other than U+0000, `.`, `^`, `$`, character classes, grouping, alternation, and the `*`, `+`, `?`, and `{m,n}` quantifiers. A numeric quantifier bound MUST be at most 255. The subset supports backslash only when it quotes punctuation. It rejects lookaround, named groups, inline flags, backreferences, shorthand character classes, Unicode properties, and malformed patterns.

The profile emits `(P COLLATE pg_catalog."C") ~ $n`. The explicit collation makes ASCII character ranges independent of the database locale. The pattern remains a bound parameter. The profile prefixes the bound pattern with PostgreSQL's `(?p)` option. This makes dot newline-sensitive without making `^` and `$` match at internal newlines, which matches the default RE2 behavior.

The default maximum pattern size is 1024 UTF-8 bytes. A larger pattern is rejected with `resource limit exceeded`. An invalid or unsupported pattern is rejected with `unsupported expression`.

PostgreSQL and RE2 use different matching engines and can have different resource costs. This profile accepts only the shared syntax above and provides no complexity equivalence guarantee. Callers SHOULD apply a database statement timeout in addition to the translation limit.

## Identifiers, null, and absence

Identifiers use PostgreSQL delimited identifier syntax, which is the ANSI SQL version 1 encoding.

The caller MUST use PostgreSQL 14 or later with UTF-8 server encoding. This preserves the CEL string domain for bound values and the newline behavior of regular-expression input.

PostgreSQL null behavior is `NULL_SEMANTICS_DISTINCT_NULL`. Absence behavior is `ABSENCE_SEMANTICS_REJECTED`. The profile rejects `has()` because a relational column does not distinguish absence from null.

## Limits

The profile inherits the ANSI SQL version 1 input and parameter limits. Output growth counts Unicode code points in the PostgreSQL expression after numbered placeholders are emitted.

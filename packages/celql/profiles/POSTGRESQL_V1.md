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

## Timestamp range library

The optional `protoutil.celql.timestamp_ranges` major version 1 library defines the opaque CEL type `protoutil.celql.TimestampRange`. The caller MUST map a query field with that type only to a PostgreSQL `tstzrange` column.

The library defines `timestampRange(start, end)`, where both arguments are constant `google.protobuf.Timestamp` values. The function represents the half-open interval `[start, end)`. The translator MUST reject a range whose start is after its end with `unsupported expression`.

`range.contains(value)` accepts a timestamp-range query field and a constant timestamp. The translator MUST emit `P @> $n::timestamptz`.

`range.overlaps(timestampRange(start, end))` accepts a timestamp-range query field. The translator MUST emit `P && tstzrange($n, $n, '[)')`.

The empty range, where `start` equals `end`, contains no timestamps and does not overlap any range. PostgreSQL `NULL` range values retain SQL's null result. The library accepts no other range type, bound shape, or range operation.

## Full-text search library

The optional `protoutil.celql.full_text_search` major version 1 library defines the opaque CEL type `protoutil.celql.FullTextIndex` and the operation `index.matchesText(query)`. A query MUST contain one or more lowercase ASCII alphanumeric terms separated by one ASCII space. The operation selects a record whose indexed terms contain every query term.

The caller MUST map a query field with that type only to a PostgreSQL `tsvector` column that uses the `simple` text-search configuration. A configuration that stems terms, applies a stop-word list, or applies language-specific tokenization is outside this storage contract.

The translator MUST emit `P @@ plainto_tsquery('simple', $n)`. PostgreSQL evaluates this condition in any Boolean position, including a negation and a disjunction.

The library rejects any other operand shape or query syntax with `unsupported expression`. It does not implement stemming, phrase search, prefixes, weights, ranking, or user-selected text-search configurations.

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

For a `list(string)` query field whose array elements are never `NULL`, the profile also supports the lowered `exists` comprehension when its predicate is `startsWith`, `endsWith`, or `contains` between the iteration variable and one constant string. It emits `EXISTS` over `unnest(P)` with the same `LIKE` wildcard placement and escaping as the ANSI SQL string operation. A `NULL` array result remains `NULL`.

Other comprehensions over array columns MUST be rejected with `unsupported expression`.

## Regular expressions

The profile supports `matches_string` for a string query field path and a constant pattern in the common Boolean-language subset of RE2 and PostgreSQL ARE syntax.

The accepted subset supports ASCII literals other than U+0000, `.`, `^`, `$`, character classes, grouping, alternation, and the `*`, `+`, `?`, and `{m,n}` quantifiers. A numeric quantifier bound MUST be at most 255. The subset supports backslash only when it quotes punctuation. It rejects lookaround, named groups, inline flags, backreferences, shorthand character classes, Unicode properties, and malformed patterns.

The profile emits `(P COLLATE pg_catalog."C") ~ $n`. The explicit collation makes ASCII character ranges independent of the database locale. The pattern remains a bound parameter. The profile prefixes the bound pattern with PostgreSQL's `(?p)` option. This makes dot newline-sensitive without making `^` and `$` match at internal newlines, which matches the default RE2 behavior.

The default maximum pattern size is 1024 UTF-8 bytes. A larger pattern is rejected with `resource limit exceeded`. An invalid or unsupported pattern is rejected with `unsupported expression`.

PostgreSQL and RE2 use different matching engines and can have different resource costs. This profile accepts only the shared syntax above and provides no complexity equivalence guarantee. Callers SHOULD apply a database statement timeout in addition to the translation limit.

## Case-insensitive string library

The optional `protoutil.celql.case_insensitive_strings` major version 1 library adds the `startsWithIgnoreCase`, `endsWithIgnoreCase`, and `containsIgnoreCase` CEL member functions. Their overload identifiers are `starts_with_ignore_case_string`, `ends_with_ignore_case_string`, and `contains_ignore_case_string`.

`CELQL-PG-CIS-001`: WHEN the caller selects this library, the effective capability MUST contain its library reference and all three overloads.

`CELQL-PG-CIS-002`: The caller MUST map the first operand of a case-insensitive string operation only to a string field whose values are in the ASCII domain.

`CELQL-PG-CIS-003`: WHEN the constant pattern contains a non-ASCII code point, the translator MUST reject the expression with `unsupported expression`.

`CELQL-PG-CIS-004`: WHEN the translator accepts a case-insensitive string operation, it MUST emit the field path inside `lower()`, the `LIKE` operator, a bound pattern parameter, and `ESCAPE '\\'`.

`CELQL-PG-CIS-005`: The translator MUST fold the constant to lower case before it escapes and binds the pattern, because `lower()` folds the stored value and an unfolded pattern would select no record.

`CELQL-PG-CIS-006`: The translator MUST apply the same wildcard placement and metacharacter escaping as the corresponding case-sensitive ANSI SQL string operation.

Both sides of the comparison therefore reach PostgreSQL folded. Inside the ASCII domain that `CELQL-PG-CIS-002` requires, `lower()` and the library's own ASCII folding agree, so the emitted predicate selects the records that CEL evaluation selects.

The standard `startsWith`, `endsWith`, and `contains` functions remain case-sensitive and continue to emit `LIKE` in a translator that selects this library.

### Index guidance

An ordinary index on the mapped column cannot answer a case-insensitive prefix, because that index orders values by their unfolded bytes. A caller that needs `startsWithIgnoreCase` to use an index SHOULD create an expression index over the folded value:

```sql
CREATE INDEX ON records (lower(name) text_pattern_ops);
```

That index is a core PostgreSQL feature and needs no extension. `endsWithIgnoreCase` and `containsIgnoreCase` emit a pattern with a leading wildcard, which no B-tree index answers; a caller that needs those operations to use an index requires a trigram index from the `pg_trgm` extension.

## Identifiers, null, and absence

Identifiers use PostgreSQL delimited identifier syntax, which is the ANSI SQL version 1 encoding.

The caller MUST use PostgreSQL 14 or later with UTF-8 server encoding. This preserves the CEL string domain for bound values and the newline behavior of regular-expression input.

PostgreSQL null behavior is `NULL_SEMANTICS_DISTINCT_NULL`. Absence behavior is `ABSENCE_SEMANTICS_REJECTED`. The profile rejects `has()` because a relational column does not distinguish absence from null.

## Limits

The profile inherits the ANSI SQL version 1 input and parameter limits. Output growth counts Unicode code points in the PostgreSQL expression after numbered placeholders are emitted.

# SQLite profile, major version 1

Status: Draft

This profile extends `protoutil.celql.ansisql` major version 1.

Profile name: `protoutil.celql.sqlite`
Major version: `1`
Output type: `protoutil.celql.ansisql.v1.AnsiSqlPredicate`
Configuration type: none
Target: SQLite

The profile accepts every expression in the ANSI SQL version 1 fragment. Unless this document states a different rule, the ANSI SQL rule and emitted operator apply.

## Parameters and identifiers

The profile emits positional `?` placeholders. Parameters use the `AnsiSqlPredicate` representation and retain their source CEL type and exact bound value.

The profile emits every query-field-path component as a double-quote-delimited SQLite identifier. It doubles a double quote inside a component. The profile rejects a path that the shared SQL profile cannot encode safely.

## Equality and inequality

The profile emits CEL equality with SQLite's `IS` operator and CEL inequality with SQLite's `IS NOT` operator:

```text
L IS R
L IS NOT R
```

These forms preserve the ANSI SQL version 1 distinct-null behavior. The profile MUST NOT substitute `=` or `<>` for these forms.

## Null and absence

SQLite null behavior is `NULL_SEMANTICS_DISTINCT_NULL`. Absence behavior is `ABSENCE_SEMANTICS_REJECTED`. The profile rejects `has()` because a relational column does not distinguish absence from null.

## Case-insensitive string library

The optional `protoutil.celql.case_insensitive_strings` major version 1 library
adds `startsWithIgnoreCase`, `endsWithIgnoreCase`, and `containsIgnoreCase`.
The caller MUST map their field operand only to a string column whose stored
values are ASCII. The constant MUST also be ASCII. The translator rejects a
non-ASCII constant with `unsupported expression`.

The translator uses SQLite's built-in ASCII `LIKE` folding with a bound pattern
and `ESCAPE '\\'`. The library applies the same wildcard placement and escaping
as the case-sensitive operations. It does not claim a portable result for
Unicode case folding, collation tailoring, or normalization.

## Full-text search library

The optional `protoutil.celql.full_text_search` major version 1 library defines
the opaque CEL type `protoutil.celql.FullTextIndex` and the operation
`index.matchesText(query)`. A query MUST contain one or more lowercase ASCII
alphanumeric terms separated by one ASCII space. The operation selects a record
whose indexed terms contain every query term. The translator rejects any other
query syntax with `unsupported expression`, so a target query operator never
reaches the target from a CEL constant.

The library does not implement stemming, phrase search, prefixes, weights,
ranking, stop-word handling, or language configuration.

The caller MUST map a query field with that type only to a one-component path
that names an FTS5 table which the caller's query joins to the record table. The
FTS5 tokenizer MUST map every term of the query domain to one token. An ordinary
text column is outside this storage contract.

The translator MUST bind every query term as an FTS5 phrase joined by `AND`, and
MUST emit:

```text
P MATCH ?
```

SQLite accepts an FTS5 `MATCH` only where a conjunction reaches it. The
translator MUST reject a match under a negation or a disjunction with
`unsupported expression` instead of emitting a query that SQLite refuses.

## Limits

The profile inherits the ANSI SQL version 1 input, parameter, and output-growth limits. Output growth counts Unicode code points in the SQLite predicate after placeholder emission.

## JSON1 string arrays

The profile accepts a `list(string)` query field only when the mapped column
contains a valid SQLite JSON1 array of strings. The profile does not infer JSON
array storage from an arbitrary text column. `C in P` and
`P.exists(element, element == C)` emit an `EXISTS` query over `json_each(P)`
with SQLite total equality. Empty arrays do not match. SQL `NULL`, JSON `null`,
and non-array JSON values are outside this storage contract.

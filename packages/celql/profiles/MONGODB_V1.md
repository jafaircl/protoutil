# MongoDB profile, major version 1

Status: Draft

This document is the profile contract required by `SPEC.md` section 9.

Profile name: `protoutil.celql.mongodb`
Major version: `1`
Output type: `protoutil.celql.mongodb.v1.MongoDbPredicate`
Configuration type: none
Target: MongoDB filter documents

The profile translates a checked CEL Boolean expression into one MongoDB filter document. The output document is encoded in the `filter` field as a `cel.expr.Value` map.

The envelope is deliberately driver-neutral. Every CEL constant remains a typed `cel.expr.Value`, not a JavaScript value or raw BSON. An integration converts that envelope to its MongoDB driver document at the boundary. BSON-only values, including `ObjectId`, `Decimal128`, JavaScript code, and regular-expression objects, are not part of this profile.

## 1. Supported input domain

Supported CEL types are `bool`, `int`, `uint`, `double`, `string`, and `bytes`. The profile supports no optional type, temporal type, enum, message, map, or list query-field type.

`uint` is supported only through `2^63 - 1`. A larger value has no equivalent signed BSON integer representation and MUST be rejected with `unsafe translation`.

The profile declares `NULL_SEMANTICS_REJECTED` and `ABSENCE_SEMANTICS_REJECTED`.

The translator MUST reject a CEL `null` constant, an optional type, and a lowered `has()` expression with `unsupported expression`. The caller MUST map every accepted query field path only to a BSON field that is present, non-null, and has the declared CEL type. These preconditions avoid treating MongoDB's missing-field behavior as CEL `null`, particularly under negation.

The profile supports no comprehension form. It supports `matches_string` for an ASCII subset shared by CEL RE2 and MongoDB PCRE2. The subset permits ASCII literals, escaped regular-expression metacharacters, character classes, dot, a leading `^` anchor, bounded repetition up to 255, and at most one unbounded quantifier. It rejects groups, alternation, `$`, multiple unbounded quantifiers, engine-specific escapes, lookaround, Unicode-dependent syntax, POSIX classes, and counted repetition above 255 before MongoDB sees the pattern.

## 2. Query field paths

A query field path comes from an `ident_expr`, or a `select_expr` chain whose innermost operand is an `ident_expr`. The profile joins its components with `.`.

Every component MUST be non-empty, contain no U+0000 or `.`, and not begin with `$`. A path that violates these conditions MUST be rejected with `unresolved query field path`. The restrictions prevent a field path from becoming a MongoDB operator or a differently nested path.

## 3. Structured value encoding

The `filter` field is always a `cel.expr.Value` whose kind is `map_value`. Map keys are `string_value`; lists are `list_value`.

| CEL type | `cel.expr.Value` kind |
| --- | --- |
| `bool` | `bool_value` |
| `int` | `int64_value` |
| `uint` | `uint64_value` |
| `double` | `double_value` |
| `string` | `string_value` |
| `bytes` | `bytes_value` |

The profile declares `PARAMETER_STYLE_NONE`: these values are structured data, never text interpolation or raw MongoDB query syntax.

## 4. Operations

`P` is a query field path and `C` is a CEL constant. All accepted comparisons require exactly one `P` and one `C`; two paths and two constants are rejected with `unsupported overload`.

| CEL overload | MongoDB filter encoding |
| --- | --- |
| `logical_and` | `{ "$and": [L, R] }` |
| `logical_or` | `{ "$or": [L, R] }` |
| `logical_not` | `{ "$nor": [L] }` |
| `equals` | `{ P: { "$eq": C } }` |
| `not_equals` | `{ P: { "$ne": C } }` |
| `less_*` | `{ P: { "$lt": C } }` |
| `less_equals_*` | `{ P: { "$lte": C } }` |
| `greater_*` | `{ P: { "$gt": C } }` |
| `greater_equals_*` | `{ P: { "$gte": C } }` |
| `starts_with_string` | `{ P: { "$regex": "^" + esc(C) } }` |
| `ends_with_string` | `{ P: { "$regex": esc(C) + "$" } }` |
| `contains_string` | `{ P: { "$regex": esc(C) } }` |
| `matches_string` | `{ P: { "$regex": C } }`, when `C` is in the MongoDB-safe regex subset |
| `in_list` | `{ P: { "$in": [C, ...] } }` |

For an ordering comparison written with `C` on the left and `P` on the right, the profile reverses the MongoDB comparison operator. Equality operators are unchanged.

The three string operations accept a string field path and a string constant only. `esc` prefixes every MongoDB regular-expression metacharacter (`\\`, `^`, `$`, `.`, `*`, `+`, `?`, `(`, `)`, `[`, `]`, `{`, `}`, and `|`) with `\\`. The emitted pattern therefore remains literal CEL string data; the profile does not accept user-provided regular-expression syntax.

`in_list` accepts a field path followed by a non-empty CEL list literal whose elements are constants. An empty list is rejected with `unsupported expression`.

A Boolean path appearing as the root or a logical operand emits `{ P: { "$eq": true } }`.

Every overload not listed above is rejected with `unsupported overload`.

## Case-insensitive string library

The optional `protoutil.celql.case_insensitive_strings` major version 1 library
adds `startsWithIgnoreCase`, `endsWithIgnoreCase`, and `containsIgnoreCase`.
The caller MUST map their field operand only to a present, non-null BSON string
whose value is ASCII. The constant MUST also be ASCII. The translator rejects a
non-ASCII constant with `unsupported expression`.

The library emits an escaped literal `$regex` pattern and the fixed `$options:
"i"` value. It does not expose arbitrary regular-expression flags. It does not
claim a portable result for Unicode case folding, tokenization, normalization,
or PCRE2 language behavior outside the declared ASCII domain.

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

The caller MUST map a query field with that type only to a field that the
collection's single text index covers. The index MUST cover exactly that field
and MUST use `default_language: "none"`, so that MongoDB applies no stemmer and
no stop-word list. A collection without such an index is outside this storage
contract.

MongoDB combines unquoted `$text` terms with a logical OR, so the translator
MUST bind every query term as its own `$text` phrase, which MongoDB requires to
occur. The translator MUST emit:

```text
{ "$text": { "$search": "\"term\" \"term\"" } }
```

MongoDB evaluates `$text` only where a conjunction reaches it. The translator
MUST reject a search under `$or` or `$nor`, which a CEL disjunction or negation
produces, with `unsupported expression` instead of emitting a query that MongoDB
refuses.

## Geospatial library

The optional `protoutil.celql.geospatial` major version 1 library defines the
opaque CEL types `protoutil.celql.GeoPoint` and `protoutil.celql.GeoPolygon`,
and the operations below. Every coordinate is WGS 84, which is EPSG 4326, in
degrees.

`geoPoint(longitude, latitude)` constructs one position from two constants, in
that order. The translator rejects a longitude outside -180 through 180 or a
latitude outside -90 through 90 with `unsupported expression`.

`geoPolygon(ring)` constructs one polygon from a constant list of positions. The
ring MUST end with its first position, MUST hold 4 through 64 positions, MUST
NOT repeat a position consecutively, and MUST be convex and counterclockwise.
Ring edges are geodesics. The translator rejects every other ring with
`unsupported expression`, because containment in an open, clockwise, or concave
ring is target-specific.

`point.geoWithin(polygon)` and `point.geoIntersects(polygon)` select a stored
position that lies inside the ring or on it. Containment is closed. Over a
stored position the two operations select the same records, and each target
emits its own operator.

`point.geoWithinDistance(center, metres)` selects a stored position whose
great-circle distance to a constant position is at most the constant bound. The
distance uses a sphere of radius 6378100 metres, not the WGS 84 ellipsoid,
because a sphere is the only earth model that every binding computes
identically. The translator rejects a bound below zero metres, and a bound that
is not finite, with `unsupported expression`.

A constructor is query shape for one spatial operation. The translator rejects a
constructor that no spatial operation consumes.

The caller MUST map a `GeoPoint` query field only to a present GeoJSON `Point`
whose `coordinates` hold longitude and then latitude. MongoDB assumes WGS 84 for
every GeoJSON object. A `2dsphere` index on the mapped field is not required by
any emitted operator and only improves selection performance.

The profile emits `$geoWithin` with `$geometry` for containment, `$geoIntersects`
with `$geometry` for intersection, and `$geoWithin` with `$centerSphere` for a
distance bound. MongoDB `$geoWithin` includes a position that lies on the ring,
which matches the library's closed containment. A `$centerSphere` radius is the
metre bound divided by the library's sphere radius.

## 5. Limits and conformance

The profile inherits CELQL's default checked-expression limits except that its default `max_output_growth` is 16 MiB. Output growth is the encoded byte length of `MongoDbPredicate`, and a larger predicate is rejected with `resource limit exceeded`.

The pattern checks limit translation-time input and exclude regex structures that multiply PCRE2 backtracking paths. They do not bound the size of stored field values or database work. A MongoDB integration MUST apply an appropriate query timeout or `maxTimeMS` limit.

A completed profile suite MUST compare the exact `MongoDbPredicate` protobuf output. Target integration tests MUST additionally convert the typed envelope at the driver boundary and verify selection against MongoDB.

## 6. Native string arrays

The profile accepts a `list(string)` query field only when every queried BSON
document contains that field as an array of present, non-null strings. `C in P`
and `P.exists(element, element == C)` emit `{ P: { "$eq": C } }`, which MongoDB
uses for native array-element equality. Empty arrays do not match. A missing
field, BSON `null`, a scalar field, or an array with null elements is outside
this storage contract; the caller MUST reject or normalize those records before
using this profile. The profile does not merge those states into one CEL value.

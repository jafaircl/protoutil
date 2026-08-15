# MySQL profile, major version 1

Status: Draft

This profile extends `protoutil.celql.ansisql` major version 1.

Profile name: `protoutil.celql.mysql`
Major version: `1`
Output type: `protoutil.celql.ansisql.v1.AnsiSqlPredicate`
Configuration type: none
Target: MySQL 8.0 or later

The profile accepts every expression in the ANSI SQL version 1 fragment. Unless this document states a different rule, the ANSI SQL rule and emitted operator apply.

## Parameters and identifiers

The profile emits positional `?` placeholders. Parameters use the `AnsiSqlPredicate` representation and retain their source CEL type and exact bound value.

The profile emits every query-field-path component as a MySQL backtick-delimited identifier. It doubles a backtick inside a component. The profile rejects a path that the shared SQL profile cannot encode safely.

## Equality and inequality

The profile emits CEL equality with MySQL's null-safe equality operator:

```text
L <=> R
```

The profile emits CEL inequality as:

```text
NOT (L <=> R)
```

These forms preserve the ANSI SQL version 1 distinct-null behavior. The profile MUST NOT substitute `=` or `<>` for these forms.

## Null and absence

MySQL null behavior is `NULL_SEMANTICS_DISTINCT_NULL`. Absence behavior is `ABSENCE_SEMANTICS_REJECTED`. The profile rejects `has()` because a relational column does not distinguish absence from null.

## Literal patterns

The profile binds every CEL string-pattern value and uses SQL `LIKE`. MySQL's
string-literal grammar requires two backslashes to encode the one backslash
that `LIKE` uses as its escape character, so every emitted pattern condition
ends with:

```text
ESCAPE '\\'
```

The bound pattern escapes backslash, percent, and underscore before adding the
operation's leading or trailing wildcard. The profile MUST NOT interpolate the
CEL pattern value into SQL text.

## Case-insensitive string library

The optional `protoutil.celql.case_insensitive_strings` major version 1 library
adds `startsWithIgnoreCase`, `endsWithIgnoreCase`, and `containsIgnoreCase`.
The caller MUST map their field operand only to a MySQL `utf8mb4` string column
whose stored values are ASCII. The constant MUST also be ASCII. The translator
rejects a non-ASCII constant with `unsupported expression`.

The translator emits the field inside `LOWER()` and uses `LIKE`, a bound
pattern, and `ESCAPE '\\'`. It MUST fold the constant to lower case before it
escapes and binds the pattern, because `LOWER()` folds the stored value and an
unfolded pattern would select no record. Both sides therefore reach MySQL
folded, which makes the result independent of the mapped column's collation.

The library applies the same wildcard placement and escaping as the
case-sensitive operations. It does not claim a portable result for Unicode case
folding, collation tailoring, or normalization.

MySQL uses a functional index over `LOWER(P)` for equality but not for a `LIKE`
prefix, so a case-insensitive operation reads the whole index. A caller that
needs an index-backed prefix match maps the field to a column whose collation is
case-insensitive and uses the case-sensitive `startsWith` instead, which MySQL
answers with a range scan.

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

The caller MUST map a query field with that type only to a `NOT NULL` column
that a single-column `FULLTEXT` index covers. The index MUST tokenize every term
of the query domain and MUST apply no stop-word list, which requires
`innodb_ft_min_token_size=1` and `innodb_ft_enable_stopword=OFF` when the index
is built. A nullable column is outside this storage contract, because
`MATCH` returns zero for SQL `NULL` and therefore selects that row under a
negation.

The translator MUST bind one boolean-mode query in which every term carries the
`+` operator, and MUST emit:

```text
MATCH (P) AGAINST (? IN BOOLEAN MODE)
```

MySQL evaluates this condition in any Boolean position, including a negation and
a disjunction.

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

The caller MUST map a `GeoPoint` query field only to a `NOT NULL POINT` column
that declares SRID 4326. The profile binds every constant geometry as
well-known text and reads it with an explicit coordinate order, so a coordinate
never becomes SQL syntax:

```text
ST_Intersects(P, ST_GeomFromText(?, 4326, 'axis-order=long-lat'))
ST_Distance_Sphere(P, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), 6378100) <= ?
```

MySQL has no index-usable spherical distance operator, so a distance bound
leads with the bounding rectangle of that bound:

```text
(MBRIntersects(P, ST_GeomFromText(?, 4326, 'axis-order=long-lat'))
 AND ST_Distance_Sphere(P, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), 6378100) <= ?)
```

The rectangle holds every position that the exact test accepts, so the pair
selects the same records as the exact test alone, and a `SPATIAL` index on the
mapped column answers the rectangle. The profile MUST omit the rectangle when
the bound crosses the antimeridian or reaches a pole, because one rectangle
cannot describe those regions and MySQL selects no position from a rectangle
that spans every longitude.

The containment and intersection operations both emit `ST_Intersects`, because
MySQL `ST_Within` excludes a position that lies on the ring and would therefore
not preserve the library's closed containment.

## Limits

The profile inherits the ANSI SQL version 1 input, parameter, and output-growth limits. Output growth counts Unicode code points in the MySQL predicate after placeholder emission.

## JSON string arrays

The profile accepts a `list(string)` query field only when the mapped column has
MySQL `JSON` storage and each stored non-null value is a JSON array of strings.
The profile does not treat `TEXT`, `VARCHAR`, or arbitrary JSON values as an
array. `C in P` and `P.exists(element, element == C)` accept a constant string
and emit `JSON_CONTAINS(P, JSON_ARRAY(?))`. Empty arrays do not match. SQL
`NULL`, JSON `null`, missing values, and non-array JSON values are outside this
storage contract.

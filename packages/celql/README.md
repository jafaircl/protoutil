# @protoutil/celql

Translate a checked CEL expression into a query predicate.

The input is a standard `cel.expr.CheckedExpr`. The output is a predicate of the type that the selected dialect profile declares. A predicate is one Boolean condition, not a complete query.

This package does not parse CEL source text, check it, evaluate it, or execute queries. Produce the checked expression with `@protoutil/cel` or another conforming CEL implementation, then translate it here.

## Usage

Declare the query fields in a CEL environment, select a profile, and translate the checked expression:

```ts
import { astToCheckedExpr, env, IntType, StringType, variable } from "@protoutil/cel";
import { createTranslator } from "@protoutil/celql";
import { caseInsensitiveStrings, PostgreSqlProfile } from "@protoutil/celql/postgresql";

const caseInsensitive = caseInsensitiveStrings();

const cel = env({
  variables: [variable("name", StringType), variable("age", IntType)],
  libraries: [caseInsensitive],
});
const translator = createTranslator(new PostgreSqlProfile(), {
  libraries: [caseInsensitive],
});

const ast = cel.compile('name.startsWithIgnoreCase("ali") && age > 21');
const outcome = translator.translate({ checkedExpression: astToCheckedExpr(ast) });
```

`outcome` is `match_all`, `match_none`, or a predicate. The predicate above holds:

```text
(lower("name") LIKE $1 ESCAPE '\' AND "age" > $2)

parameters: ["ali%", "21"]
```

`createTranslator` requires one constructed profile. The returned translator uses that profile and library set for every call, so create another translator for another target or library set. `translator.validate({ checkedExpression })` runs the same traversal and returns nothing, which suits an expression that a service accepts now and translates later.

A rejection that the specification defines throws `CelqlError` with a stable `code`. An unexpected profile exception propagates unchanged.

## Entry points

The root entry point exports the target-independent contracts: the translator, the error type, the profile and library interfaces, and the CEL type and library definitions that every target shares. Each dialect uses its own subpath:

- `@protoutil/celql/ansisql`
- `@protoutil/celql/mongodb`
- `@protoutil/celql/mysql`
- `@protoutil/celql/postgresql`
- `@protoutil/celql/sqlite`

This boundary keeps an import of the root package, or of one dialect, from pulling another dialect into the dependency graph.

## Translation model

```text
checked CEL expression ──▶ translation ──▶ match_all | match_none | predicate
```

A caller selects one profile explicitly. A translator never infers a profile from the expression, and never substitutes another profile when the selected one rejects an expression.

Translation is atomic. When any reachable part of the expression cannot be translated correctly, the whole translation fails. A partial predicate would silently widen or narrow the selected records, so the translator never returns one.

`match_all` and `match_none` are distinct outcomes, not predicates that happen to select every record or no record. A caller MUST NOT run an unrestricted query after `match_none` or after an error.

Before translating, substitute every value that is known independently of the queried record, such as the current time, the requesting user, configuration, and data fetched elsewhere. What remains must be identifiers and selections that map onto fields in the target.

## Safety

A value from a CEL constant stays data. It never becomes an identifier, an operator, a function name, a keyword, or raw syntax. A profile that emits textual query syntax binds string and bytes values as parameters, and never escapes them into the query text.

Parameter binding alone is not sufficient where a target operator reads its parameter as a pattern language. A profile that translates through such an operator also escapes the data characters that the language would otherwise interpret. The full-text and pattern operations follow this rule, so a query operator never reaches a target from a CEL constant.

## Executing a predicate

A predicate carries its parameters as typed values, not as JavaScript
primitives, because the output is a protobuf message that crosses process and
language boundaries and keeps every CEL type exactly. A 64-bit integer survives
that trip; a JavaScript number would not. Unwrap the parameters when the
predicate reaches the client that runs the query.

`postgreSqlParameters` returns values that `pg` binds without further
conversion. It is positional, so element `n` binds `$n + 1`:

```ts
import { postgreSqlParameters } from "@protoutil/celql/postgresql";

if (outcome.case === "predicate") {
  const { rows } = await client.query(
    `SELECT id FROM records WHERE ${outcome.value.sql}`,
    postgreSqlParameters(outcome.value),
  );
}
```

`mongoDbFilter` returns the filter document that a driver accepts:

```ts
import { mongoDbFilter } from "@protoutil/celql/mongodb";

if (outcome.case === "predicate") {
  const documents = await collection.find(mongoDbFilter(outcome.value)).toArray();
}
```

MySQL and SQLite emit `AnsiSqlPredicate` with `?` markers. `parameterValues`
returns each value in binding order:

```ts
import { parameterValues } from "@protoutil/celql";

if (outcome.case === "predicate") {
  const [rows] = await connection.execute(
    `SELECT id FROM records WHERE ${outcome.value.sql}`,
    parameterValues(outcome.value.parameters),
  );
}
```

`parameterValues` returns `null`, `boolean`, `bigint`, `number`, `string`,
`Uint8Array`, an array of those, or a `google.protobuf.Timestamp` or
`google.protobuf.Duration`. An integer arrives as `bigint` so that a 64-bit
value keeps its magnitude, and a client that sends a `bigint` as a double needs
`String(value)` instead. A timestamp and a duration arrive as their protobuf
types, because a column can store either one as a temporal type, as a number,
or as text, and this package does not choose for the caller.

## Dialect profiles

Every conforming implementation provides the **ANSI SQL** baseline profile, which targets the SQL of ISO/IEC 9075. It emits a search condition with `?` parameter markers and delimited identifiers:

```text
("name" = ? AND "age" > ?)

parameters: ["alice", 21]
```

A dialect whose target differs from ISO/IEC 9075 **extends** the baseline instead of replacing it. An extending profile accepts everything the baseline accepts and selects the same records for those expressions, but emits its own output: different parameter markers, different identifier quoting, or operations that the baseline cannot express. Extension is one level deep, so the complete contract is always two documents.

### What the baseline accepts

Comparisons on `bool`, `int`, `uint`, `double`, `string`, `bytes`, timestamps, and durations. Boolean columns used directly. `&&`, `||`, and `!`. `startsWith`, `endsWith`, and `contains`. `in` over a list literal. Equality against `null`. Timestamp and duration conversions over a constant.

Those forms cover the common shapes:

```text
status == "active" && created_at >= timestamp("2024-01-01T00:00:00Z")
resource.public || resource.owner_id == "user-123"
name.startsWith("ali") && role in ["admin", "editor"]
```

### What needs an extending profile

The following limits belong to core ISO/IEC 9075, not to CEL. The baseline rejects these forms instead of approximating them:

| Form | Reason | Provided by |
| --- | --- | --- |
| `tags.exists(t, t == "x")` over an array column | core SQL has no array-valued column | PostgreSQL, MySQL, SQLite, MongoDB |
| `"x" in tags` where `tags` is a column | same | PostgreSQL, MySQL, SQLite, MongoDB |
| `name.matches("^a.*")` | no operator with RE2 syntax and semantics | PostgreSQL and MongoDB, over a portable subset |
| `has(field)` | SQL cannot distinguish an absent column from a null column | nothing; restructure the expression |

A workload that is mostly array membership or regular expressions needs an extending profile. That is the extension model working as intended, and it means the baseline alone is not sufficient for those workloads.

### PostgreSQL version 1

The PostgreSQL profile targets PostgreSQL 14 or later with UTF-8 server encoding. It accepts the complete ANSI SQL version 1 fragment and emits `$n` placeholders. `PostgreSqlConfiguration.start_position` lets an application compose a predicate after parameters that the application already owns.

The profile also accepts equality membership over one-dimensional PostgreSQL array columns, including the equivalent lowered `exists` form, and an ASCII subset shared by CEL RE2 syntax and PostgreSQL regular expressions. It rejects an unsupported regular-expression construct instead of approximating it.

### MySQL and SQLite version 1

MySQL and SQLite accept the ANSI SQL version 1 fragment and keep its typed positional parameter output. MySQL emits backtick-delimited identifiers, and `<=>` with its negation, for CEL total equality. SQLite emits double-quoted identifiers, and `IS` with `IS NOT`, for the same reason. Both accept a `list(string)` query field over declared JSON storage.

### MongoDB version 1

MongoDB emits a typed `MongoDbPredicate` envelope rather than a driver object, so query structure never travels as text:

```text
{ "$and": [ { "name": { "$eq": "alice" } }, { "age": { "$gt": 21 } } ] }
```

Its fragment covers non-null scalar comparisons, Boolean logic, literal string operations, literal membership over a BSON array, and a documented ASCII subset shared by CEL RE2 and MongoDB PCRE2. It rejects CEL null, optional and temporal values, comprehensions, and `has()`. Those forms need explicit target contracts rather than lossy BSON conventions.

## Translation libraries

A library has two halves. Its **CEL library** declares the overloads and types that an expression may use, and supplies the evaluation that gives them meaning. Its **translation library** adds the target binding for one profile. Every binding published under one library name carries the same CEL library, so one expression means the same thing on every target that binds it.

One object supplies both halves, which is the common case and the form the usage example above uses:

```ts
const caseInsensitive = caseInsensitiveStrings();

const cel = env({ libraries: [caseInsensitive] });
const translator = createTranslator(new PostgreSqlProfile(), {
  libraries: [caseInsensitive],
});
```

Select the CEL library alone when code compiles or evaluates CEL without translating it, such as an expression validator, an in-memory filter over records that an application already holds, or a differential test oracle. The root entry point exports one CEL library for each library name, and it references no dialect code:

```ts
import { env } from "@protoutil/cel";
import {
  caseInsensitiveStringsLibrary,
  fullTextSearchLibrary,
  geospatialLibrary,
  timestampRangesLibrary,
} from "@protoutil/celql";

const cel = env({
  libraries: [
    caseInsensitiveStringsLibrary(),
    fullTextSearchLibrary(),
    geospatialLibrary(),
    timestampRangesLibrary(),
  ],
});
```

The two forms are interchangeable in a CEL environment, because `caseInsensitiveStrings()` from a dialect subpath carries exactly the CEL library that `caseInsensitiveStringsLibrary()` returns. A translator requires the dialect binding.

Libraries compose without inheritance. Construction rejects a missing dependency, an incompatible profile binding, a conflicting major version, or a duplicate overload owner. The effective capability that `translator.capability()` returns includes the selected library references and their operations.

### Query fields that a library type declares

A library can define an opaque CEL type for a query field whose storage its target owns, such as a full-text index or a stored position. Declare the field with that type in the CEL environment, and select the target binding in the translator:

```ts
import { astToCheckedExpr, env, variable } from "@protoutil/cel";
import {
  createTranslator,
  FullTextIndexType,
  fullTextSearchLibrary,
  GeoPointType,
  geospatialLibrary,
} from "@protoutil/celql";
import { fullTextSearch, geospatial, MySqlProfile } from "@protoutil/celql/mysql";

const cel = env({
  variables: [variable("search", FullTextIndexType), variable("location", GeoPointType)],
  libraries: [fullTextSearchLibrary(), geospatialLibrary()],
});
const translator = createTranslator(new MySqlProfile(), {
  libraries: [fullTextSearch(), geospatial()],
});

const ast = cel.compile(
  'search.matchesText("error budget") && location.geoWithinDistance(geoPoint(-73.9, 40.7), 5000.0)',
);
const outcome = translator.translate({ checkedExpression: astToCheckedExpr(ast) });
```

That expression produces:

```text
(MATCH (`search`) AGAINST (? IN BOOLEAN MODE)
 AND ST_Distance_Sphere(`location`, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), 6378100) <= ?)

parameters: ["+error +budget", "POINT(-73.9 40.7)", 5000]
```

Change the dialect subpath to reach another database. A binding decides only how the expression reaches its target, so the CEL environment above compiles unchanged for every target that binds the same libraries.

Each library type carries a storage contract that its profile document states: the column type, the index, and the index configuration that the target requires for that field. A query field that an application maps outside its contract is outside the profile's supported input domain, and translation does not detect that.

### Published libraries

`caseInsensitiveStrings()` adds `startsWithIgnoreCase`, `endsWithIgnoreCase`, and `containsIgnoreCase` over ASCII strings. PostgreSQL and MySQL fold the field with `lower()` and bind an already folded pattern, SQLite uses its built-in ASCII `LIKE` folding, and MongoDB emits `$regex` with the `i` option. The library rejects a non-ASCII constant, because Unicode case folding is not portable. The case-sensitive operations continue to emit `LIKE`, so one translator can use both forms.

Every one of these operations runs correctly against an existing database with no schema change and no new index. An index only changes how fast the target answers them.

An index on the mapped column cannot answer a case-insensitive prefix, because it orders values by their unfolded bytes. On PostgreSQL, an expression index over the folded value lets `startsWithIgnoreCase` use an index, and it needs no extension:

```sql
CREATE INDEX ON records (lower(name) text_pattern_ops);
```

MySQL has no equivalent. It uses a functional index over `LOWER(name)` for equality but not for a `LIKE` prefix, so a case-insensitive prefix scans there.

`endsWithIgnoreCase` and `containsIgnoreCase` emit a leading wildcard, which no B-tree index answers on any target. Those two operations scan unless the caller adds a trigram or equivalent substring index.

`timestampRanges()` adds half-open timestamp ranges over a `TimestampRangeType` query field, with `range.contains(timestamp)` and `range.overlaps(timestampRange(start, end))`. Both operations need a range query field and constant timestamp bounds. PostgreSQL binds them to a `tstzrange` column.

`fullTextSearch()` adds `index.matchesText(query)` over a `FullTextIndexType` query field. A query holds lowercase ASCII alphanumeric terms separated by one space, and the operation selects a record whose indexed terms contain every query term. PostgreSQL emits `@@ plainto_tsquery('simple', $n)` over a `tsvector` column, MySQL emits `MATCH ... AGAINST (? IN BOOLEAN MODE)` over a `FULLTEXT`-indexed column, SQLite emits an FTS5 `MATCH` over a declared FTS5 table, and MongoDB emits `$text` over a collection with one text index. The library claims no stemming, ranking, phrase search, stop-word handling, or language configuration. SQLite and MongoDB evaluate their match only where a conjunction reaches it, so those two bindings reject a negated or disjunctive match rather than emit a query that the target refuses.

`geospatial()` adds `geoPoint(longitude, latitude)` and `geoPolygon(ring)` construction, and `point.geoWithin(polygon)`, `point.geoIntersects(polygon)`, and `point.geoWithinDistance(center, metres)` over a `GeoPointType` query field. Coordinates are WGS 84 degrees in longitude and latitude order. A ring MUST be closed, convex, and counterclockwise, and its edges are geodesics. Containment is closed, so a position on the ring is contained. A distance bound measures a great-circle distance on one sphere of radius 6378100 metres rather than on the WGS 84 ellipsoid, because a sphere is the only earth model that every binding computes identically. MySQL binds these operations to `ST_Intersects` and `ST_Distance_Sphere` over a `POINT SRID 4326` column, and MongoDB binds them to `$geoWithin`, `$geoIntersects`, and `$centerSphere` over a GeoJSON `Point`. PostgreSQL and SQLite have no spatial binding, because neither PostGIS nor SpatiaLite belongs to this package's tested runtime.

## Profile subclasses

Subclass a built-in profile when an application needs target-specific output behavior. Override the public profile methods and delegate the standard fragment to `super`:

```ts
import type { ProfileContext } from "@protoutil/celql";
import { createTranslator } from "@protoutil/celql";
import { MySqlProfile, type MySqlTranslation } from "@protoutil/celql/mysql";

class ParenthesizedMySqlProfile extends MySqlProfile {
  public override translate(
    context: ProfileContext,
    functions: ReadonlyMap<string, MySqlTranslation>,
  ) {
    const predicate = super.translate(context, functions);
    predicate.sql = `(${predicate.sql})`;
    return predicate;
  }
}

const translator = createTranslator(new ParenthesizedMySqlProfile());
```

A profile subclass changes target behavior. It does not declare CEL overloads. Use a translation library when the CEL environment and the translator need a new checked overload.

## Conformance

Conformance cases are language-independent data under `conformance/`. One case stores its CEL source once and attaches an independent expectation for each profile, so one file records the exact output or the explicit rejection of every dialect for one expression.

A profile is complete when it passes the core conformance suite, passes its own profile suite covering every declared capability and rejection boundary, and agrees with a CEL evaluator under differential execution against the real target.

Run the complete suite with Docker available:

```sh
pnpm test
```

The conformance entry point starts the Compose services, waits for readiness, and removes them after the suite. Each database case compares the record identifiers that the emitted predicate selects with the record identifiers that CEL evaluation selects, against PostgreSQL 14, MySQL 8.4, MongoDB 8.0, and in-memory SQLite. Set `CELQL_POSTGRES_IMAGE`, `CELQL_MYSQL_IMAGE`, or `CELQL_MONGODB_IMAGE` before the command to test another image.

## Documents

- `SPEC.md` — the normative translation, security, limit, error, versioning, and conformance contract.
- `profiles/ANSI_SQL_V1.md` — the baseline dialect that every implementation provides.
- `profiles/POSTGRESQL_V1.md`, `profiles/MYSQL_V1.md`, `profiles/SQLITE_V1.md`, and `profiles/MONGODB_V1.md` — the target-specific version 1 contracts, including the storage contract of every library type.
- `proto/protoutil/celql/v1/celql.proto` — the profile reference, resource limits, error model, transport envelope, and machine-readable capability declaration.
- `proto/protoutil/celql/ansisql/v1/ansisql.proto` — the baseline profile's output type.
- `proto/protoutil/celql/postgresql/v1/postgresql.proto` — the PostgreSQL profile's configuration and output types.
- `proto/protoutil/celql/mongodb/v1/mongodb.proto` — the MongoDB profile's typed predicate output.
- `conformance/` — the core and profile conformance suites.
- `TEST_STRATEGY.md` — the layers that a dialect passes to be production-ready.

## License

MIT

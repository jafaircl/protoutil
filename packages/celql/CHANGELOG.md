# @protoutil/celql

## 0.3.2

### Minor Changes

- Add the celql specification, public translator API, core conformance suite, ANSI SQL version 1 profile, and PostgreSQL version 1 profile.
- Bind `createTranslator` to a constructed, subclassable profile and composable CEL translation libraries.
- Export ANSI SQL and PostgreSQL through isolated package subpaths.
- Add the `caseInsensitiveStrings()` library for ASCII case-insensitive string operations, with a binding for every dialect.
- Add shared-input, per-profile conformance expectations and execute every successful PostgreSQL source expectation against PostgreSQL 14.
- Add the `protoutil.celql.full_text_search` library, which binds `index.matchesText(query)` to PostgreSQL `tsvector`, MySQL `MATCH ... AGAINST`, SQLite FTS5, and MongoDB `$text` storage.
- Add the `protoutil.celql.geospatial` library, which binds validated position and polygon construction, closed polygon containment, intersection, and a great-circle distance bound to MySQL SRID 4326 geometry and MongoDB GeoJSON storage.
- Emit plain SQL equality for a query field compared with a non-null constant outside a negation, which keeps an ordinary index usable, and keep distinctness comparison everywhere the two forms select different records.
- Lead a MySQL distance bound with the bounding rectangle of that bound, which a SPATIAL index answers, and omit the rectangle where the bound crosses the antimeridian or reaches a pole.
- Fold a PostgreSQL and MySQL case-insensitive comparison with `lower()` on both sides, which lets a core PostgreSQL expression index answer `startsWithIgnoreCase` without the `pg_trgm` extension and makes the MySQL result independent of the mapped column collation.
- Publish `parameterValues`, `postgreSqlParameters`, and `mongoDbFilter` so a caller can bind a predicate to a database client without reading protobuf values by hand.
- Publish `CelLibrary` so a caller can select a library's target-independent CEL declarations and evaluation without a profile binding.

# AIPQL

Translate [AIP-160](https://aip.dev/160) filter expressions into SQL or MongoDB queries. Supports PostgreSQL, MySQL, SQLite, and MongoDB out of the box.

## Install

```bash
npm install @protoutil/aipql @protoutil/aip
```

## Usage

Filter strings are first parsed and type-checked by `@protoutil/aip/filtering`, then translated into a dialect-specific query. The filter expression must evaluate to a boolean — all dialect functions throw a `TranslationError` if the checked expression has a non-boolean output type.

```typescript
import { parse, check, ident, STRING, INT64 } from "@protoutil/aip/filtering";
import { postgres } from "@protoutil/aipql";

const parsed = parse('title = "hello" AND rating > 3');
const { checkedExpr } = check(parsed, {
  decls: [ident("title", STRING), ident("rating", INT64)],
});
const { sql, params } = postgres(checkedExpr);

// sql:    '"title" = $1 AND "rating" > $2'
// params: ["hello", 3]
```

If your resource type is defined as a protobuf message, use `contextDecls()` to generate declarations automatically:

```typescript
import { parse, check, contextDecls } from "@protoutil/aip/filtering";
import { postgres } from "@protoutil/aipql";
import { BookSchema } from "./gen/library_pb.js";

const parsed = parse('title = "hello" AND rating > 3');
const { checkedExpr } = check(parsed, { decls: contextDecls(BookSchema) });
const { sql, params } = postgres(checkedExpr);
```

Expressions that don't evaluate to a boolean are rejected:

```typescript
import { parse, check, ident, STRING } from "@protoutil/aip/filtering";
import { postgres } from "@protoutil/aipql";

const parsed = parse("name");
const { checkedExpr } = check(parsed, { decls: [ident("name", STRING)] });
postgres(checkedExpr); // throws TranslationError: filter expression must evaluate to a boolean
```

### PostgreSQL

```typescript
import { postgres } from "@protoutil/aipql";

const { sql, params } = postgres(checked);
// Parameterized with $1, $2, ...
// ILIKE by default for case-insensitive string matching (has operator, startsWith, etc.)
```

Pass `{ caseInsensitive: false }` to use `LIKE` instead of `ILIKE`:

```typescript
const { sql, params } = postgres(checked, { caseInsensitive: false });
```

### MySQL

```typescript
import { mysql } from "@protoutil/aipql";

const { sql, params } = mysql(checked);
// Parameterized with ? placeholders
// Case sensitivity controlled by column/table collation
```

### SQLite

```typescript
import { sqlite } from "@protoutil/aipql";

const { sql, params } = sqlite(checked);
// Parameterized with ? placeholders
// Case sensitivity controlled at the connection level
```

SQLite has no built-in regex operator. To use `matches()`, register a custom handler:

```typescript
const { sql, params } = sqlite(checked, {
  functions: {
    matches(target, args, ctx) {
      ctx.write(`regexp(${ctx.pushParam(constStringValue(args[0], "matches"))}, ${ctx.emitIdent(target!)})`);
    },
  },
});
```

Note that you will need to register a `regexp` function in your SQLite database and provide a matching function declaration to the checker via `check(parsed, { decls: [yourDecl] })`.

### MongoDB

```typescript
import { mongo } from "@protoutil/aipql";

const { filter } = mongo(checked);
// Returns a MongoDB filter document, e.g.:
// { $and: [{ title: "hello" }, { rating: { $gt: 3 } }] }
```

## Supported Features

### Operators

| AIP-160 | SQL | MongoDB |
|---------|-----|---------|
| `=` | `= $1` | `{ field: value }` |
| `!=` | `<> $1` | `{ field: { $ne: value } }` |
| `<` | `< $1` | `{ field: { $lt: value } }` |
| `<=` | `<= $1` | `{ field: { $lte: value } }` |
| `>` | `> $1` | `{ field: { $gt: value } }` |
| `>=` | `>= $1` | `{ field: { $gte: value } }` |
| `AND` | `AND` | `{ $and: [...] }` |
| `OR` | `OR` | `{ $or: [...] }` |
| `NOT` / `-` | `NOT (...)` | `{ $nor: [...] }` |
| `:` (has) | `LIKE / ILIKE` | `{ $regex }` |

### Wildcards

Wildcards in string `=`, `!=`, and `:` comparisons are translated to pattern matching:

```
title = "hello*"     →  "title" LIKE 'hello%'   (SQL)
title = "*world"     →  "title" LIKE '%world'    (SQL)
title = "hello*"     →  { title: /^hello/ }      (MongoDB)
```

### Durations & Timestamps

Duration and timestamp literals are first-class values:

```
age > 20s            →  params: [BigInt(20000000000)]    (nanoseconds)
created > 2024-01-01T00:00:00Z  →  params: [Date(...)]  (Date object)
```

Quoted RFC-3339 strings in comparisons are also auto-detected as timestamps:

```
created > "2024-01-01T00:00:00Z"  →  params: [Date(...)]
```

### String Functions

The built-in string functions from CEL are supported:

| Function | SQL (Postgres) | SQL (MySQL) | MongoDB |
|----------|---------------|-------------|---------|
| `startsWith` | `ILIKE 'val%'` | `LIKE 'val%'` | `{ $regex: /^val/i }` |
| `endsWith` | `ILIKE '%val'` | `LIKE '%val'` | `{ $regex: /val$/i }` |
| `contains` | `ILIKE '%val%'` | `LIKE '%val%'` | `{ $regex: /val/i }` |
| `matches` | `~ 'pattern'` | `REGEXP 'pattern'` | `{ $regex: /pattern/ }` |

### `ago()` Function

The `ago()` function creates time-relative filters, translating to server-side time arithmetic.

Pass the `agoDecl` declaration to the checker:

```typescript
import { parse, check } from "@protoutil/aip/filtering";
import { postgres, agoDecl } from "@protoutil/aipql";

const parsed = parse('create_time > ago(24h)');
const { checkedExpr } = check(parsed, { decls: [agoDecl] });
const { sql, params } = postgres(checkedExpr);
// sql:    '"create_time" > NOW() - INTERVAL $1'
// params: ["86400000000 microseconds"]
```

| Dialect | Output | Precision |
|---------|--------|-----------|
| PostgreSQL | `NOW() - INTERVAL $1` | microseconds |
| MySQL | `NOW(6) - INTERVAL ? MICROSECOND` | microseconds |
| SQLite | `datetime('now', ?)` | seconds |
| MongoDB | `new Date(...)` (computed at translation time) | milliseconds |

### Nested Fields

Dotted field paths are supported:

```
address.city = "NYC"
→  SQL:   "address"."city" = $1
→  Mongo: { "address.city": "NYC" }
```

### Operator Precedence

AIP-160 specifies that OR binds tighter than AND (the opposite of SQL). This library correctly parenthesizes the output:

```
a = 1 OR b = 2 AND c = 3
→  ("a" = $1 OR "b" = $2) AND "c" = $3
```

## Custom Function Handlers

Override or extend the built-in function handlers by passing a `functions` map. Handlers are matched by overload ID first, then by function name.

```typescript
const { sql, params } = postgres(checked, {
  functions: {
    // Override by overload ID
    string_contains(target, args, ctx) {
      ctx.write(`${ctx.emitIdent(target!)} @@ to_tsquery(${ctx.pushParam(constStringValue(args[0], "contains"))})`);
    },
  },
});
```

MongoDB handlers return a filter object:

```typescript
const { filter } = mongo(checked, {
  functions: {
    string_contains(target, args, ctx) {
      return { [ctx.fieldPath(target!)]: { $text: { $search: "..." } } };
    },
  },
});
```

## API Reference

### SQL Dialects

Each SQL dialect function takes a `CheckedExpr` and optional config, returning `{ sql: string; params: unknown[] }`. All dialect functions validate that the expression evaluates to a boolean and throw `TranslationError` if it does not.

- **`postgres(expr, opts?)`** — `$1`, `$2` placeholders. Supports `caseInsensitive` (default `true`).
- **`mysql(expr, opts?)`** — `?` placeholders. Case sensitivity via collation.
- **`sqlite(expr, opts?)`** — `?` placeholders. No built-in `matches` support.

### MongoDB

**`mongo(expr, opts?)`** — Returns `{ filter: MongoFilter }`. Supports `caseInsensitive` (default `true`).

### Shared Utilities

- **`agoDecl`** — Checker declaration for the `ago()` function. Pass via `check(parsed, { decls: [agoDecl] })`.
- **`TranslationError`** — Error class thrown by all dialects on translation failure.

### Standard Library Function Handlers

Each dialect exports its default function handler map, allowing you to compose custom handlers on top of the defaults:

```typescript
import { postgres, stdlibPostgres } from "@protoutil/aipql";

const { sql, params } = postgres(checked, {
  functions: {
    ...stdlibPostgres,
    // Override a specific handler
    string_contains(target, args, ctx) {
      ctx.write(`${ctx.emitIdent(target!)} @@ plainto_tsquery(${ctx.pushParam(args[0])})`);
    },
  },
});
```

| Export | Description |
|--------|-------------|
| `stdlibPostgres` | Default SQL function handlers for PostgreSQL |
| `stdlibMysql` | Default SQL function handlers for MySQL |
| `stdlibSqlite` | Default SQL function handlers for SQLite |
| `stdlibMongo` | Default MongoDB function handlers |

### Exported Types

| Type | Description |
|------|-------------|
| `SqlOutput` | `{ sql: string; params: unknown[] }` — return type of SQL dialect functions |
| `MongoOutput` | `{ filter: MongoFilter }` — return type of the `mongo()` function |
| `MongoFilter` | `Record<string, unknown>` — a MongoDB filter document |
| `SqlEmitContext` | Context passed to SQL function handlers (`emit`, `emitIdent`, `pushParam`, `quoteIdent`, `write`, `like`) |
| `MongoEmitContext` | Context passed to MongoDB function handlers (`emit`, `fieldPath`, `caseInsensitive`) |
| `SqlFunctionHandler` | `(target, args, ctx: SqlEmitContext) => void` |
| `MongoFunctionHandler` | `(target, args, ctx: MongoEmitContext) => MongoFilter` |
| `PostgresOptions` | Options for `postgres()` — `caseInsensitive?`, `functions?` |
| `MysqlOptions` | Options for `mysql()` — `functions?` |
| `SqliteOptions` | Options for `sqlite()` — `functions?` |
| `MongoOptions` | Options for `mongo()` — `caseInsensitive?`, `functions?` |

## Tips

### NULL columns in SQL WHERE clauses

In SQL, any comparison against a `NULL` column evaluates to `NULL` (not `false`), which means the row is silently excluded from results. This affects both equality and inequality:

```
status = "active"   →  rows where status is NULL are excluded
status != "active"  →  rows where status is NULL are also excluded
```

If you need to include `NULL` rows in inequality checks, combine with an explicit null test:

```
status != "active" OR status = null
→  "status" <> $1 OR "status" IS NULL
```

Use the has operator (`field:*`) to check for field presence, which translates to `IS NOT NULL`:

```
status:*  →  "status" IS NOT NULL
```

### Missing/null fields in MongoDB

MongoDB handles missing and null fields differently from SQL. Notably, `$ne` **includes** documents where the field is missing or null, while SQL's `<>` excludes them:

| Filter | SQL behavior (NULL rows) | MongoDB behavior (missing/null docs) |
|--------|--------------------------|--------------------------------------|
| `status = "active"` | excluded | excluded |
| `status != "active"` | excluded | **included** |

This means the same AIP-160 filter can return different results across dialects when fields are nullable or missing. Use `field:*` to explicitly check for field presence:

```
status:*  →  SQL: "status" IS NOT NULL
          →  Mongo: { status: { $exists: true } }
```

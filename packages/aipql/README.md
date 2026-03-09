# AIPQL

Translate [AIP-160](https://aip.dev/160) filter expressions into SQL or MongoDB queries. Supports PostgreSQL, MySQL, SQLite, and MongoDB out of the box.

## Install

```bash
npm install @protoutil/aipql @protoutil/aip
```

## Usage

Filter strings are first parsed and type-checked by `@protoutil/aip`, then translated into a dialect-specific query.

```typescript
import { parse, check } from "@protoutil/aip/filtering";
import { postgres } from "@protoutil/aipql";

const parsed = parse('title = "hello" AND rating > 3');
const { checkedExpr } = check(parsed);
const { sql, params } = postgres(checkedExpr);

// sql:    '"title" = $1 AND "rating" > $2'
// params: ["hello", 3]
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

Note that you will need to provide a function declaration to the checker 

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

Each SQL dialect function takes a `CheckedExpr` and optional config, returning `{ sql: string; params: unknown[] }`.

- **`postgres(expr, opts?)`** — `$1`, `$2` placeholders. Supports `caseInsensitive` (default `true`).
- **`mysql(expr, opts?)`** — `?` placeholders. Case sensitivity via collation.
- **`sqlite(expr, opts?)`** — `?` placeholders. No built-in `matches` support.

### MongoDB

**`mongo(expr, opts?)`** — Returns `{ filter: MongoFilter }`. Supports `caseInsensitive` (default `true`).

### Errors

All translation errors throw `TranslationError`.

---
title: "@protoutil/repo"
description: Database-agnostic protobuf resource persistence using AIP patterns
---

Database-agnostic protobuf resource persistence using [AIP](https://aip.dev) patterns. Define your resources as protobuf messages and persist them to any supported database without changing application code.

## Benchmarking

Generated benchmark results are available in the [benchmark report](/packages/repo/benchmarks/).

## Install

```bash
npm install @protoutil/repo @protoutil/aip @protoutil/core
```

Then install the driver for your database:

```bash
# SQLite
npm install better-sqlite3

# Postgres
npm install pg

# MySQL
npm install mysql2

# MongoDB
npm install mongodb
```

## Quick Start

```typescript
import Database from "better-sqlite3";
import { createSQLiteEngine } from "@protoutil/repo/sqlite";
import { createRepository } from "@protoutil/repo";
import { UserSchema } from "./gen/user_pb.js";

// 1. Create an engine
const engine = createSQLiteEngine({ client: new Database("app.db") });

// 2. Create a repository
const users = createRepository(UserSchema, { engine, tableName: "users" });

// 3. Create a resource
const user = await users.create({ uid: "abc-123", email: "alice@example.com" });

// 4. Query resources
const fetched = await users.get({ uid: "abc-123" });
const byEmail = await users.get('email = "alice@example.com"');
```

## Engines

An engine wraps a database client and provides a uniform interface for executing queries, managing transactions, and performing CRUD operations. Each supported database has its own engine factory exported from a dedicated entry point.

### SQLite

```typescript
import Database from "better-sqlite3";
import { createSQLiteEngine } from "@protoutil/repo/sqlite";

const engine = createSQLiteEngine({
  client: new Database("app.db"),
});
```

See the [SQLite engine documentation](/packages/repo/sqlite/) for details.

### Postgres

```typescript
import { Pool } from "pg";
import { createPostgresEngine } from "@protoutil/repo/postgres";

const engine = createPostgresEngine({
  client: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});
```

### MySQL

```typescript
import mysql from "mysql2/promise";
import { createMySQLEngine } from "@protoutil/repo/mysql";

const engine = createMySQLEngine({
  client: mysql.createPool({
    host: "localhost",
    user: "root",
    database: "app",
  }),
});
```

### MongoDB

```typescript
import { MongoClient } from "mongodb";
import { createMongoDBEngine } from "@protoutil/repo/mongodb";

const client = new MongoClient("mongodb://localhost:27017");
await client.connect();

const engine = createMongoDBEngine({
  client,
  database: "app",
});
```

### Custom Dialect

Each engine has a default dialect for translating AIP-160 filter expressions into database-specific queries. You can override this to inject custom function handlers:

```typescript
import { sqlite } from "@protoutil/aipql";

const engine = createSQLiteEngine({
  client: db,
  dialect: (expr) => sqlite(expr, {
    functions: { string_matches: myMatchHandler },
  }),
});
```

## Engine Interface

All engines implement the shared `Engine` interface exported from `@protoutil/repo`:

```typescript
import type { Engine } from "@protoutil/repo";
```

| Method | Description |
|--------|-------------|
| `findOne<T>(opts)` | Find a single row matching the filter. Returns `undefined` if no match. |
| `findMany<T>(opts)` | Find all rows matching the filter, with optional limit, offset, and orderBy. |
| `insertOne<T>(opts)` | Insert a row and return the inserted record. |
| `updateOne<T>(opts)` | Update a row matching the filter and return the updated record. |
| `deleteOne(opts)` | Delete a row matching the filter. Returns `true` if a row was deleted. |
| `count(opts)` | Count rows matching an optional filter. |
| `execute<T>(query, params?)` | Execute a raw query. SQL engines accept a string query with bind parameters. MongoDB accepts a command object. |
| `transaction<T>(fn)` | Execute a function within a transaction. Nested calls create savepoints when the backend supports them. |
| `close()` | Close the underlying database connection. |

## Repository

A repository is a thin, database-agnostic data-access layer for a single protobuf message type. It handles serialization, filtering, field masking, and deserialization so callers work with strongly-typed messages.

```typescript
import { createRepository } from "@protoutil/repo";

const users = createRepository(UserSchema, {
  engine,
  tableName: "users",
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `engine` | `Engine` | The database engine to use. **Required.** |
| `tableName` | `string` | Override the table name. Defaults to the proto type name in snake_case. |
| `columns` | `Record<string, ColumnConfig>` | Per-field column configuration. See [Column Configuration](#column-configuration). |
| `filterDecls` | `Decl[]` | Additional AIP-160 filter declarations. |
| `interceptors` | `Interceptor[]` | Middleware chain for all operations. See [Interceptors](#interceptors). |
| `etag` | `object` | Etag configuration: `{ field?, mask?, fn? }`. See [Etag Configuration](#etag-configuration). |
| `pagination` | `object` | Pagination defaults: `{ defaultSize?, maxSize? }`. |
| `fieldMasks` | `object` | Default field masks: `{ read?, update? }`. |

### `get(query, options?)`

Retrieve a single resource. Throws `NotFoundError` if no match is found.

```typescript
// By partial resource (equality filter)
const user = await users.get({ uid: "abc-123" });

// By AIP-160 filter string
const user = await users.get('email = "alice@example.com"');

// With a read mask
import { fieldMask } from "@protoutil/core/wkt";

const user = await users.get({ uid: "abc-123" }, {
  readMask: fieldMask(UserSchema, ["uid", "email"]),
});

// Within a transaction
await engine.transaction(async (tx) => {
  const user = await users.get({ uid: "abc-123" }, { transaction: tx });
});
```

### `create(resource, options?)`

Create a new resource. Accepts a `MessageInitShape` — only set the fields you need. Required fields (per AIP-203) are validated before insertion. An etag is computed and persisted if the schema has an etag field.

```typescript
const user = await users.create({
  uid: "abc-123",
  email: "alice@example.com",
  displayName: "Alice",
});

// Validate without persisting (AIP-163)
const preview = await users.create(
  { uid: "abc-123", email: "alice@example.com" },
  { validateOnly: true },
);

// With a read mask
const user = await users.create(
  { uid: "abc-123", email: "alice@example.com" },
  { readMask: fieldMask(UserSchema, ["uid", "email"]) },
);
```

### `list(query?, options?)`

List resources with optional filtering, pagination, and ordering. Returns a `ListResult` containing the page of results and a `nextPageToken`.

```typescript
// List all users
const { results, nextPageToken } = await users.list();

// With an AIP-160 filter
const { results } = await users.list('age > 21 AND active = true');

// With pagination
const page1 = await users.list(undefined, { pageSize: 10 });
const page2 = await users.list(undefined, { pageSize: 10, pageToken: token });

// With ordering (AIP-132)
const { results } = await users.list(undefined, { orderBy: "age desc, display_name" });

// With total count
const { results, totalSize } = await users.list(undefined, {
  pageSize: 10,
  showTotalSize: true,
});
```

### `update(query, resource, options?)`

Update an existing resource. The resource is fetched, merged with the update according to the update mask, and persisted. Immutable fields (AIP-203) are validated and an etag is recomputed.

```typescript
const user = await users.update(
  { uid: "abc-123" },
  { displayName: "New Name", email: "alice@example.com" },
);

// With an update mask (only update specific fields)
const user = await users.update(
  { uid: "abc-123" },
  { displayName: "New Name", age: 30, email: "alice@example.com" },
  { updateMask: fieldMask(UserSchema, ["display_name"]) },
);
```

### `delete(query, options?)`

Delete a resource matching the query. Throws `NotFoundError` if no match is found.

```typescript
await users.delete({ uid: "abc-123" });
await users.delete('email = "alice@example.com"');
```

### `count(query?, options?)`

Count resources matching an optional query.

```typescript
const total = await users.count();
const activeCount = await users.count('active = true');
```

### Column Configuration

The `columns` option provides per-field control over how proto fields map to database columns. Keys are generated message field names like `displayName` and `createTime`, not proto snake_case names.

```typescript
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";

const users = createRepository(UserSchema, {
  engine,
  tableName: "users",
  columns: {
    uid: { name: "user_id" },
    displayName: { name: "name" },
    computedScore: { ignore: true },
    settings: {
      serialize: ({ field, value }) =>
        value == null || !field.message
          ? null
          : toJsonString(field.message, value),
      deserialize: ({ field, value }) =>
        value == null || !field.message
          ? undefined
          : fromJsonString(field.message, value),
    },
  },
});
```

#### `ColumnConfig` fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Override the DB column name. Defaults to the field's JSON name (camelCase). |
| `ignore` | `boolean` | Exclude this field from DB serialization. On reads, the field gets its proto3 default. |
| `serialize` | `(ctx) => DB` | Transform a field value before it is written. The context includes the strongly typed `field`, `operation` (`"create"` or `"update"`), and field `value`. |
| `deserialize` | `(ctx) => FieldValue` | Transform a database value before it is assigned to the protobuf field. The context includes the strongly typed `field`, `operation` (`"get"` or `"list"`), and serialized `value`. |

Use column hooks for storage concerns such as encryption, compression, or packing nested messages into a single column. Use interceptors for lifecycle concerns such as timestamps, defaults, or request-derived values.

### Etag Configuration

```typescript
const users = createRepository(UserSchema, {
  engine,
  etag: {
    field: "etag",
    fn: (schema, msg) => customHash(schema, msg),
  },
});
```

If you want mask-like behavior, apply it inside `fn`:

```typescript
import { etag as defaultEtag } from "@protoutil/aip/etag";
import { fieldMask } from "@protoutil/core/wkt";

const users = createRepository(UserSchema, {
  engine,
  etag: {
    fn: (schema, msg) =>
      defaultEtag(schema, msg, {
        fieldMask: fieldMask(UserSchema, ["uid", "email"]),
      }),
  },
});
```

### Interceptors

Interceptors provide a middleware chain around every repository operation.

```typescript
import type { Interceptor } from "@protoutil/repo";

const logger: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  const start = performance.now();
  try {
    const result = await next(ctx);
    console.log(`${ctx.operation} on ${ctx.tableName}: ${performance.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`${ctx.operation} on ${ctx.tableName} failed:`, err);
    throw err;
  }
};

const users = createRepository(UserSchema, {
  engine,
  interceptors: [logger],
});
```

### Context Values

Repository operations create a fresh `ContextValues` bag for each call. Interceptors can set values on it, and downstream interceptors plus column hooks can read them.

```typescript
import {
  createContextKey,
  withReentryGuard,
  type Interceptor,
} from "@protoutil/repo";

const kActorId = createContextKey<string | undefined>(undefined, {
  description: "current actor id",
});

const actorContext: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  if (ctx.operation === "create" || ctx.operation === "update") {
    ctx.contextValues.set(kActorId, "user-123");
  }
  return next(ctx);
};

const users = createRepository(UserSchema, {
  engine,
  interceptors: [actorContext],
  columns: {
    secret: {
      serialize: ({ value, contextValues }) =>
        typeof value !== "string"
          ? value
          : `${contextValues.get(kActorId) ?? "anonymous"}:${value}`,
    },
  },
});
```

Use `withReentryGuard()` when an interceptor needs to make a nested repository call without re-entering the same side effect:

```typescript
const kAuditGuard = createContextKey(false, { description: "audit guard" });

const audit: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  if (ctx.operation !== "create") {
    return next(ctx);
  }

  const result = await next(ctx);

  await withReentryGuard(ctx.contextValues, kAuditGuard, async () => {
    await users.update(
      { uid: result.uid },
      { displayName: `${result.displayName} normalized` },
      { contextValues: ctx.contextValues },
    );
  });

  return result;
};
```

Each repository call gets a fresh context bag by default. Pass
`contextValues: ctx.contextValues` when a nested call should share the
same guard state.

### Recommended Patterns

- Use `columns` for storage concerns only: renaming columns, ignoring fields, encrypting values, or storing a nested message as JSON/binary in one column.
- Use interceptors for lifecycle concerns: timestamps, defaults, audit fields, tenant scoping, and other request-derived values.
- Prefer protobuf-aware codecs such as `toJsonString` / `fromJsonString` or `toBinary` / `fromBinary` over plain JSON helpers.
- Return `null` from `serialize` when you want to clear a nullable database column, and return `undefined` from `deserialize` when you want the protobuf field to stay unset.
- Keep column hooks field-local. If the behavior depends on multiple fields or business rules, it usually belongs in an interceptor instead.
- Keep etag logic deterministic. If you need to exclude fields, do it inside `etag.fn` rather than making writes conditional in column hooks.

## Serialization

The `serializeMessage` and `deserializeRow` helpers convert between protobuf messages and plain database row objects.

```typescript
import { serializeMessage, deserializeRow } from "@protoutil/repo";

const row = serializeMessage(UserSchema, user, columnMap);
const message = deserializeRow(UserSchema, row, columnMap);
```

## Filter Pipeline

The `buildFilter` function converts a filter string or partial resource object into a type-checked `CheckedExpr`.

```typescript
import { buildFilter } from "@protoutil/repo";

const expr = buildFilter(UserSchema, 'age > 21 AND active = true');
const expr = buildFilter(UserSchema, { uid: "abc-123" });
```

# Repo

Database-agnostic protobuf resource persistence using [AIP](https://aip.dev) patterns. Define your resources as protobuf messages and persist them to any supported database without changing application code.

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

See the [SQLite engine documentation](src/sqlite/README.md) for details.

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

See the [Postgres engine documentation](src/postgres/README.md) for details.

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

See the [MySQL engine documentation](src/mysql/README.md) for details.

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

See the [MongoDB engine documentation](src/mongodb/README.md) for details.

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

## Errors

Repo exposes package-level typed errors with stable `code` values for debugging and branching.

```ts
import {
  RepoErrorCode,
  UnexpectedInterceptorContextError,
  UnsupportedQueryTypeRepoError,
} from "@protoutil/repo";
```

| Error class | `code` | When raised |
| --- | --- | --- |
| `UnexpectedInterceptorContextError` | `RepoErrorCode.UNEXPECTED_INTERCEPTOR_CONTEXT` | `expectOperation()` receives a different interceptor operation than expected. |
| `UnsupportedQueryTypeRepoError` | `RepoErrorCode.UNSUPPORTED_QUERY_TYPE` | Engine `execute()` gets a query type the backend does not support (for example SQL engines require string queries; Mongo requires object queries). |

Note: repository CRUD/domain errors still primarily use AIP status errors from `@protoutil/aip/errors` (for example `NotFoundError`, `AlreadyExistsError`, `InvalidArgumentError`).

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
| `columns` | `ColumnConfigMap<Desc>` | Per-field column configuration. See [Column Configuration](#column-configuration). |
| `filterDecls` | `Decl[]` | Additional AIP-160 filter declarations. |
| `interceptors` | `Interceptor[]` | Middleware chain for all operations. See [Interceptors](#interceptors). |
| `etag` | `object` | Etag configuration: `{ field?, fn? }`. See [Etag Configuration](#etag-configuration). |
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

// Within a transaction
await engine.transaction(async (tx) => {
  const user = await users.create(
    { uid: "abc-123", email: "alice@example.com" },
    { transaction: tx },
  );
});
```

### `list(query?, options?)`

List resources with optional filtering, pagination, and ordering. Returns a `ListResult` containing the page of results and a `nextPageToken`.

```typescript
// List all users
const { results, nextPageToken } = await users.list();

// With an AIP-160 filter
const { results } = await users.list('age > 21 AND active = true');

// With pagination
import { parse } from "@protoutil/aip/pagination";
import { decode } from "@protoutil/aip/pagination";

const page1 = await users.list(undefined, { pageSize: 10 });

// Decode the token from the previous response for the next page
const token = decode(page1.nextPageToken);
const page2 = await users.list(undefined, { pageSize: 10, pageToken: token });

// With ordering (AIP-132)
const { results } = await users.list(undefined, { orderBy: "age desc, display_name" });

// With total count
const { results, totalSize } = await users.list(undefined, {
  pageSize: 10,
  showTotalSize: true,
});

// With a read mask
const { results } = await users.list(undefined, {
  readMask: fieldMask(UserSchema, ["uid", "email"]),
});
```

### `count(query?, options?)`

Count resources matching an optional query.

```typescript
// Count all users
const total = await users.count();

// Count with a filter
const activeCount = await users.count('active = true');

// Count with a partial object
const matchCount = await users.count({ email: "alice@example.com" });

// Within a transaction
await engine.transaction(async (tx) => {
  const n = await users.count(undefined, { transaction: tx });
});
```

### `update(query, resource, options?)`

Update an existing resource. The resource is fetched, merged with the update according to the update mask, and persisted. Immutable fields (AIP-203) are validated and an etag is recomputed.

```typescript
// Update by partial object query
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

// Validate without persisting (AIP-163)
const preview = await users.update(
  { uid: "abc-123" },
  { displayName: "Preview", email: "alice@example.com" },
  { validateOnly: true },
);

// Within a transaction
await engine.transaction(async (tx) => {
  const user = await users.update(
    { uid: "abc-123" },
    { displayName: "Tx Update", email: "alice@example.com" },
    { transaction: tx },
  );
});
```

### `delete(query, options?)`

Delete a resource matching the query. Throws `NotFoundError` if no match is found.

```typescript
// Delete by partial object
await users.delete({ uid: "abc-123" });

// Delete by filter string
await users.delete('email = "alice@example.com"');

// Within a transaction
await engine.transaction(async (tx) => {
  await users.delete({ uid: "abc-123" }, { transaction: tx });
});
```

### Column Configuration

The `columns` option provides per-field control over how proto fields map to database columns. Keys are generated message field names like `displayName` and `createTime`, not proto snake_case names.

```typescript
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";

const users = createRepository(UserSchema, {
  engine,
  tableName: "users",
  columns: {
    // Rename: proto field "uid" → DB column "user_id"
    uid: { name: "user_id" },
    displayName: { name: "name" },

    // Ignore: field exists in proto but not in DB
    computedScore: { ignore: true },

    // Store a nested message in a single JSON column
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
    field: "etag",         // proto field name (default: "etag")
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

Interceptors provide a middleware chain around every repository operation. Each interceptor receives a `next` function and returns a new function that can run logic before and/or after the core operation.

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

const otel: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  return tracer.startActiveSpan(`repo.${ctx.operation}`, async (span) => {
    span.setAttribute("table", ctx.tableName);
    try {
      return await next(ctx);
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
};

const users = createRepository(UserSchema, {
  engine,
  interceptors: [logger, otel],  // first = outermost
});
```

`InterceptorContext` is a discriminated union keyed on `operation`. All variants share `schema` and `tableName`. Narrowing on `operation` gives typed access to the call arguments:

| Operation | Fields |
|-----------|--------|
| `get` | `query`, `options?` |
| `create` | `resource`, `options?` |
| `list` | `query?`, `options?` |
| `update` | `query`, `resource`, `options?` |
| `delete` | `query`, `options?` |
| `count` | `query?`, `options?` |
| `batchGet` | `queries`, `options?` |
| `batchCreate` | `resources`, `options?` |
| `batchUpdate` | `updates`, `options?` |
| `batchDelete` | `queries`, `options?` |

```typescript
// Narrowing example — access operation-specific fields
const auditor: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  if (ctx.operation === "create") {
    console.log("Creating resource:", ctx.resource);
  } else if (ctx.operation === "update") {
    console.log("Updating with query:", ctx.query);
  }
  return next(ctx);
};
```

Interceptors can also rewrite operation inputs, which makes them a good fit for timestamps and defaults:

```typescript
import { timestampNow } from "@bufbuild/protobuf/wkt";

const timestamps: Interceptor<typeof UserSchema> = (next) => async (ctx) => {
  if (ctx.operation === "create") {
    const now = timestampNow();
    ctx.resource = { ...ctx.resource, createTime: now, updateTime: now };
  } else if (ctx.operation === "update") {
    ctx.resource = { ...ctx.resource, updateTime: timestampNow() };
  }
  return next(ctx);
};
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

The `serializeMessage` and `deserializeRow` helpers convert between protobuf messages and plain database row objects. They use `@bufbuild/protobuf`'s `toJson`/`fromJson` for standard fields (bigints as strings, Timestamps as RFC 3339, etc.) and support column name remapping plus `ColumnConfig` hooks for custom storage transforms.

```typescript
import { fromJsonString, toJsonString } from "@bufbuild/protobuf";
import { serializeMessage, deserializeRow } from "@protoutil/repo";

// Basic usage with column name mapping
const row = serializeMessage(UserSchema, user, columnMap);
const message = deserializeRow(UserSchema, row, columnMap);

// With ColumnConfig for ignore/custom serialization support
const columns = {
  settings: {
    serialize: ({ field, value }) =>
      value == null || !field.message ? null : toJsonString(field.message, value),
    deserialize: ({ field, value }) =>
      value == null || !field.message
        ? undefined
        : fromJsonString(field.message, value),
  },
  computed: { ignore: true },
};
const row = serializeMessage(UserSchema, user, columnMap, columns, "create");
const message = deserializeRow(UserSchema, row, columnMap, columns, "get");
```

## Filter Pipeline

The `buildFilter` function converts a filter string or partial resource object into a type-checked `CheckedExpr` that engines use to generate queries.

```typescript
import { buildFilter } from "@protoutil/repo";

// From a string
const expr = buildFilter(UserSchema, 'age > 21 AND active = true');

// From a partial resource
const expr = buildFilter(UserSchema, { uid: "abc-123" });

// With column remapping
const expr = buildFilter(UserSchema, 'uid = "abc"', {
  columnMap: { uid: "user_id" },
});
```

## API Reference

| Export | Description |
|--------|-------------|
| `createRepository(schema, opts)` | Create a repository for a protobuf message type. |
| `buildFilter(schema, query, opts?)` | Build a checked filter expression from a string or partial resource. |
| `buildBatchFilter(schema, queries, opts?)` | Build a checked filter from multiple queries combined with OR. |
| `partialToFilter(schema, partial)` | Convert a partial resource to an AIP-160 filter string. |
| `serializeMessage(schema, msg, columnMap?, columns?, operation?)` | Serialize a message to a database row object. |
| `deserializeRow(schema, row, columnMap?, columns?, operation?)` | Deserialize a database row to a message. |
| `Engine` | Database engine interface. |
| `Repository` | Repository interface. |
| `RepositoryOptions` | Repository configuration (grouped: `columns`, `etag`, `pagination`, `fieldMasks`, `interceptors`). |
| `ColumnConfig` | Per-field column configuration (`name`, `ignore`, `serialize`, `deserialize`). |
| `ColumnConfigMap` | Strongly typed map of column configs keyed by generated field names. |
| `ColumnSerializeContext` | Context passed to `ColumnConfig.serialize` (`field`, `operation`, `value`). |
| `ColumnDeserializeContext` | Context passed to `ColumnConfig.deserialize` (`field`, `operation`, `value`). |
| `ColumnKey` | Union of generated field names for a schema. |
| `ColumnFieldValue` | Runtime field value type for a schema key. |
| `ColumnSerializeOperation` | Write operation passed to `serialize` hooks (`"create"` or `"update"`). |
| `ColumnDeserializeOperation` | Read operation passed to `deserialize` hooks (`"get"` or `"list"`). |
| `Interceptor` | Middleware interceptor type: `(next) => (ctx) => Promise<unknown>`. |
| `InterceptorContext` | Discriminated union context passed to interceptors, keyed on `operation`. |
| `InterceptorFn` | Inner function type wrapped by interceptors. |
| `GetOptions` | Options for `get` calls (`readMask`, `transaction`). |
| `CreateOptions` | Options for `create` calls (`readMask`, `validateOnly`, `transaction`). |
| `ListOptions` | Options for `list` calls (`pageSize`, `pageToken`, `orderBy`, `showTotalSize`, `readMask`, `transaction`). |
| `ListResult` | Result of `list` calls (`results`, `nextPageToken`, `totalSize?`). |
| `UpdateOptions` | Options for `update` calls (`updateMask`, `readMask`, `validateOnly`, `transaction`). |
| `DeleteOptions` | Options for `delete` calls (`validateOnly`, `transaction`). |
| `CountOptions` | Options for `count` calls (`transaction`). |
| `BatchGetOptions` | Options for `batchGet` calls (`readMask`, `transaction`). |
| `BatchCreateOptions` | Options for `batchCreate` calls (`readMask`, `validateOnly`, `transaction`). |
| `BatchUpdateOptions` | Options for `batchUpdate` calls (`readMask`, `validateOnly`, `transaction`). |
| `BatchDeleteOptions` | Options for `batchDelete` calls (`validateOnly`, `transaction`). |
| `BatchUpdateItem` | Per-item input for `batchUpdate` (`query`, `resource`, `updateMask?`). |
| `QueryInput` | Filter string or partial resource type. |
| `Dialect` | Filter expression translator type. |

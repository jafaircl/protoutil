# SQLite Engine

An {@link Engine} implementation backed by [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).

## Install

```bash
npm install @protoutil/repo better-sqlite3
```

## Usage

```typescript
import Database from "better-sqlite3";
import { createSQLiteEngine } from "@protoutil/repo/sqlite";

const engine = createSQLiteEngine({
  client: new Database("app.db"),
});
```

### Custom Dialect

Override the default dialect to inject custom AIP-160 function handlers:

```typescript
import { sqlite } from "@protoutil/aipql";

const engine = createSQLiteEngine({
  client: db,
  dialect: (expr) => sqlite(expr, {
    functions: { string_matches: myMatchHandler },
  }),
});
```

### CRUD Operations

The engine provides higher-level methods that accept checked AIP-160 filter expressions:

```typescript
import { check, contextDecls, parse } from "@protoutil/aip/filtering";
import { parse as parseOrderBy } from "@protoutil/aip/orderby";

// Build a checked filter expression
const parsed = parse('active = true AND age > 21');
const { checkedExpr } = check(parsed, { decls: contextDecls(UserSchema) });

// Find
const user = await engine.findOne({ table: "users", filter: checkedExpr });

const users = await engine.findMany({
  table: "users",
  filter: checkedExpr,
  orderBy: parseOrderBy("age desc"),
  limit: 10,
  offset: 0,
});

// Insert
const created = await engine.insertOne({
  table: "users",
  row: { uid: "u1", email: "alice@example.com", active: 1 },
});

// Update
const updated = await engine.updateOne({
  table: "users",
  filter: checkedExpr,
  row: { active: 0 },
});

// Delete
const deleted = await engine.deleteOne({ table: "users", filter: checkedExpr });

// Count
const total = await engine.count({ table: "users" });
const active = await engine.count({ table: "users", filter: checkedExpr });
```

### Raw Queries

The `execute` method accepts a SQL string and optional bind parameters. Read statements (`SELECT`, `WITH`, `PRAGMA`, `EXPLAIN`) return rows. Write statements return an empty array unless a `RETURNING` clause is included.

```typescript
// Read
const users = await engine.execute<{ id: number; name: string }>(
  "SELECT * FROM users WHERE active = ?",
  [1],
);

// Write with RETURNING
const [created] = await engine.execute<{ id: number; name: string }>(
  "INSERT INTO users (name, active) VALUES (?, ?) RETURNING *",
  ["alice", 1],
);
```

### Transactions

The `transaction` method executes a callback within a transaction. The transaction is committed when the callback resolves and rolled back if it throws. The callback receives a transactional engine that shares the same connection context.

```typescript
await engine.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name) VALUES (?)", ["alice"]);
  await tx.execute("INSERT INTO users (name) VALUES (?)", ["bob"]);
});
```

Nested `transaction` calls within the callback create savepoints. A failed inner transaction only rolls back to its savepoint, leaving the outer transaction intact.

```typescript
await engine.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name) VALUES (?)", ["alice"]);

  try {
    await tx.transaction(async (inner) => {
      await inner.execute("INSERT INTO users (name) VALUES (?)", ["bob"]);
      throw new Error("rollback bob only");
    });
  } catch {
    // bob is rolled back, alice remains
  }

  await tx.execute("INSERT INTO users (name) VALUES (?)", ["charlie"]);
});
// committed: alice, charlie
```

### Error Handling

Database errors are automatically wrapped in AIP status errors:

| SQLite Error | AIP Error |
|-------------|-----------|
| UNIQUE constraint violation | `AlreadyExistsError` |
| NOT NULL / CHECK constraint violation | `InvalidArgumentError` |
| FOREIGN KEY constraint violation | `FailedPreconditionError` |
| Other errors | `InternalError` |

The original database error message is preserved in the error's `debugInfo.detail`.

### Boolean Coercion

SQLite lacks a native boolean type. The engine automatically converts boolean values to integers (0/1) when binding parameters, so you can pass `true`/`false` in row data without manual conversion.

### Closing

Call `close` when the engine is no longer needed. The underlying `better-sqlite3` database is closed and the engine must not be used afterwards.

```typescript
await engine.close();
```

## API Reference

| Export | Description |
|--------|-------------|
| `createSQLiteEngine(config)` | Create an engine from a `better-sqlite3` Database instance. |
| `SQLiteEngineConfig` | Configuration interface: `{ client: Database, dialect?: Dialect }`. |

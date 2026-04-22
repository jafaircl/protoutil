# MySQL Engine

An {@link Engine} implementation backed by [`mysql2`](https://github.com/sidorares/node-mysql2) using its promise API.

## Install

```bash
npm install @protoutil/repo mysql2
```

## Usage

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

### Custom Dialect

Override the default dialect to inject custom AIP-160 function handlers:

```typescript
import { mysql } from "@protoutil/aipql";

const engine = createMySQLEngine({
  client: pool,
  dialect: (expr) => mysql(expr, {
    functions: { string_matches: myMatchHandler },
  }),
});
```

### CRUD Operations

The engine provides higher-level methods that accept checked AIP-160 filter expressions:

```typescript
import { check, contextDecls, parse } from "@protoutil/aip/filtering";
import { parse as parseOrderBy } from "@protoutil/aip/orderby";

const parsed = parse('active = true AND age > 21');
const { checkedExpr } = check(parsed, { decls: contextDecls(UserSchema) });

const user = await engine.findOne({ table: "users", filter: checkedExpr });

const users = await engine.findMany({
  table: "users",
  filter: checkedExpr,
  orderBy: parseOrderBy("age desc"),
  limit: 10,
  offset: 0,
});

const created = await engine.insertOne({
  table: "users",
  row: { uid: "u1", email: "alice@example.com", active: true },
});

const updated = await engine.updateOne({
  table: "users",
  filter: checkedExpr,
  row: { active: false },
});

const deleted = await engine.deleteOne({ table: "users", filter: checkedExpr });

const total = await engine.count({ table: "users" });
const active = await engine.count({ table: "users", filter: checkedExpr });
```

### Raw Queries

The `execute` method accepts a SQL string and optional bind parameters. MySQL uses `?` placeholders. Because MySQL does not support `RETURNING`, write operations performed by the higher-level engine methods fetch rows back with follow-up queries when needed.

```typescript
const users = await engine.execute<{ id: number; name: string }>(
  "SELECT * FROM users WHERE active = ?",
  [true],
);

await engine.execute(
  "INSERT INTO users (name, active) VALUES (?, ?)",
  ["alice", true],
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
```

### Error Handling

Database errors are automatically wrapped in AIP status errors:

| MySQL Error | AIP Error |
|-------------|-----------|
| `1062` (`ER_DUP_ENTRY`) | `AlreadyExistsError` |
| `1048` (`ER_BAD_NULL_ERROR`) | `InvalidArgumentError` |
| `1364` | `InvalidArgumentError` |
| `3819` (`ER_CHECK_CONSTRAINT_VIOLATED`) | `InvalidArgumentError` |
| `1452` (`ER_NO_REFERENCED_ROW_2`) | `FailedPreconditionError` |
| Other errors | `InternalError` |

The original database error message is preserved in the error's `debugInfo.detail`.

### Closing

Call `close` when the engine is no longer needed. The underlying `mysql2` pool is closed and the engine must not be used afterwards.

```typescript
await engine.close();
```

## API Reference

| Export | Description |
|--------|-------------|
| `createMySQLEngine(config)` | Create an engine from a `mysql2/promise` Pool instance. |
| `MySQLEngineConfig` | Configuration interface: `{ client: Pool, dialect?: Dialect }`. |

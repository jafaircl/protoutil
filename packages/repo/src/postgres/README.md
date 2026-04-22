# Postgres Engine

An {@link Engine} implementation backed by [`pg`](https://node-postgres.com/).

## Install

```bash
npm install @protoutil/repo pg
```

## Usage

```typescript
import { Pool } from "pg";
import { createPostgresEngine } from "@protoutil/repo/postgres";

const engine = createPostgresEngine({
  client: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
});
```

### Custom Dialect

Override the default dialect to inject custom AIP-160 function handlers:

```typescript
import { postgres } from "@protoutil/aipql";

const engine = createPostgresEngine({
  client: pool,
  dialect: (expr) => postgres(expr, {
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

The `execute` method accepts a SQL string and optional bind parameters. PostgreSQL uses `$1`, `$2`, and so on for placeholders, and write statements can return rows with `RETURNING`.

```typescript
const users = await engine.execute<{ id: number; name: string }>(
  "SELECT * FROM users WHERE active = $1",
  [true],
);

const [created] = await engine.execute<{ id: number; name: string }>(
  "INSERT INTO users (name, active) VALUES ($1, $2) RETURNING *",
  ["alice", true],
);
```

### Transactions

The `transaction` method executes a callback within a transaction. The transaction is committed when the callback resolves and rolled back if it throws. The callback receives a transactional engine that shares the same connection context.

```typescript
await engine.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name) VALUES ($1)", ["alice"]);
  await tx.execute("INSERT INTO users (name) VALUES ($1)", ["bob"]);
});
```

Nested `transaction` calls within the callback create savepoints. A failed inner transaction only rolls back to its savepoint, leaving the outer transaction intact.

```typescript
await engine.transaction(async (tx) => {
  await tx.execute("INSERT INTO users (name) VALUES ($1)", ["alice"]);

  try {
    await tx.transaction(async (inner) => {
      await inner.execute("INSERT INTO users (name) VALUES ($1)", ["bob"]);
      throw new Error("rollback bob only");
    });
  } catch {
    // bob is rolled back, alice remains
  }

  await tx.execute("INSERT INTO users (name) VALUES ($1)", ["charlie"]);
});
```

### Error Handling

Database errors are automatically wrapped in AIP status errors:

| PostgreSQL Error | AIP Error |
|------------------|-----------|
| `23505` (`unique_violation`) | `AlreadyExistsError` |
| `23502` (`not_null_violation`) | `InvalidArgumentError` |
| `23514` (`check_violation`) | `InvalidArgumentError` |
| `23503` (`foreign_key_violation`) | `FailedPreconditionError` |
| Other errors | `InternalError` |

The original database error message is preserved in the error's `debugInfo.detail`.

### Closing

Call `close` when the engine is no longer needed. The underlying `pg` pool is closed and the engine must not be used afterwards.

```typescript
await engine.close();
```

## API Reference

| Export | Description |
|--------|-------------|
| `createPostgresEngine(config)` | Create an engine from a `pg` Pool instance. |
| `PostgresEngineConfig` | Configuration interface: `{ client: Pool, dialect?: Dialect }`. |

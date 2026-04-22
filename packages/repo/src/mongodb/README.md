# MongoDB Engine

An {@link Engine} implementation backed by [`mongodb`](https://www.npmjs.com/package/mongodb).

## Install

```bash
npm install @protoutil/repo mongodb
```

## Usage

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

Override the default dialect to inject custom AIP-160 function handlers:

```typescript
import { mongo } from "@protoutil/aipql";

const engine = createMongoDBEngine({
  client,
  database: "app",
  dialect: (expr) => mongo(expr, {
    functions: { fuzzy: myHandler },
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
  row: { _id: "u1", email: "alice@example.com", active: true },
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

### Raw Commands

The `execute` method accepts a MongoDB command object and returns normalized result documents. String queries are not supported by the MongoDB engine.

```typescript
const stats = await engine.execute<{ ok: number }>({
  ping: 1,
});
```

### Transactions

The `transaction` method executes a callback within a MongoDB session transaction. The transaction is committed when the callback resolves and rolled back if it throws.

```typescript
await engine.transaction(async (tx) => {
  await tx.insertOne({
    table: "users",
    row: { _id: "u1", name: "alice" },
  });

  await tx.insertOne({
    table: "users",
    row: { _id: "u2", name: "bob" },
  });
});
```

Nested transactions are not supported. Calling `transaction` from inside an active MongoDB transaction throws `FailedPreconditionError`.

### Error Handling

Database errors are automatically wrapped in AIP status errors:

| MongoDB Error | AIP Error |
|---------------|-----------|
| `11000` | `AlreadyExistsError` |
| `121` | `InvalidArgumentError` |
| `2` / `"BadValue"` | `InvalidArgumentError` |
| `66` | `FailedPreconditionError` |
| Other errors | `InternalError` |

The original database error message is preserved in the error's `debugInfo.detail`.

### Closing

Call `close` when the engine is no longer needed. The underlying `MongoClient` is closed and the engine must not be used afterwards.

```typescript
await engine.close();
```

## API Reference

| Export | Description |
|--------|-------------|
| `createMongoDBEngine(config)` | Create an engine from a `MongoClient` and database name. |
| `MongoDBEngineConfig` | Configuration interface: `{ client: MongoClient, database: string, dialect?: Dialect }`. |

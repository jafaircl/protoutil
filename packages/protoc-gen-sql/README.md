# protoc-gen-sql

A protoc plugin that generates SQL schema and CRUD query files from annotated protobuf definitions. Define your entities once in proto, generate schema for multiple database engines from a single source of truth.

## Installation

```bash
npm install -g @protoutil/protoc-gen-sql
```

Add the options proto as a dependency in your `buf.yaml`:

```yaml
deps:
  - buf.build/protoutil/sql
```

## Quick start

**1. Annotate your proto messages**

```proto
syntax = "proto3";
package myapp.v1;
import "protoutil/sql/v1/options.proto";

message User {
  option (protoutil.sql.v1.message) = {
    generate: true
    indexes: ["email"]
  };

  string name  = 1 [(protoutil.sql.v1.field).omit = true]; // derived at app layer
  string email = 2 [(protoutil.sql.v1.field).unique = true];
  string bio   = 3 [(protoutil.sql.v1.field).nullable = true];
  bool   active = 4;
}
```

**2. Configure `buf.gen.yaml`**

```yaml
version: v2
inputs:
  - directory: proto
plugins:
  - local: protoc-gen-sql
    out: generated/postgres
    opt:
      - engine=postgres
  - local: protoc-gen-sql
    out: generated/sqlite
    opt:
      - engine=sqlite
```

**3. Generate**

```bash
buf generate
```

This produces:

```
generated/
├── postgres/
│   ├── schema.sql
│   └── queries/generated/
│       └── myapp_v1_users.sql
└── sqlite/
    ├── schema.sql
    └── queries/generated/
        └── myapp_v1_users.sql
```

---

## Plugin options

Passed via the `opt:` key in `buf.gen.yaml`. Each invocation targets one engine.

| Option | Required | Values | Default | Description |
|---|---|---|---|---|
| `engine` | ✅ | `postgres` `mysql` `sqlite` `sqlserver` | — | Target database engine |
| `repeated_strategy` | | `json_column` `array_column` | `json_column` | How `repeated` fields are stored. `array_column` requires Postgres; falls back to `json_column` on other engines |
| `oneof_strategy` | | `nullable_columns` `type_column` `json_column` | `nullable_columns` | Default strategy for `oneof` groups. Can be overridden per-oneof via `OneofOptions` |
| `if_not_exists` | | `true` `false` | `true` | Emit `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Set to `false` only if your migration tooling manages existence checks itself |
| `emit_create_schema` | | `true` `false` | `false` | Emit `CREATE SCHEMA IF NOT EXISTS` at the top of `schema.sql`. Only meaningful for `postgres` and `sqlserver` |

---

## Proto options reference

### MessageOptions `(protoutil.sql.v1.message)`

Controls table-level generation for a message. Only messages with `generate = true` produce any output — all others are silently ignored.

| Field | Type | Default | Description |
|---|---|---|---|
| `generate` | `bool` | `false` | **Opt this message into generation.** Must be `true` to produce any output |
| `table_name` | `string` | FQN snake_case | Override the generated table name. Default: `library.v1.Book` → `library_v1_book` |
| `indexes` | `repeated string` | `[]` | Composite indexes as comma-separated column names. e.g. `["author,title"]` |
| `unique_constraints` | `repeated string` | `[]` | Composite unique constraints as comma-separated column names |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress specific generated queries. See `QueryType` enum |
| `foreign_keys` | `repeated ForeignKey` | `[]` | Explicit FK column declarations. See `ForeignKey` message |
| `timestamps` | `TimestampBehavior` | `BOTH` | Controls `created_at` / `updated_at` injection. See `TimestampBehavior` enum |
| `extra_columns` | `repeated FieldOptions` | `[]` | Additional columns with no proto field. See extra columns section |
| `primary_key` | `PrimaryKeyType` | `PRIMARY_KEY_TYPE_SERIAL` | Storage type for the `id` primary key column. See `PrimaryKeyType` enum |

### FieldOptions `(protoutil.sql.v1.field)`

Controls column-level generation for a proto field. Also used as the element type for `extra_columns`.

| Field | Type | Default | Description |
|---|---|---|---|
| `column_name` | `string` | field name | Override the column name. **Required** in `extra_columns` |
| `column_type` | `string` | engine default | Override the SQL type for all engines. Acts as a fallback when `type_overrides` has no entry for the target engine. **Required** in `extra_columns` unless `type_overrides` covers every engine you generate for |
| `type_overrides` | `map<string, string>` | `{}` | Per-engine type overrides. Keys must be valid engine names: `postgres` `mysql` `sqlite` `sqlserver`. Takes precedence over `column_type`. Validation: [V15] rejects unrecognised keys. See [type_overrides usage](#type_overrides-usage) |
| `nullable` | `bool` | `false` | Emit `NULL` instead of `NOT NULL` |
| `default` | `string` | — | SQL `DEFAULT` expression, written verbatim. e.g. `"now()"`, `"''"`, `"0"` |
| `index` | `bool` | `false` | Add a single-column index. For composite indexes use `MessageOptions.indexes` |
| `unique` | `bool` | `false` | Add a `UNIQUE` constraint |
| `omit` | `bool` | `false` | Exclude this field entirely. **Must not be `true`** in `extra_columns` |
| `enum_strategy` | `EnumStrategy` | `ENUM_STRATEGY_NAME` | How to store a proto enum field. Only meaningful on enum-typed fields |
| `check` | `string` | — | Inline `CHECK` constraint, written verbatim. e.g. `"price_cents > 0"` |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress this column from specific generated queries. Applies to both proto-derived fields and `extra_columns`. e.g. `(protoutil.sql.v1.field).skip_queries = QUERY_TYPE_GET, (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_LIST` to exclude a sensitive field from reads, or `(protoutil.sql.v1.field).skip_queries = QUERY_TYPE_CREATE, (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_UPDATE` to exclude a DB-managed column from writes. See [skip_queries usage](#skip_queries-usage) |

### OneofOptions `(sql.oneof)`

Applied to the `oneof` declaration itself, not individual fields within it.

| Field | Type | Default | Description |
|---|---|---|---|
| `strategy` | `OneofStrategy` | plugin opt | Override the global `oneof_strategy` for this group |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress this oneof's columns from specific generated queries. Same values and semantics as `FieldOptions.skip_queries`. See [skip_queries usage](#skip_queries-usage) |

### ForeignKey

Declares an explicit FK column on the table. Foreign keys are never inferred.

| Field | Type | Default | Description |
|---|---|---|---|
| `column` | `string` | — | **Required.** Column name on this table. e.g. `"shelf_id"` |
| `references_table` | `string` | — | **Required.** Table being referenced. e.g. `"library_v1_shelf"` |
| `references_column` | `string` | `"id"` | Column on the referenced table |
| `on_delete` | `ForeignKeyAction` | engine default | `CASCADE` `RESTRICT` `SET_NULL` `NO_ACTION` |
| `on_update` | `ForeignKeyAction` | engine default | `CASCADE` `RESTRICT` `SET_NULL` `NO_ACTION` |
| `skip_index` | `bool` | `false` | Set to `true` to suppress the automatic index on the FK column. Useful when the FK column is already covered by a composite index declared in `MessageOptions.indexes` — generating a redundant single-column index wastes space and slows writes |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress this FK column from specific generated queries. e.g. `skip_queries: [QUERY_TYPE_UPDATE]` to make the relationship immutable after creation, or `skip_queries: [QUERY_TYPE_GET, QUERY_TYPE_LIST]` to hide an internal column from reads. See [skip_queries usage](#skip_queries-usage) |

---

## Enums

### `QueryType`

Used in `MessageOptions.skip_queries`, `FieldOptions.skip_queries`, `OneofOptions.skip_queries`, and `ForeignKey.skip_queries`.

| Value | Generated query |
|---|---|
| `QUERY_TYPE_GET` | `SELECT col1, col2, ... WHERE id = $1 LIMIT 1` |
| `QUERY_TYPE_LIST` | `SELECT col1, col2, ... ORDER BY id` |
| `QUERY_TYPE_CREATE` | `INSERT INTO ...` |
| `QUERY_TYPE_UPDATE` | `UPDATE ... SET ... WHERE id = $1` |
| `QUERY_TYPE_DELETE` | `DELETE ... WHERE id = $1` |
| `QUERY_TYPE_ALL` | Suppresses all query generation for this message; schema DDL is still produced |

### `TimestampBehavior`

Used in `MessageOptions.timestamps`.

| Value | `created_at` | `updated_at` |
|---|---|---|
| `TIMESTAMP_BEHAVIOR_UNSPECIFIED` / `TIMESTAMP_BEHAVIOR_BOTH` | ✅ injected | ✅ injected |
| `TIMESTAMP_BEHAVIOR_CREATED_ONLY` | ✅ injected | ❌ omitted |
| `TIMESTAMP_BEHAVIOR_UPDATED_ONLY` | ❌ omitted | ✅ injected |
| `TIMESTAMP_BEHAVIOR_NONE` | ❌ omitted | ❌ omitted |

### `OneofStrategy`

| Value | Behavior |
|---|---|
| `ONEOF_STRATEGY_NULLABLE_COLS` | One nullable column per variant + `CHECK` constraint ensuring at most one is non-null |
| `ONEOF_STRATEGY_TYPE_COLUMN` | Discriminator column (`{name}_type TEXT`) + single value column (`{name}_value TEXT`) |
| `ONEOF_STRATEGY_JSON_COLUMN` | Entire oneof serialized to a single `JSONB` / `JSON` / `TEXT` column |

---

### `EnumStrategy`

| Value | Behavior |
|---|---|
| `ENUM_STRATEGY_NAME` (default) | Store the enum value name as `TEXT` |
| `ENUM_STRATEGY_INT` | Store the integer value as `INTEGER` |
| `ENUM_STRATEGY_CHECK_CONSTRAINT` | Store as `TEXT` with a `CHECK` constraint listing all valid value names. The column identifier in the `CHECK` expression is quoted using the engine's native quoting style (backticks on MySQL, double-quotes elsewhere) |
| `ENUM_STRATEGY_NATIVE_TYPE` | Use a native database enum type. Postgres only (`CREATE TYPE ... AS ENUM`); falls back to `ENUM_STRATEGY_NAME` on other engines |

### `PrimaryKeyType`

| Value | Behavior |
|---|---|
| `PRIMARY_KEY_TYPE_SERIAL` (default) | Engine serial integer: `BIGSERIAL` (postgres), `BIGINT UNSIGNED AUTO_INCREMENT` (mysql), `INTEGER` (sqlite), `BIGINT IDENTITY(1,1)` (sqlserver) |
| `PRIMARY_KEY_TYPE_UUID` | Database-generated UUID: `UUID DEFAULT gen_random_uuid()` (postgres), `CHAR(36) DEFAULT (UUID())` (mysql), `TEXT DEFAULT (lower(hex(randomblob(16))))` (sqlite), `UNIQUEIDENTIFIER DEFAULT NEWID()` (sqlserver). FK columns referencing a UUID table automatically use the matching UUID type |

---

## Extra columns

`extra_columns` injects columns that have no corresponding proto field — useful for columns managed entirely at the database layer.

```proto
message Order {
  option (protoutil.sql.v1.message) = {
    generate: true
    extra_columns: [
      {
        column_name: "deleted_at"
        column_type: "TIMESTAMPTZ"
        nullable: true
        index: true
      },
      {
        column_name: "row_version"
        column_type: "BIGINT"
        default: "1"
        skip_queries: [QUERY_TYPE_CREATE, QUERY_TYPE_UPDATE]  // managed by DB trigger
      }
    ]
  };
  string reference = 1;
}
```

Extra columns appear after proto-derived fields and before timestamp columns.

By default, extra columns are included in SELECT, INSERT, and UPDATE. Use `skip_queries` to exclude specific columns from specific query types — see [`skip_queries` usage](#skip_queries-usage) for examples.

---

## `type_overrides` usage

`type_overrides` lets you specify a different SQL type for each engine without changing the proto field type. Because the same proto is typically run through the plugin once per engine (via separate `buf.gen.yaml` plugin invocations), you can cover all engines without needing a `column_type` fallback:

```proto
// Cover every engine explicitly — no column_type needed
bool active = 1 [
  (protoutil.sql.v1.field).type_overrides = { key: "postgres"  value: "BOOLEAN"   },
  (protoutil.sql.v1.field).type_overrides = { key: "mysql"     value: "TINYINT(1)" },
  (protoutil.sql.v1.field).type_overrides = { key: "sqlite"    value: "INTEGER"    },
  (protoutil.sql.v1.field).type_overrides = { key: "sqlserver" value: "BIT"        }
];
```

Or use `column_type` as a universal fallback and only override where the default differs:

```proto
// column_type is the fallback; sqlite gets a specific override
bool active = 1 [(protoutil.sql.v1.field) = {
  column_type:    "BOOLEAN"
  type_overrides: { key: "sqlite" value: "INTEGER" }
}];
```

The same applies to `extra_columns`. [V06] will fire for any engine that has neither a matching `type_overrides` key nor a `column_type` fallback, so if you only provide a `sqlite` override and generate for `postgres` without `column_type`, you will get a validation error on the postgres run.

---

## `skip_index` usage

By default, every FK column gets an automatic single-column index. Set `skip_index: true` to suppress it — typically when the FK column is already the leading column (or an early column) in a composite index you have declared in `MessageOptions.indexes`, making the single-column index redundant:

```proto
message Book {
  option (protoutil.sql.v1.message) = {
    generate: true
    // Composite index already covers shelf_id — single-column index is redundant
    indexes: ["shelf_id,created_at"]
    foreign_keys: [{
      column:          "shelf_id"
      references_table: "library_v1_shelf"
      skip_index:      true
    }]
  };
  string title = 1;
}
```

---

## `skip_queries` usage

`skip_queries` suppresses a column from specific generated query types. It is available on `FieldOptions`, `OneofOptions`, and `ForeignKey`. Because `skip_queries` is a repeated field, each value must be specified as a separate option annotation.

**Exclude a sensitive field from reads (GET and LIST):**

```proto
message User {
  option (protoutil.sql.v1.message).generate = true;
  string email         = 1;
  string password_hash = 2 [
    (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_GET,
    (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_LIST
  ];
}
```

`password_hash` is included in INSERT and UPDATE but never appears in SELECT column lists.

**Exclude a DB-managed column from writes (CREATE and UPDATE):**

```proto
message Document {
  option (protoutil.sql.v1.message).generate = true;
  string body       = 1;
  string search_vec = 2 [
    (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_CREATE,
    (protoutil.sql.v1.field).skip_queries = QUERY_TYPE_UPDATE
  ];
}
```

`search_vec` appears in SELECT but is never written by generated queries — a trigger or generated column expression manages it.

**Make an FK relationship immutable after creation:**

```proto
message Book {
  option (protoutil.sql.v1.message) = {
    generate: true
    foreign_keys: [{
      column:           "shelf_id"
      references_table: "library_v1_shelf"
      skip_queries:     [QUERY_TYPE_UPDATE]
    }]
  };
  string title = 1;
}
```

`shelf_id` is written on INSERT but excluded from UPDATE SET.

**Suppress an entire oneof from all queries:**

```proto
message Book {
  option (protoutil.sql.v1.message).generate = true;
  string title = 1;
  oneof contact {
    option (protoutil.sql.v1.oneof).skip_queries = QUERY_TYPE_CREATE;
    option (protoutil.sql.v1.oneof).skip_queries = QUERY_TYPE_UPDATE;
    option (protoutil.sql.v1.oneof).skip_queries = QUERY_TYPE_GET;
    option (protoutil.sql.v1.oneof).skip_queries = QUERY_TYPE_LIST;
    string email = 2;
    string phone = 3;
  }
}
```

`QUERY_TYPE_DELETE` and `QUERY_TYPE_ALL` have no effect at the column level.

---

## Type mapping

Default proto scalar → SQL type per engine. Override per-field with `column_type` or `type_overrides`.

| Proto type | postgres | mysql | sqlite | sqlserver |
|---|---|---|---|---|
| `string` | `TEXT` | `TEXT` | `TEXT` | `NVARCHAR(MAX)` |
| `bool` | `BOOLEAN` | `TINYINT(1)` | `INTEGER` | `BIT` |
| `int32` | `INTEGER` | `INT` | `INTEGER` | `INT` |
| `int64` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `uint32` | `BIGINT` | `BIGINT UNSIGNED` | `INTEGER` | `BIGINT` |
| `uint64` | `NUMERIC(20,0)` | `BIGINT UNSIGNED` | `INTEGER` | `DECIMAL(20,0)` |
| `float` | `REAL` | `FLOAT` | `REAL` | `REAL` |
| `double` | `DOUBLE PRECISION` | `DOUBLE` | `REAL` | `FLOAT` |
| `bytes` | `BYTEA` | `BLOB` | `BLOB` | `VARBINARY(MAX)` |
| `sint32` | `INTEGER` | `INT` | `INTEGER` | `INT` |
| `sint64` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `fixed32` | `BIGINT` | `BIGINT UNSIGNED` | `INTEGER` | `BIGINT` |
| `fixed64` | `NUMERIC(20,0)` | `BIGINT UNSIGNED` | `INTEGER` | `DECIMAL(20,0)` |
| `sfixed32` | `INTEGER` | `INT` | `INTEGER` | `INT` |
| `sfixed64` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |

### Well-known types

| Proto type | postgres | mysql | sqlite | sqlserver |
|---|---|---|---|---|
| `google.protobuf.Timestamp` | `TIMESTAMPTZ` | `DATETIME(6)` | `TEXT` | `DATETIMEOFFSET` |
| `google.protobuf.Duration` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `google.protobuf.Struct` | `JSONB` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |
| `google.protobuf.Value` | `JSONB` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |
| `google.protobuf.ListValue` | `JSONB` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |
| `google.protobuf.StringValue` | `TEXT` | `TEXT` | `TEXT` | `NVARCHAR(MAX)` |
| `google.protobuf.BoolValue` | `BOOLEAN` | `TINYINT(1)` | `INTEGER` | `BIT` |
| `google.protobuf.Int32Value` | `INTEGER` | `INT` | `INTEGER` | `INT` |
| `google.protobuf.Int64Value` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `google.protobuf.FloatValue` | `REAL` | `FLOAT` | `REAL` | `REAL` |
| `google.protobuf.DoubleValue` | `DOUBLE PRECISION` | `DOUBLE` | `REAL` | `FLOAT` |
| `google.protobuf.BytesValue` | `BYTEA` | `BLOB` | `BLOB` | `VARBINARY(MAX)` |

### Injected columns

These columns are always added by the plugin and cannot be used as proto field names, FK columns, or extra column names unless the relevant injection is disabled.

| Column | Type (postgres) | Controlled by |
|---|---|---|
| `id` | engine-specific serial | Always present; cannot be disabled |
| `created_at` | `TIMESTAMPTZ` | `TimestampBehavior` |
| `updated_at` | `TIMESTAMPTZ` | `TimestampBehavior` |

---

## Generated queries

For each opted-in message the plugin generates a CRUD query file. The file header includes the target engine so the source of each file is unambiguous when you generate for multiple engines.

### Column inclusion in INSERT and UPDATE

The generated INSERT includes, in order:
1. FK columns (all, unless excluded via `skip_queries`)
2. Proto-derived fields (non-omitted, non-oneof)
3. Oneof columns (all strategies, unless excluded via `skip_queries` on the oneof)
4. Extra columns (unless excluded via `skip_queries`)

The generated UPDATE SET includes the same columns, except:
- FK columns with `skip_queries: [QUERY_TYPE_UPDATE]` are excluded
- Extra columns with `skip_queries: [QUERY_TYPE_UPDATE]` are excluded
- Oneof columns with `skip_queries: [QUERY_TYPE_UPDATE]` are excluded

---

## Validation rules

The plugin validates all annotations before generating any output and reports all errors together. Each error includes a rule code for easy reference.

| Rule | Description |
|---|---|
| **V01** | `foreign_key.column` must not be empty |
| **V02** | `foreign_key.references_table` must not be empty |
| **V03** | `foreign_key.column` must not be a reserved column (`id`, `created_at`, `updated_at`) unless the relevant injection is disabled via `timestamps` |
| **V04** | `foreign_key.column` must not duplicate another column in the table |
| **V05** | `extra_columns` entry must have a non-empty `column_name` |
| **V06** | `extra_columns` entry must have a non-empty `column_type`, or a `type_overrides` entry whose key matches the engine currently being generated for. Because the same proto is typically run through the plugin once per engine, an entry that only covers `sqlite` will pass when generating for sqlite but fail when generating for postgres — unless `column_type` is also set as a universal fallback |
| **V07** | `extra_columns` entry must not have `omit = true` |
| **V08** | `extra_columns` entry `column_name` must not be a reserved column |
| **V09** | `extra_columns` entry `column_name` must not duplicate another column |
| **V10** | Column names referenced in `MessageOptions.indexes` must exist in the table |
| **V11** | Column names referenced in `MessageOptions.unique_constraints` must exist in the table |
| **V12** | A proto field's `column_name` override must not be a reserved column |
| **V13** | A proto field's resolved column name must not duplicate another column |
| **V14** | `ENUM_STRATEGY_NATIVE_TYPE` requires `engine=postgres`. Error on all other engines |
| **V15** | `type_overrides` keys must be valid engine names (`postgres`, `mysql`, `sqlite`, `sqlserver`). Unrecognised keys (e.g. typos like `"postgress"` or wrong casing like `"Postgres"`) are rejected at validation time |

---

## Table naming convention

By default, table names are derived from the fully-qualified proto message name:

- Dots replaced with underscores
- Converted to `snake_case`

Examples:

| Proto message | Default table name |
|---|---|
| `library.v1.Book` | `library_v1_book` |
| `library.v1.Shelf` | `library_v1_shelf` |
| `myapp.v2.UserProfile` | `myapp_v2_user_profile` |

This ensures table names are versioned alongside the proto package and never silently collide when you introduce a `v2` of a package. Override with `table_name` if needed.

---
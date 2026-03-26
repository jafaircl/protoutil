---
title: "@protoutil/protoc-gen-sql"
description: Protoc plugin for generating SQL schema and CRUD queries from protobuf
---

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

## Plugin options

Passed via the `opt:` key in `buf.gen.yaml`. Each invocation targets one engine.

| Option | Required | Values | Default | Description |
|---|---|---|---|---|
| `engine` | Yes | `postgres` `mysql` `sqlite` `sqlserver` | — | Target database engine |
| `repeated_strategy` | | `json_column` `array_column` | `json_column` | How `repeated` fields are stored |
| `oneof_strategy` | | `nullable_columns` `type_column` `json_column` | `nullable_columns` | Default strategy for `oneof` groups |
| `if_not_exists` | | `true` `false` | `true` | Emit `IF NOT EXISTS` in DDL |
| `emit_create_schema` | | `true` `false` | `false` | Emit `CREATE SCHEMA IF NOT EXISTS` |

## Proto options reference

### MessageOptions `(protoutil.sql.v1.message)`

| Field | Type | Default | Description |
|---|---|---|---|
| `generate` | `bool` | `false` | Opt this message into generation |
| `table_name` | `string` | FQN snake_case | Override the generated table name |
| `indexes` | `repeated string` | `[]` | Composite indexes as comma-separated column names |
| `unique_constraints` | `repeated string` | `[]` | Composite unique constraints |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress specific generated queries |
| `foreign_keys` | `repeated ForeignKey` | `[]` | Explicit FK column declarations |
| `timestamps` | `TimestampBehavior` | `BOTH` | Controls `created_at` / `updated_at` injection |
| `extra_columns` | `repeated FieldOptions` | `[]` | Additional columns with no proto field |
| `primary_key` | `PrimaryKeyType` | `PRIMARY_KEY_TYPE_SERIAL` | Storage type for the `id` primary key column |

### FieldOptions `(protoutil.sql.v1.field)`

| Field | Type | Default | Description |
|---|---|---|---|
| `column_name` | `string` | field name | Override the column name |
| `column_type` | `string` | engine default | Override the SQL type |
| `type_overrides` | `map<string, string>` | `{}` | Per-engine type overrides |
| `nullable` | `bool` | `false` | Emit `NULL` instead of `NOT NULL` |
| `default` | `string` | — | SQL `DEFAULT` expression |
| `index` | `bool` | `false` | Add a single-column index |
| `unique` | `bool` | `false` | Add a `UNIQUE` constraint |
| `omit` | `bool` | `false` | Exclude this field entirely |
| `enum_strategy` | `EnumStrategy` | `ENUM_STRATEGY_NAME` | How to store a proto enum field |
| `check` | `string` | — | Inline `CHECK` constraint |
| `skip_queries` | `repeated QueryType` | `[]` | Suppress this column from specific queries |

## Type mapping

Default proto scalar to SQL type per engine:

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

### Well-known types

| Proto type | postgres | mysql | sqlite | sqlserver |
|---|---|---|---|---|
| `google.protobuf.Timestamp` | `TIMESTAMPTZ` | `DATETIME(6)` | `TEXT` | `DATETIMEOFFSET` |
| `google.protobuf.Duration` | `BIGINT` | `BIGINT` | `INTEGER` | `BIGINT` |
| `google.protobuf.Struct` | `JSONB` | `JSON` | `TEXT` | `NVARCHAR(MAX)` |

## Enums

### `QueryType`

| Value | Generated query |
|---|---|
| `QUERY_TYPE_GET` | `SELECT ... WHERE id = $1 LIMIT 1` |
| `QUERY_TYPE_LIST` | `SELECT ... ORDER BY id` |
| `QUERY_TYPE_CREATE` | `INSERT INTO ...` |
| `QUERY_TYPE_UPDATE` | `UPDATE ... SET ... WHERE id = $1` |
| `QUERY_TYPE_DELETE` | `DELETE ... WHERE id = $1` |
| `QUERY_TYPE_ALL` | Suppresses all query generation |

### `TimestampBehavior`

| Value | `created_at` | `updated_at` |
|---|---|---|
| `BOTH` | Injected | Injected |
| `CREATED_ONLY` | Injected | Omitted |
| `UPDATED_ONLY` | Omitted | Injected |
| `NONE` | Omitted | Omitted |

### `OneofStrategy`

| Value | Behavior |
|---|---|
| `NULLABLE_COLS` | One nullable column per variant + CHECK constraint |
| `TYPE_COLUMN` | Discriminator column + single value column |
| `JSON_COLUMN` | Entire oneof serialized to a single JSON column |

### `EnumStrategy`

| Value | Behavior |
|---|---|
| `ENUM_STRATEGY_NAME` | Store the enum value name as TEXT |
| `ENUM_STRATEGY_INT` | Store the integer value as INTEGER |
| `ENUM_STRATEGY_CHECK_CONSTRAINT` | Store as TEXT with CHECK constraint |
| `ENUM_STRATEGY_NATIVE_TYPE` | Use native database enum type (Postgres only) |

### `PrimaryKeyType`

| Value | Behavior |
|---|---|
| `PRIMARY_KEY_TYPE_SERIAL` | Engine serial integer |
| `PRIMARY_KEY_TYPE_UUID` | Database-generated UUID |

## Validation rules

| Rule | Description |
|---|---|
| **V01** | `foreign_key.column` must not be empty |
| **V02** | `foreign_key.references_table` must not be empty |
| **V03** | FK column must not be a reserved column |
| **V04** | FK column must not duplicate another column |
| **V05** | `extra_columns` entry must have a non-empty `column_name` |
| **V06** | `extra_columns` entry must have a non-empty `column_type` or matching `type_overrides` |
| **V07** | `extra_columns` entry must not have `omit = true` |
| **V08** | `extra_columns` `column_name` must not be a reserved column |
| **V09** | `extra_columns` `column_name` must not duplicate another column |
| **V10** | Indexed column names must exist in the table |
| **V11** | Unique constraint column names must exist in the table |
| **V12** | Field `column_name` override must not be a reserved column |
| **V13** | Field column name must not duplicate another column |
| **V14** | `ENUM_STRATEGY_NATIVE_TYPE` requires `engine=postgres` |
| **V15** | `type_overrides` keys must be valid engine names |

// Default proto scalar type -> SQL type mappings per engine.
// Users can override any of these via FieldOptions.column_type or type_overrides.

import type { Engine } from "./plugin-options.js";

export type ProtoScalarType =
  | "string"
  | "bool"
  | "bytes"
  | "double"
  | "float"
  | "int32"
  | "int64"
  | "uint32"
  | "uint64"
  | "sint32"
  | "sint64"
  | "fixed32"
  | "fixed64"
  | "sfixed32"
  | "sfixed64";

export type WellKnownType =
  | "google.protobuf.Timestamp"
  | "google.protobuf.Duration"
  | "google.protobuf.StringValue"
  | "google.protobuf.Int32Value"
  | "google.protobuf.Int64Value"
  | "google.protobuf.BoolValue"
  | "google.protobuf.FloatValue"
  | "google.protobuf.DoubleValue"
  | "google.protobuf.BytesValue"
  | "google.protobuf.Struct"
  | "google.protobuf.Value"
  | "google.protobuf.ListValue";

type TypeMap = Record<ProtoScalarType, string>;
type WellKnownTypeMap = Partial<Record<WellKnownType, string>>;

const POSTGRES: TypeMap = {
  string: "TEXT",
  bool: "BOOLEAN",
  bytes: "BYTEA",
  double: "DOUBLE PRECISION",
  float: "REAL",
  int32: "INTEGER",
  int64: "BIGINT",
  uint32: "BIGINT",
  uint64: "NUMERIC(20,0)",
  sint32: "INTEGER",
  sint64: "BIGINT",
  fixed32: "BIGINT",
  fixed64: "NUMERIC(20,0)",
  sfixed32: "INTEGER",
  sfixed64: "BIGINT",
};
const POSTGRES_WKT: WellKnownTypeMap = {
  "google.protobuf.Timestamp": "TIMESTAMPTZ",
  "google.protobuf.Duration": "BIGINT",
  "google.protobuf.StringValue": "TEXT",
  "google.protobuf.Int32Value": "INTEGER",
  "google.protobuf.Int64Value": "BIGINT",
  "google.protobuf.BoolValue": "BOOLEAN",
  "google.protobuf.FloatValue": "REAL",
  "google.protobuf.DoubleValue": "DOUBLE PRECISION",
  "google.protobuf.BytesValue": "BYTEA",
  "google.protobuf.Struct": "JSONB",
  "google.protobuf.Value": "JSONB",
  "google.protobuf.ListValue": "JSONB",
};

const MYSQL: TypeMap = {
  string: "TEXT",
  bool: "TINYINT(1)",
  bytes: "BLOB",
  double: "DOUBLE",
  float: "FLOAT",
  int32: "INT",
  int64: "BIGINT",
  uint32: "BIGINT UNSIGNED",
  uint64: "BIGINT UNSIGNED",
  sint32: "INT",
  sint64: "BIGINT",
  fixed32: "BIGINT UNSIGNED",
  fixed64: "BIGINT UNSIGNED",
  sfixed32: "INT",
  sfixed64: "BIGINT",
};
const MYSQL_WKT: WellKnownTypeMap = {
  "google.protobuf.Timestamp": "DATETIME(6)",
  "google.protobuf.Duration": "BIGINT",
  "google.protobuf.StringValue": "TEXT",
  "google.protobuf.Int32Value": "INT",
  "google.protobuf.Int64Value": "BIGINT",
  "google.protobuf.BoolValue": "TINYINT(1)",
  "google.protobuf.FloatValue": "FLOAT",
  "google.protobuf.DoubleValue": "DOUBLE",
  "google.protobuf.BytesValue": "BLOB",
  "google.protobuf.Struct": "JSON",
  "google.protobuf.Value": "JSON",
  "google.protobuf.ListValue": "JSON",
};

const SQLITE: TypeMap = {
  string: "TEXT",
  bool: "INTEGER",
  bytes: "BLOB",
  double: "REAL",
  float: "REAL",
  int32: "INTEGER",
  int64: "INTEGER",
  uint32: "INTEGER",
  uint64: "INTEGER",
  sint32: "INTEGER",
  sint64: "INTEGER",
  fixed32: "INTEGER",
  fixed64: "INTEGER",
  sfixed32: "INTEGER",
  sfixed64: "INTEGER",
};
const SQLITE_WKT: WellKnownTypeMap = {
  "google.protobuf.Timestamp": "TEXT",
  "google.protobuf.Duration": "INTEGER",
  "google.protobuf.StringValue": "TEXT",
  "google.protobuf.Int32Value": "INTEGER",
  "google.protobuf.Int64Value": "INTEGER",
  "google.protobuf.BoolValue": "INTEGER",
  "google.protobuf.FloatValue": "REAL",
  "google.protobuf.DoubleValue": "REAL",
  "google.protobuf.BytesValue": "BLOB",
  "google.protobuf.Struct": "TEXT",
  "google.protobuf.Value": "TEXT",
  "google.protobuf.ListValue": "TEXT",
};

const SQLSERVER: TypeMap = {
  string: "NVARCHAR(MAX)",
  bool: "BIT",
  bytes: "VARBINARY(MAX)",
  double: "FLOAT",
  float: "REAL",
  int32: "INT",
  int64: "BIGINT",
  uint32: "BIGINT",
  uint64: "DECIMAL(20,0)",
  sint32: "INT",
  sint64: "BIGINT",
  fixed32: "BIGINT",
  fixed64: "DECIMAL(20,0)",
  sfixed32: "INT",
  sfixed64: "BIGINT",
};
const SQLSERVER_WKT: WellKnownTypeMap = {
  "google.protobuf.Timestamp": "DATETIMEOFFSET",
  "google.protobuf.Duration": "BIGINT",
  "google.protobuf.StringValue": "NVARCHAR(MAX)",
  "google.protobuf.Int32Value": "INT",
  "google.protobuf.Int64Value": "BIGINT",
  "google.protobuf.BoolValue": "BIT",
  "google.protobuf.FloatValue": "REAL",
  "google.protobuf.DoubleValue": "FLOAT",
  "google.protobuf.BytesValue": "VARBINARY(MAX)",
  "google.protobuf.Struct": "NVARCHAR(MAX)",
  "google.protobuf.Value": "NVARCHAR(MAX)",
  "google.protobuf.ListValue": "NVARCHAR(MAX)",
};

const TYPE_MAPS: Record<Engine, TypeMap> = {
  postgres: POSTGRES,
  mysql: MYSQL,
  sqlite: SQLITE,
  sqlserver: SQLSERVER,
};
const WKT_MAPS: Record<Engine, WellKnownTypeMap> = {
  postgres: POSTGRES_WKT,
  mysql: MYSQL_WKT,
  sqlite: SQLITE_WKT,
  sqlserver: SQLSERVER_WKT,
};

export function getScalarSqlType(engine: Engine, protoType: ProtoScalarType): string {
  return TYPE_MAPS[engine][protoType];
}

export function getWellKnownSqlType(
  engine: Engine,
  fullTypeName: WellKnownType,
): string | undefined {
  return WKT_MAPS[engine][fullTypeName];
}

export function getJsonColumnType(engine: Engine): string {
  switch (engine) {
    case "postgres":
      return "JSONB";
    case "mysql":
      return "JSON";
    case "sqlite":
      return "TEXT";
    case "sqlserver":
      return "NVARCHAR(MAX)";
  }
}

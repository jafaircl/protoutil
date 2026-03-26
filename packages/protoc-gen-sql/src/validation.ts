// Validates all proto custom options before generation begins.
//
// All errors are collected and surfaced together — the user sees every
// problem in a single run rather than fixing one at a time.
//
// Validation is intentionally separated from generation so that generators
// can assume all options are well-formed and omit defensive checks entirely.
//
// Rules enforced:
//
//   Message-level:
//     V01 — foreign_key.column must not be empty
//     V02 — foreign_key.references_table must not be empty
//     V03 — foreign_key.column must not collide with a reserved injected column
//     V04 — foreign_key.column must not duplicate another column in the table
//     V05 — extra_columns entry must have a non-empty column_name
//     V06 — extra_columns entry must have column_type or a type_overrides entry for the target engine
//     V07 — extra_columns entry must not have omit = true
//     V08 — extra_columns entry column_name must not collide with a reserved column
//     V09 — extra_columns entry column_name must not duplicate another column
//     V10 — composite index column references must resolve to known columns
//     V11 — composite unique constraint column references must resolve to known columns
//
//   Field-level:
//     V12 — a proto field column_name override must not collide with a reserved column
//     V13 — a proto field column_name must not duplicate another column in the table
//     V14 — ENUM_STRATEGY_NATIVE_TYPE is postgres-only; error on all other engines
//     V15 — type_overrides keys must be valid engine names

import { type DescMessage, getOption } from "@bufbuild/protobuf";
import type { Schema } from "@bufbuild/protoplugin";
import {
  EnumStrategy,
  field as fieldOption,
  message as messageOption,
  TimestampBehavior,
} from "./gen/protoutil/sql/v1/options_pb.js";
import { defaultColumnName, defaultTableName } from "./util/naming.js";
import { VALID_ENGINES } from "./util/plugin-options.js";

// Column names always injected as the primary key — cannot be used for anything else
const ALWAYS_RESERVED = new Set(["id"]);

// Column names injected as timestamps — reserved unless disabled via TimestampBehavior
const TIMESTAMP_COLUMNS = new Set(["created_at", "updated_at"]);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function validate(schema: Schema): string[] {
  const errors: string[] = [];
  const engine = (schema as unknown as { options: { engine: string } }).options.engine;

  for (const file of schema.files) {
    for (const message of file.messages) {
      const msgOpts = getOption(message, messageOption);
      if (!msgOpts.generate) continue;
      errors.push(...validateMessage(message, engine));
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Per-message validation
// ---------------------------------------------------------------------------

function validateMessage(message: DescMessage, engine: string): string[] {
  const errors: string[] = [];
  const msgOpts = getOption(message, messageOption);
  const tableName = msgOpts.tableName || defaultTableName(message);
  const ctx = `message ${message.typeName} (table "${tableName}")`;

  // Determine which timestamp column names are actively reserved for this table
  const activeTimestamps = resolveActiveTimestamps(msgOpts.timestamps);
  const reserved = new Set([...ALWAYS_RESERVED, ...activeTimestamps]);

  // Tracks every resolved column name -> source description for duplicate detection
  const seen = new Map<string, string>();

  // Attempts to register a column name. Records a V03/V04/V08/V09/V12/V13 error
  // if the name is reserved or already claimed.
  const claim = (colName: string, source: string, ruleReserved: string, ruleDuplicate: string) => {
    if (reserved.has(colName)) {
      errors.push(
        `[${ctx}] [${ruleReserved}] Column "${colName}" declared by ${source} ` +
          `conflicts with a reserved injected column. ` +
          (TIMESTAMP_COLUMNS.has(colName)
            ? `To use this name, disable the corresponding timestamp injection ` +
              `with timestamps = TIMESTAMP_BEHAVIOR_NONE, TIMESTAMP_BEHAVIOR_CREATED_ONLY, ` +
              `or TIMESTAMP_BEHAVIOR_UPDATED_ONLY on this message.`
            : `"id" is always injected as the primary key and cannot be overridden.`),
      );
      return false;
    }
    if (seen.has(colName)) {
      errors.push(
        `[${ctx}] [${ruleDuplicate}] Duplicate column name "${colName}": ` +
          `declared by both ${seen.get(colName)} and ${source}. ` +
          `Each column in a table must have a unique name.`,
      );
      return false;
    }
    seen.set(colName, source);
    return true;
  };

  // -------------------------------------------------------------------------
  // Proto-derived field columns (V12, V13)
  // -------------------------------------------------------------------------
  for (const field of message.fields) {
    const fOpts = getOption(field, fieldOption);
    if (fOpts.omit) continue;
    if (field.oneof) continue;

    const colName = fOpts.columnName || defaultColumnName(field);
    claim(colName, `field "${field.name}"`, "V12", "V13");

    // V14 — ENUM_STRATEGY_NATIVE_TYPE is postgres-only
    if (
      field.fieldKind === "enum" &&
      fOpts.enumStrategy === EnumStrategy.NATIVE_TYPE &&
      engine !== "postgres"
    ) {
      errors.push(
        `[${ctx}] [V14] Field "${field.name}" uses ENUM_STRATEGY_NATIVE_TYPE but the ` +
          `target engine is "${engine}". Native enum types are postgres-only. ` +
          `Use ENUM_STRATEGY_NAME, ENUM_STRATEGY_INT, or ENUM_STRATEGY_CHECK_CONSTRAINT ` +
          `for cross-engine compatibility, or use column_type / type_overrides to specify ` +
          `an explicit type for each engine.`,
      );
    }

    // V15 — type_overrides keys must be valid engine names
    for (const key of Object.keys(fOpts.typeOverrides ?? {})) {
      if (!VALID_ENGINES.has(key as never)) {
        errors.push(
          `[${ctx}] [V15] Field "${field.name}" has type_overrides key "${key}" which is not ` +
            `a recognised engine name. Valid keys: ${[...VALID_ENGINES].sort().join(", ")}.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Foreign key columns (V01, V02, V03, V04)
  // -------------------------------------------------------------------------
  for (const fk of msgOpts.foreignKeys) {
    if (!fk.column || fk.column.trim() === "") {
      errors.push(
        `[${ctx}] [V01] A foreign_key declaration is missing "column". ` +
          `Every foreign_key must specify the column name it generates on this table ` +
          `(e.g. column: "shelf_id").`,
      );
      continue;
    }

    if (!fk.referencesTable || fk.referencesTable.trim() === "") {
      errors.push(
        `[${ctx}] [V02] Foreign key "${fk.column}" is missing "references_table". ` +
          `Specify the name of the table being referenced ` +
          `(e.g. references_table: "test_library_v1_shelf").`,
      );
    }

    claim(fk.column, `foreign_key "${fk.column}"`, "V03", "V04");
  }

  // -------------------------------------------------------------------------
  // Extra columns (V05, V06, V07, V08, V09)
  // Extra columns reuse FieldOptions with stricter requirements since there
  // is no proto field to fall back on for name or type inference.
  // -------------------------------------------------------------------------
  msgOpts.extraColumns.forEach((col, i) => {
    const label = `extra_columns[${i}]`;

    if (!col.columnName || col.columnName.trim() === "") {
      errors.push(
        `[${ctx}] [V05] ${label} is missing "column_name". ` +
          `Extra columns have no proto field to derive a name from — ` +
          `column_name is required for every entry in extra_columns ` +
          `(e.g. column_name: "deleted_at").`,
      );
      // Cannot proceed with further checks for this entry without a name
      return;
    }

    const hasColumnType = col.columnType && col.columnType.trim() !== "";
    const hasTargetEngineOverride = col.typeOverrides != null && engine in col.typeOverrides;

    if (!hasColumnType && !hasTargetEngineOverride) {
      const hasAnyOverride = Object.keys(col.typeOverrides ?? {}).length > 0;
      const hint = hasAnyOverride
        ? ` type_overrides is present but does not include a key for the current engine ("${engine}"). ` +
          `Add a "${engine}" key or set column_type as a fallback.`
        : ` column_type is required (e.g. column_type: "TIMESTAMPTZ"), ` +
          `or provide type_overrides with a "${engine}" key for per-engine control.`;
      errors.push(
        `[${ctx}] [V06] extra_columns entry "${col.columnName}" has no SQL type for engine "${engine}".` +
          hint,
      );
    }

    if (col.omit) {
      errors.push(
        `[${ctx}] [V07] extra_columns entry "${col.columnName}" has omit = true. ` +
          `omit is meaningless on an extra column — the column exists only because ` +
          `you declared it. Remove the extra_columns entry instead of setting omit = true.`,
      );
    }

    // V15 — type_overrides keys must be valid engine names
    for (const key of Object.keys(col.typeOverrides ?? {})) {
      if (!VALID_ENGINES.has(key as never)) {
        errors.push(
          `[${ctx}] [V15] extra_columns entry "${col.columnName}" has type_overrides key ` +
            `"${key}" which is not a recognised engine name. ` +
            `Valid keys: ${[...VALID_ENGINES].sort().join(", ")}.`,
        );
      }
    }

    claim(col.columnName, `extra_columns entry "${col.columnName}"`, "V08", "V09");
  });

  // -------------------------------------------------------------------------
  // Composite index column references (V10)
  // Checked after all columns are registered so forward references work.
  // -------------------------------------------------------------------------
  for (const idx of msgOpts.indexes) {
    const cols = idx
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    for (const col of cols) {
      if (!seen.has(col) && !reserved.has(col)) {
        errors.push(
          `[${ctx}] [V10] Composite index "${idx}" references column "${col}" ` +
            `which does not exist in this table. ` +
            `Known columns: ${[...seen.keys(), ...reserved].sort().join(", ")}.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Composite unique constraint column references (V11)
  // -------------------------------------------------------------------------
  for (const uc of msgOpts.uniqueConstraints) {
    const cols = uc
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    for (const col of cols) {
      if (!seen.has(col) && !reserved.has(col)) {
        errors.push(
          `[${ctx}] [V11] Composite unique constraint "${uc}" references column "${col}" ` +
            `which does not exist in this table. ` +
            `Known columns: ${[...seen.keys(), ...reserved].sort().join(", ")}.`,
        );
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveActiveTimestamps(behavior: TimestampBehavior): Set<string> {
  switch (behavior) {
    case TimestampBehavior.NONE:
      return new Set();
    case TimestampBehavior.CREATED_ONLY:
      return new Set(["created_at"]);
    case TimestampBehavior.UPDATED_ONLY:
      return new Set(["updated_at"]);
    default:
      return new Set(["created_at", "updated_at"]);
  }
}

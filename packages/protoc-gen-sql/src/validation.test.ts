// Data-driven tests for every validation rule (V01–V13).
// Each case specifies the proto that should trigger the rule,
// the rule code that must appear in the error, and a substring
// of the error message that confirms it is the right error.

import { describe, expect, it } from "vitest";
import { validateProto } from "./test-helpers.js";

interface ValidationCase {
  description: string;
  rule: string; // e.g. "V01" — must appear in the error string
  errorFragment: string; // distinctive phrase from the expected error message
  proto: string;
  expectValid?: true; // set to assert the proto produces NO errors
}

const VALIDATION_CASES: ValidationCase[] = [
  // -------------------------------------------------------------------------
  // V01 — foreign_key.column required
  // -------------------------------------------------------------------------
  {
    description: "V01: errors when foreign_key is missing column",
    rule: "V01",
    errorFragment: `missing "column"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ references_table: "test_v1_shelves" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V02 — foreign_key.references_table required
  // -------------------------------------------------------------------------
  {
    description: "V02: errors when foreign_key is missing references_table",
    rule: "V02",
    errorFragment: `missing "references_table"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ column: "shelf_id" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V03 — foreign_key.column must not be a reserved column
  // -------------------------------------------------------------------------
  {
    description: "V03: errors when foreign_key column is 'id'",
    rule: "V03",
    errorFragment: `reserved injected column`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ column: "id", references_table: "test_v1_shelves" }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V03: errors when foreign_key column is 'created_at' while timestamps are active",
    rule: "V03",
    errorFragment: `TIMESTAMP_BEHAVIOR_NONE`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ column: "created_at", references_table: "test_v1_shelves" }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V03: allows created_at as FK column when timestamps = NONE",
    rule: "V03",
    errorFragment: "",
    expectValid: true,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          timestamps: TIMESTAMP_BEHAVIOR_NONE
          foreign_keys: [{ column: "created_at", references_table: "test_v1_other" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V04 — foreign_key.column must not duplicate another column
  // -------------------------------------------------------------------------
  {
    description: "V04: errors when two foreign_keys declare the same column",
    rule: "V04",
    errorFragment: `Duplicate column name "shelf_id"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [
            { column: "shelf_id", references_table: "test_v1_shelves" },
            { column: "shelf_id", references_table: "test_v1_shelves" }
          ]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V04: errors when foreign_key column duplicates a proto field column",
    rule: "V04",
    errorFragment: `Duplicate column name "shelf_id"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ column: "shelf_id", references_table: "test_v1_shelves" }]
        };
        string shelf_id = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V05 — extra_columns entry must have column_name
  // -------------------------------------------------------------------------
  {
    description: "V05: errors when extra_columns entry is missing column_name",
    rule: "V05",
    errorFragment: `missing "column_name"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_type: "TIMESTAMPTZ" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V06 — extra_columns entry must have column_type or type_overrides for the target engine
  // -------------------------------------------------------------------------
  {
    description: "V06: errors when extra_columns entry has column_name but no type",
    rule: "V06",
    errorFragment: `has no SQL type for engine "postgres"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "deleted_at" }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V06: errors when type_overrides exists but does not cover the target engine",
    rule: "V06",
    errorFragment: `type_overrides is present but does not include a key for the current engine ("postgres")`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "deleted_at", type_overrides: { key: "sqlite" value: "TEXT" } }]
        };
        string title = 1;
      }
    `,
  },
  {
    description:
      "V06: allows extra_column with no column_type if type_overrides covers the target engine",
    rule: "V06",
    errorFragment: "",
    expectValid: true,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "deleted_at", type_overrides: { key: "postgres" value: "TIMESTAMPTZ" } }]
        };
        string title = 1;
      }
    `,
  },
  {
    description:
      "V06: allows extra_column with column_type as fallback when type_overrides covers a different engine",
    rule: "V06",
    errorFragment: "",
    expectValid: true,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "deleted_at", column_type: "TIMESTAMPTZ", type_overrides: { key: "sqlite" value: "TEXT" } }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V07 — extra_columns entry must not have omit = true
  // -------------------------------------------------------------------------
  {
    description: "V07: errors when extra_columns entry has omit = true",
    rule: "V07",
    errorFragment: `omit is meaningless on an extra column`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "deleted_at", column_type: "TIMESTAMPTZ", omit: true }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V08 — extra_columns column_name must not collide with a reserved column
  // -------------------------------------------------------------------------
  {
    description: "V08: errors when extra_columns uses reserved column name 'id'",
    rule: "V08",
    errorFragment: `reserved injected column`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "id", column_type: "TEXT" }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V08: errors when extra_columns uses 'updated_at' while timestamps active",
    rule: "V08",
    errorFragment: `TIMESTAMP_BEHAVIOR_NONE`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "updated_at", column_type: "TIMESTAMPTZ" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V09 — extra_columns column_name must not duplicate another column
  // -------------------------------------------------------------------------
  {
    description: "V09: errors when extra_column column_name duplicates a proto field",
    rule: "V09",
    errorFragment: `Duplicate column name "title"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{ column_name: "title", column_type: "TEXT" }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V09: errors when two extra_columns share the same column_name",
    rule: "V09",
    errorFragment: `Duplicate column name "deleted_at"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [
            { column_name: "deleted_at", column_type: "TIMESTAMPTZ" },
            { column_name: "deleted_at", column_type: "TIMESTAMPTZ" }
          ]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V10 — composite index column references must resolve
  // -------------------------------------------------------------------------
  {
    description: "V10: errors when composite index references a non-existent column",
    rule: "V10",
    errorFragment: `references column "nonexistent"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = { generate: true, indexes: ["title,nonexistent"] };
        string title = 1;
      }
    `,
  },
  {
    description: "V10: allows composite index referencing a reserved column (e.g. id)",
    rule: "V10",
    errorFragment: "",
    expectValid: true,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = { generate: true, indexes: ["title,id"] };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V11 — composite unique constraint column references must resolve
  // -------------------------------------------------------------------------
  {
    description: "V11: errors when composite unique constraint references a non-existent column",
    rule: "V11",
    errorFragment: `references column "ghost"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = { generate: true, unique_constraints: ["title,ghost"] };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V12 — proto field column_name override must not collide with reserved column
  // -------------------------------------------------------------------------
  {
    description: "V12: errors when a field overrides column_name to 'id'",
    rule: "V12",
    errorFragment: `reserved injected column`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        string title = 1 [(protoutil.sql.v1.field).column_name = "id"];
      }
    `,
  },
  {
    description: "V12: errors when a field overrides column_name to 'created_at'",
    rule: "V12",
    errorFragment: `TIMESTAMP_BEHAVIOR_NONE`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        string created = 1 [(protoutil.sql.v1.field).column_name = "created_at"];
      }
    `,
  },

  // -------------------------------------------------------------------------
  // V13 — proto field column_name must not duplicate another column
  // -------------------------------------------------------------------------
  {
    description: "V13: errors when two proto fields resolve to the same column name",
    rule: "V13",
    errorFragment: `Duplicate column name "title"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        string title      = 1;
        string book_title = 2 [(protoutil.sql.v1.field).column_name = "title"];
      }
    `,
  },

  // -------------------------------------------------------------------------
  // Multiple errors in one pass
  // -------------------------------------------------------------------------
  {
    description: "reports all errors together rather than stopping at the first",
    rule: "V01",
    errorFragment: `missing "column"`,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [
            { references_table: "t1" },
            { references_table: "t2" }
          ]
          extra_columns: [{ column_name: "x" }]
        };
        string title = 1;
      }
    `,
  },

  // -------------------------------------------------------------------------
  // Non-opted-in messages are not validated
  // -------------------------------------------------------------------------
  {
    description: "does not validate messages without generate = true",
    rule: "",
    errorFragment: "",
    expectValid: true,
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Request {
        string name = 1 [(protoutil.sql.v1.field).column_name = "id"];
      }
    `,
  },
];

describe("validation", () => {
  for (const tc of VALIDATION_CASES) {
    it(tc.description, async () => {
      const errors = await validateProto(tc.proto);

      if (tc.expectValid) {
        expect(errors).toEqual([]);
        return;
      }

      expect(errors.length).toBeGreaterThan(0);

      // At least one error must reference the expected rule code
      const ruleErrors = errors.filter((e) => e.includes(`[${tc.rule}]`));
      expect(
        ruleErrors.length,
        `Expected at least one error with rule code [${tc.rule}].\nActual errors:\n${errors.join("\n")}`,
      ).toBeGreaterThan(0);

      // That error must contain the expected fragment
      const matchingError = ruleErrors.find((e) => e.includes(tc.errorFragment));
      expect(
        matchingError,
        `Expected an error matching [${tc.rule}] containing "${tc.errorFragment}".\nActual [${tc.rule}] errors:\n${ruleErrors.join("\n")}`,
      ).toBeDefined();
    });
  }

  it("reports multiple errors in a single pass (V01 + V06)", async () => {
    const errors = await validateProto(`
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          foreign_keys: [{ references_table: "t1" }]
          extra_columns: [{ column_name: "x" }]
        };
        string title = 1;
      }
    `);
    expect(errors.some((e) => e.includes("[V01]"))).toBe(true);
    expect(errors.some((e) => e.includes("[V06]"))).toBe(true);
  });
});

describe("plugin option validation", () => {
  it("rejects mariadb as an engine", async () => {
    const { parseOptions } = await import("./util/plugin-options.js");
    expect(() => parseOptions([{ key: "engine", value: "mariadb" }])).toThrow(
      `Unknown engine "mariadb"`,
    );
  });

  it("rejects an unknown engine name", async () => {
    const { parseOptions } = await import("./util/plugin-options.js");
    expect(() => parseOptions([{ key: "engine", value: "oracle" }])).toThrow(
      `Unknown engine "oracle"`,
    );
  });

  it("rejects an invalid if_not_exists value", async () => {
    const { parseOptions } = await import("./util/plugin-options.js");
    expect(() =>
      parseOptions([
        { key: "engine", value: "postgres" },
        { key: "if_not_exists", value: "yes" },
      ]),
    ).toThrow(`Invalid value "yes" for if_not_exists`);
  });
});

// V14 cases appended
const V14_CASES = [
  {
    description: "V14: errors when ENUM_STRATEGY_NATIVE_TYPE used on mysql",
    rule: "V14",
    errorFragment: `ENUM_STRATEGY_NATIVE_TYPE but the target engine is "mysql"`,
    engine: "mysql",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      enum Status { STATUS_UNSPECIFIED = 0; STATUS_ACTIVE = 1; STATUS_INACTIVE = 2; }
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        Status status = 1 [(protoutil.sql.v1.field).enum_strategy = ENUM_STRATEGY_NATIVE_TYPE];
      }
    `,
  },
  {
    description: "V14: errors when ENUM_STRATEGY_NATIVE_TYPE used on sqlite",
    rule: "V14",
    errorFragment: `target engine is "sqlite"`,
    engine: "sqlite",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      enum Status { STATUS_UNSPECIFIED = 0; STATUS_ACTIVE = 1; }
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        Status status = 1 [(protoutil.sql.v1.field).enum_strategy = ENUM_STRATEGY_NATIVE_TYPE];
      }
    `,
  },
  {
    description: "V14: allows ENUM_STRATEGY_NATIVE_TYPE on postgres",
    rule: "V14",
    errorFragment: "",
    expectValid: true,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      enum Status { STATUS_UNSPECIFIED = 0; STATUS_ACTIVE = 1; }
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        Status status = 1 [(protoutil.sql.v1.field).enum_strategy = ENUM_STRATEGY_NATIVE_TYPE];
      }
    `,
  },
];

describe("validation — V14 ENUM_STRATEGY_NATIVE_TYPE engine check", () => {
  for (const tc of V14_CASES) {
    it(tc.description, async () => {
      const errors = await validateProto(tc.proto, { engine: tc.engine });
      if (tc.expectValid) {
        expect(errors).toEqual([]);
        return;
      }
      expect(errors.length).toBeGreaterThan(0);
      const ruleErrors = errors.filter((e) => e.includes(`[${tc.rule}]`));
      expect(ruleErrors.length).toBeGreaterThan(0);
      expect(ruleErrors.find((e) => e.includes(tc.errorFragment))).toBeDefined();
    });
  }
});

// V15 cases — type_overrides keys must be valid engine names
const V15_CASES = [
  {
    description: "V15: errors when type_overrides has an unrecognised key on a proto field",
    rule: "V15",
    errorFragment: `type_overrides key "postgress"`,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        bool read = 1 [(protoutil.sql.v1.field).type_overrides = { key: "postgress" value: "BOOLEAN" }];
      }
    `,
  },
  {
    description: "V15: errors when type_overrides has an unrecognised key on an extra_column",
    rule: "V15",
    errorFragment: `type_overrides key "Postgres"`,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{
            column_name: "deleted_at",
            type_overrides: { key: "Postgres" value: "TIMESTAMPTZ" }
          }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V15: errors when one key is valid and one is not (mixed case)",
    rule: "V15",
    errorFragment: `type_overrides key "postgress"`,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        bool read = 1 [(protoutil.sql.v1.field).type_overrides = { key: "sqlite" value: "INTEGER" }, (protoutil.sql.v1.field).type_overrides = { key: "postgress" value: "BOOLEAN" }];
      }
    `,
  },
  {
    description: "V15: allows valid engine keys on a proto field",
    rule: "V15",
    errorFragment: "",
    expectValid: true,
    engine: "sqlite",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        bool read = 1 [(protoutil.sql.v1.field).type_overrides = { key: "sqlite" value: "INTEGER" }, (protoutil.sql.v1.field).type_overrides = { key: "postgres" value: "BOOLEAN" }];
      }
    `,
  },
  {
    description: "V15: allows valid engine keys on an extra_column",
    rule: "V15",
    errorFragment: "",
    expectValid: true,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{
            column_name: "deleted_at",
            type_overrides: { key: "postgres" value: "TIMESTAMPTZ" }
          }]
        };
        string title = 1;
      }
    `,
  },
  {
    description: "V15: errors when one key is valid and one is not",
    rule: "V15",
    errorFragment: `type_overrides key "postgresss"`,
    engine: "postgres",
    proto: `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Book {
        option (protoutil.sql.v1.message).generate = true;
        bool active = 1 [
          (protoutil.sql.v1.field).type_overrides = { key: "postgres" value: "BOOLEAN" },
          (protoutil.sql.v1.field).type_overrides = { key: "postgresss" value: "BOOLEAN" }
        ];
      }
    `,
  },
];

describe("validation — V15 type_overrides key validation", () => {
  for (const tc of V15_CASES) {
    it(tc.description, async () => {
      const errors = await validateProto(tc.proto, { engine: tc.engine });
      if (tc.expectValid) {
        expect(errors).toEqual([]);
        return;
      }
      expect(errors.length).toBeGreaterThan(0);
      const ruleErrors = errors.filter((e) => e.includes(`[${tc.rule}]`));
      expect(ruleErrors.length).toBeGreaterThan(0);
      expect(ruleErrors.find((e) => e.includes(tc.errorFragment))).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// V06 — same proto, multiple engines
// Confirms that type_overrides entries for other engines do not cause V06
// errors when the current engine is covered, and do cause errors when it is not.
// ---------------------------------------------------------------------------
describe("validation — V06 multi-engine same proto", () => {
  const MULTI_ENGINE_PROTO = `
    syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
    message Event {
      option (protoutil.sql.v1.message) = {
        generate: true
        extra_columns: [{
          column_name: "occurred_at"
          type_overrides: { key: "postgres" value: "TIMESTAMPTZ" }
          type_overrides: { key: "sqlite"   value: "TEXT" }
        }]
      };
      string name = 1;
    }
  `;

  it("passes V06 when generating for postgres (covered by type_overrides)", async () => {
    const errors = await validateProto(MULTI_ENGINE_PROTO, { engine: "postgres" });
    expect(errors.filter((e) => e.includes("[V06]"))).toEqual([]);
  });

  it("passes V06 when generating for sqlite (covered by type_overrides)", async () => {
    const errors = await validateProto(MULTI_ENGINE_PROTO, { engine: "sqlite" });
    expect(errors.filter((e) => e.includes("[V06]"))).toEqual([]);
  });

  it("fails V06 when generating for mysql (not covered, no column_type fallback)", async () => {
    const errors = await validateProto(MULTI_ENGINE_PROTO, { engine: "mysql" });
    expect(errors.some((e) => e.includes("[V06]"))).toBe(true);
    expect(errors.find((e) => e.includes("[V06]"))).toContain(`engine "mysql"`);
  });

  it("passes V06 for uncovered engine when column_type is set as fallback", async () => {
    const proto = `
      syntax = "proto3"; package test.v1; import "protoutil/sql/v1/options.proto";
      message Event {
        option (protoutil.sql.v1.message) = {
          generate: true
          extra_columns: [{
            column_name: "occurred_at"
            column_type: "TIMESTAMPTZ"
            type_overrides: { key: "sqlite" value: "TEXT" }
          }]
        };
        string name = 1;
      }
    `;
    const errors = await validateProto(proto, { engine: "mysql" });
    expect(errors.filter((e) => e.includes("[V06]"))).toEqual([]);
  });
});

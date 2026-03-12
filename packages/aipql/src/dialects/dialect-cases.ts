/**
 * Shared test cases for all four dialects. Each case defines a single AIP-160
 * filter string and the expected output for postgres, sqlite, mysql, and mongo.
 *
 * Dialect-specific features (caseInsensitive toggle, matches function, user-
 * provided function handlers) are tested in the individual spec files.
 */
import type { MongoFilter } from "../types.js";

type SqlExpected = { sql: string; params: unknown[] };
type MongoExpected = { filter: MongoFilter };

export type UnifiedCase = {
  filter: string;
  postgres: SqlExpected;
  sqlite: SqlExpected;
  mysql: SqlExpected;
  mongo: MongoExpected;
  only?: boolean;
};

export type UnifiedGroup = {
  group: string;
  cases: UnifiedCase[];
};

export const groups: UnifiedGroup[] = [
  // ---------------------------------------------------------------------------
  // String literals
  // ---------------------------------------------------------------------------
  {
    group: "string literals",
    cases: [
      {
        filter: `author = "Tolkien"`,
        postgres: { sql: `"author" = $1`, params: ["Tolkien"] },
        sqlite: { sql: `"author" = ?`, params: ["Tolkien"] },
        mysql: { sql: "`author` = ?", params: ["Tolkien"] },
        mongo: { filter: { author: { $eq: "Tolkien" } } },
      },
      {
        filter: `author != "Tolkien"`,
        postgres: { sql: `"author" <> $1`, params: ["Tolkien"] },
        sqlite: { sql: `"author" <> ?`, params: ["Tolkien"] },
        mysql: { sql: "`author` <> ?", params: ["Tolkien"] },
        mongo: { filter: { author: { $ne: "Tolkien" } } },
      },
      {
        // Per AIP-160, = on strings SHOULD support wildcard * semantics
        filter: `author = "Tolk*"`,
        postgres: { sql: `"author" ILIKE $1`, params: ["Tolk%"] },
        sqlite: { sql: `"author" LIKE ?`, params: ["Tolk%"] },
        mysql: { sql: "`author` LIKE ?", params: ["Tolk%"] },
        mongo: { filter: { author: { $regex: "^Tolk", $options: "i" } } },
      },
      {
        // Leading wildcard with =
        filter: `author = "*.Tolkien"`,
        postgres: { sql: `"author" ILIKE $1`, params: ["%.Tolkien"] },
        sqlite: { sql: `"author" LIKE ?`, params: ["%.Tolkien"] },
        mysql: { sql: "`author` LIKE ?", params: ["%.Tolkien"] },
        mongo: { filter: { author: { $regex: "\\.Tolkien$", $options: "i" } } },
      },
      {
        // != with a wildcard RHS
        filter: `author != "Tolk*"`,
        postgres: { sql: `"author" NOT ILIKE $1`, params: ["Tolk%"] },
        sqlite: { sql: `"author" NOT LIKE ?`, params: ["Tolk%"] },
        mysql: { sql: "`author` NOT LIKE ?", params: ["Tolk%"] },
        mongo: { filter: { author: { $not: { $regex: "^Tolk", $options: "i" } } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Integer literals
  // ---------------------------------------------------------------------------
  {
    group: "integer literals",
    cases: [
      {
        filter: `count = 42`,
        postgres: { sql: `"count" = $1`, params: [42n] },
        sqlite: { sql: `"count" = ?`, params: [42n] },
        mysql: { sql: "`count` = ?", params: [42n] },
        mongo: { filter: { count: { $eq: 42n } } },
      },
      {
        filter: `count != 42`,
        postgres: { sql: `"count" <> $1`, params: [42n] },
        sqlite: { sql: `"count" <> ?`, params: [42n] },
        mysql: { sql: "`count` <> ?", params: [42n] },
        mongo: { filter: { count: { $ne: 42n } } },
      },
      {
        filter: `count < 42`,
        postgres: { sql: `"count" < $1`, params: [42n] },
        sqlite: { sql: `"count" < ?`, params: [42n] },
        mysql: { sql: "`count` < ?", params: [42n] },
        mongo: { filter: { count: { $lt: 42n } } },
      },
      {
        filter: `count <= 42`,
        postgres: { sql: `"count" <= $1`, params: [42n] },
        sqlite: { sql: `"count" <= ?`, params: [42n] },
        mysql: { sql: "`count` <= ?", params: [42n] },
        mongo: { filter: { count: { $lte: 42n } } },
      },
      {
        filter: `count > 42`,
        postgres: { sql: `"count" > $1`, params: [42n] },
        sqlite: { sql: `"count" > ?`, params: [42n] },
        mysql: { sql: "`count` > ?", params: [42n] },
        mongo: { filter: { count: { $gt: 42n } } },
      },
      {
        filter: `count >= 42`,
        postgres: { sql: `"count" >= $1`, params: [42n] },
        sqlite: { sql: `"count" >= ?`, params: [42n] },
        mysql: { sql: "`count` >= ?", params: [42n] },
        mongo: { filter: { count: { $gte: 42n } } },
      },
      {
        // Zero
        filter: `count = 0`,
        postgres: { sql: `"count" = $1`, params: [0n] },
        sqlite: { sql: `"count" = ?`, params: [0n] },
        mysql: { sql: "`count` = ?", params: [0n] },
        mongo: { filter: { count: { $eq: 0n } } },
      },
      {
        // Negative integer
        filter: `count = -5`,
        postgres: { sql: `"count" = $1`, params: [-5n] },
        sqlite: { sql: `"count" = ?`, params: [-5n] },
        mysql: { sql: "`count` = ?", params: [-5n] },
        mongo: { filter: { count: { $eq: -5n } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Double literals
  // ---------------------------------------------------------------------------
  {
    group: "double literals",
    cases: [
      {
        filter: `score = 3.14`,
        postgres: { sql: `"score" = $1`, params: [3.14] },
        sqlite: { sql: `"score" = ?`, params: [3.14] },
        mysql: { sql: "`score` = ?", params: [3.14] },
        mongo: { filter: { score: { $eq: 3.14 } } },
      },
      {
        filter: `score < 3.14`,
        postgres: { sql: `"score" < $1`, params: [3.14] },
        sqlite: { sql: `"score" < ?`, params: [3.14] },
        mysql: { sql: "`score` < ?", params: [3.14] },
        mongo: { filter: { score: { $lt: 3.14 } } },
      },
      {
        filter: `score > 3.14`,
        postgres: { sql: `"score" > $1`, params: [3.14] },
        sqlite: { sql: `"score" > ?`, params: [3.14] },
        mysql: { sql: "`score` > ?", params: [3.14] },
        mongo: { filter: { score: { $gt: 3.14 } } },
      },
      {
        // Negative float
        filter: `score = -3.14`,
        postgres: { sql: `"score" = $1`, params: [-3.14] },
        sqlite: { sql: `"score" = ?`, params: [-3.14] },
        mysql: { sql: "`score` = ?", params: [-3.14] },
        mongo: { filter: { score: { $eq: -3.14 } } },
      },
      {
        // Scientific notation — AIP-160 explicitly supports this
        filter: `score = 2.997e9`,
        postgres: { sql: `"score" = $1`, params: [2.997e9] },
        sqlite: { sql: `"score" = ?`, params: [2.997e9] },
        mysql: { sql: "`score` = ?", params: [2.997e9] },
        mongo: { filter: { score: { $eq: 2.997e9 } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Boolean literals
  // ---------------------------------------------------------------------------
  {
    group: "boolean literals",
    cases: [
      {
        filter: `active = true`,
        postgres: { sql: `"active" = $1`, params: [true] },
        sqlite: { sql: `"active" = ?`, params: [true] },
        mysql: { sql: "`active` = ?", params: [true] },
        mongo: { filter: { active: { $eq: true } } },
      },
      {
        filter: `active = false`,
        postgres: { sql: `"active" = $1`, params: [false] },
        sqlite: { sql: `"active" = ?`, params: [false] },
        mysql: { sql: "`active` = ?", params: [false] },
        mongo: { filter: { active: { $eq: false } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Null
  // ---------------------------------------------------------------------------
  {
    group: "null",
    cases: [
      {
        filter: `deleted_at = null`,
        postgres: { sql: `"deleted_at" IS NULL`, params: [] },
        sqlite: { sql: `"deleted_at" IS NULL`, params: [] },
        mysql: { sql: "`deleted_at` IS NULL", params: [] },
        mongo: { filter: { deleted_at: null } },
      },
      {
        filter: `deleted_at != null`,
        postgres: { sql: `"deleted_at" IS NOT NULL`, params: [] },
        sqlite: { sql: `"deleted_at" IS NOT NULL`, params: [] },
        mysql: { sql: "`deleted_at` IS NOT NULL", params: [] },
        mongo: { filter: { deleted_at: { $ne: null } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Logical operators
  // ---------------------------------------------------------------------------
  {
    group: "logical operators",
    cases: [
      {
        filter: `a = 1 AND b = 2`,
        postgres: { sql: `"a" = $1 AND "b" = $2`, params: [1n, 2n] },
        sqlite: { sql: `"a" = ? AND "b" = ?`, params: [1n, 2n] },
        mysql: { sql: "`a` = ? AND `b` = ?", params: [1n, 2n] },
        mongo: { filter: { $and: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] } },
      },
      {
        // Implicit AND — whitespace sequence
        filter: `a = 1 b = 2`,
        postgres: { sql: `"a" = $1 AND "b" = $2`, params: [1n, 2n] },
        sqlite: { sql: `"a" = ? AND "b" = ?`, params: [1n, 2n] },
        mysql: { sql: "`a` = ? AND `b` = ?", params: [1n, 2n] },
        mongo: { filter: { $and: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] } },
      },
      {
        filter: `a = 1 OR b = 2`,
        postgres: { sql: `"a" = $1 OR "b" = $2`, params: [1n, 2n] },
        sqlite: { sql: `"a" = ? OR "b" = ?`, params: [1n, 2n] },
        mysql: { sql: "`a` = ? OR `b` = ?", params: [1n, 2n] },
        mongo: { filter: { $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] } },
      },
      {
        filter: `NOT a = 1`,
        postgres: { sql: `NOT ("a" = $1)`, params: [1n] },
        sqlite: { sql: `NOT ("a" = ?)`, params: [1n] },
        mysql: { sql: "NOT (`a` = ?)", params: [1n] },
        mongo: { filter: { $nor: [{ a: { $eq: 1n } }] } },
      },
      {
        // Minus prefix is alternative NOT in AIP-160
        filter: `-a = 1`,
        postgres: { sql: `NOT ("a" = $1)`, params: [1n] },
        sqlite: { sql: `NOT ("a" = ?)`, params: [1n] },
        mysql: { sql: "NOT (`a` = ?)", params: [1n] },
        mongo: { filter: { $nor: [{ a: { $eq: 1n } }] } },
      },
      {
        // AIP-160: OR binds tighter than AND
        filter: `a = 1 OR b = 2 AND c = 3`,
        postgres: { sql: `("a" = $1 OR "b" = $2) AND "c" = $3`, params: [1n, 2n, 3n] },
        sqlite: { sql: `("a" = ? OR "b" = ?) AND "c" = ?`, params: [1n, 2n, 3n] },
        mysql: { sql: "(`a` = ? OR `b` = ?) AND `c` = ?", params: [1n, 2n, 3n] },
        mongo: {
          filter: {
            $and: [{ $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] }, { c: { $eq: 3n } }],
          },
        },
      },
      {
        filter: `(a = 1 OR b = 2) AND c = 3`,
        postgres: { sql: `("a" = $1 OR "b" = $2) AND "c" = $3`, params: [1n, 2n, 3n] },
        sqlite: { sql: `("a" = ? OR "b" = ?) AND "c" = ?`, params: [1n, 2n, 3n] },
        mysql: { sql: "(`a` = ? OR `b` = ?) AND `c` = ?", params: [1n, 2n, 3n] },
        mongo: {
          filter: {
            $and: [{ $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] }, { c: { $eq: 3n } }],
          },
        },
      },
      {
        filter: `NOT (a = 1 OR b = 2)`,
        postgres: { sql: `NOT ("a" = $1 OR "b" = $2)`, params: [1n, 2n] },
        sqlite: { sql: `NOT ("a" = ? OR "b" = ?)`, params: [1n, 2n] },
        mysql: { sql: "NOT (`a` = ? OR `b` = ?)", params: [1n, 2n] },
        mongo: {
          filter: { $nor: [{ $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] }] },
        },
      },
      {
        filter: `a = 1 AND b = 2 AND c = 3`,
        postgres: { sql: `"a" = $1 AND "b" = $2 AND "c" = $3`, params: [1n, 2n, 3n] },
        sqlite: { sql: `"a" = ? AND "b" = ? AND "c" = ?`, params: [1n, 2n, 3n] },
        mysql: { sql: "`a` = ? AND `b` = ? AND `c` = ?", params: [1n, 2n, 3n] },
        mongo: {
          filter: {
            $and: [{ $and: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] }, { c: { $eq: 3n } }],
          },
        },
      },
      {
        // Three-level OR/AND nesting — verifies left-associativity of OR within a factor
        filter: `a = 1 OR b = 2 OR c = 3 AND d = 4`,
        postgres: {
          sql: `("a" = $1 OR "b" = $2 OR "c" = $3) AND "d" = $4`,
          params: [1n, 2n, 3n, 4n],
        },
        sqlite: {
          sql: `("a" = ? OR "b" = ? OR "c" = ?) AND "d" = ?`,
          params: [1n, 2n, 3n, 4n],
        },
        mysql: {
          sql: "(`a` = ? OR `b` = ? OR `c` = ?) AND `d` = ?",
          params: [1n, 2n, 3n, 4n],
        },
        mongo: {
          filter: {
            $and: [
              { $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }, { c: { $eq: 3n } }] },
              { d: { $eq: 4n } },
            ],
          },
        },
      },
      {
        // NOT on a function call
        filter: `NOT title.startsWith("The")`,
        postgres: { sql: `NOT ("title" ILIKE $1)`, params: ["The%"] },
        sqlite: { sql: `NOT ("title" LIKE ?)`, params: ["The%"] },
        mysql: { sql: "NOT (`title` LIKE ?)", params: ["The%"] },
        mongo: { filter: { $nor: [{ title: { $regex: "^The", $options: "i" } }] } },
      },
      {
        // Minus-prefix NOT on a function call
        filter: `-title.contains("foo")`,
        postgres: { sql: `NOT ("title" ILIKE $1)`, params: ["%foo%"] },
        sqlite: { sql: `NOT ("title" LIKE ?)`, params: ["%foo%"] },
        mysql: { sql: "NOT (`title` LIKE ?)", params: ["%foo%"] },
        mongo: { filter: { $nor: [{ title: { $regex: "foo", $options: "i" } }] } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Field paths
  // ---------------------------------------------------------------------------
  {
    group: "field paths",
    cases: [
      {
        filter: `address.city = "London"`,
        postgres: { sql: `"address"."city" = $1`, params: ["London"] },
        sqlite: { sql: `"address"."city" = ?`, params: ["London"] },
        mysql: { sql: "`address`.`city` = ?", params: ["London"] },
        mongo: { filter: { "address.city": { $eq: "London" } } },
      },
      {
        filter: `a.b.c = 1`,
        postgres: { sql: `"a"."b"."c" = $1`, params: [1n] },
        sqlite: { sql: `"a"."b"."c" = ?`, params: [1n] },
        mysql: { sql: "`a`.`b`.`c` = ?", params: [1n] },
        mongo: { filter: { "a.b.c": { $eq: 1n } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Has operator (:)
  //
  // Per AIP-160, the : operator means "has". For string fields it checks
  // substring containment; for non-string fields and the bare * wildcard it
  // checks presence. Wildcard pattern matching (drag*, *ragon) is NOT part of
  // the : operator — use startsWith / endsWith / contains for that purpose.
  // ---------------------------------------------------------------------------
  {
    group: "has operator (:)",
    cases: [
      {
        // String field — substring containment (case-insensitive by default)
        filter: `title:"dragon"`,
        postgres: { sql: `"title" ILIKE $1`, params: ["%dragon%"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["%dragon%"] },
        mysql: { sql: "`title` LIKE ?", params: ["%dragon%"] },
        mongo: { filter: { title: { $regex: "dragon", $options: "i" } } },
      },
      {
        // Non-string field — presence check
        filter: `age:18`,
        postgres: { sql: `"age" IS NOT NULL`, params: [] },
        sqlite: { sql: `"age" IS NOT NULL`, params: [] },
        mysql: { sql: "`age` IS NOT NULL", params: [] },
        mongo: { filter: { age: { $exists: true } } },
      },
      {
        // Bare * — presence check on any field type
        filter: `tags:*`,
        postgres: { sql: `"tags" IS NOT NULL`, params: [] },
        sqlite: { sql: `"tags" IS NOT NULL`, params: [] },
        mysql: { sql: "`tags` IS NOT NULL", params: [] },
        mongo: { filter: { tags: { $exists: true } } },
      },
      {
        // Has on a nested field path — string containment
        filter: `address.city:"London"`,
        postgres: { sql: `"address"."city" ILIKE $1`, params: ["%London%"] },
        sqlite: { sql: `"address"."city" LIKE ?`, params: ["%London%"] },
        mysql: { sql: "`address`.`city` LIKE ?", params: ["%London%"] },
        mongo: { filter: { "address.city": { $regex: "London", $options: "i" } } },
      },
      {
        // Presence check via :* on a nested field path
        filter: `address.city:*`,
        postgres: { sql: `"address"."city" IS NOT NULL`, params: [] },
        sqlite: { sql: `"address"."city" IS NOT NULL`, params: [] },
        mysql: { sql: "`address`.`city` IS NOT NULL", params: [] },
        mongo: { filter: { "address.city": { $exists: true } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // String functions (stdlib) — default case-insensitive for postgres/mongo
  // ---------------------------------------------------------------------------
  {
    group: "string functions (stdlib)",
    cases: [
      {
        filter: `title.startsWith("The")`,
        postgres: { sql: `"title" ILIKE $1`, params: ["The%"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["The%"] },
        mysql: { sql: "`title` LIKE ?", params: ["The%"] },
        mongo: { filter: { title: { $regex: "^The", $options: "i" } } },
      },
      {
        filter: `title.endsWith("Rings")`,
        postgres: { sql: `"title" ILIKE $1`, params: ["%Rings"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["%Rings"] },
        mysql: { sql: "`title` LIKE ?", params: ["%Rings"] },
        mongo: { filter: { title: { $regex: "Rings$", $options: "i" } } },
      },
      {
        filter: `title.contains("Lord")`,
        postgres: { sql: `"title" ILIKE $1`, params: ["%Lord%"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["%Lord%"] },
        mysql: { sql: "`title` LIKE ?", params: ["%Lord%"] },
        mongo: { filter: { title: { $regex: "Lord", $options: "i" } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Param ordering / sequencing
  // ---------------------------------------------------------------------------
  {
    group: "param ordering",
    cases: [
      {
        // Params must appear in left-to-right traversal order
        filter: `a = 1 AND b = "x" AND c = true`,
        postgres: { sql: `"a" = $1 AND "b" = $2 AND "c" = $3`, params: [1n, "x", true] },
        sqlite: { sql: `"a" = ? AND "b" = ? AND "c" = ?`, params: [1n, "x", true] },
        mysql: { sql: "`a` = ? AND `b` = ? AND `c` = ?", params: [1n, "x", true] },
        mongo: {
          filter: {
            $and: [{ $and: [{ a: { $eq: 1n } }, { b: { $eq: "x" } }] }, { c: { $eq: true } }],
          },
        },
      },
      {
        filter: `(a = 1 OR b = 2) AND (c = 3 OR d = 4)`,
        postgres: {
          sql: `("a" = $1 OR "b" = $2) AND ("c" = $3 OR "d" = $4)`,
          params: [1n, 2n, 3n, 4n],
        },
        sqlite: {
          sql: `("a" = ? OR "b" = ?) AND ("c" = ? OR "d" = ?)`,
          params: [1n, 2n, 3n, 4n],
        },
        mysql: {
          sql: "(`a` = ? OR `b` = ?) AND (`c` = ? OR `d` = ?)",
          params: [1n, 2n, 3n, 4n],
        },
        mongo: {
          filter: {
            $and: [
              { $or: [{ a: { $eq: 1n } }, { b: { $eq: 2n } }] },
              { $or: [{ c: { $eq: 3n } }, { d: { $eq: 4n } }] },
            ],
          },
        },
      },
      {
        // NOT must not disturb subsequent param ordering
        filter: `NOT a = 1 AND b = 2`,
        postgres: { sql: `NOT ("a" = $1) AND "b" = $2`, params: [1n, 2n] },
        sqlite: { sql: `NOT ("a" = ?) AND "b" = ?`, params: [1n, 2n] },
        mysql: { sql: "NOT (`a` = ?) AND `b` = ?", params: [1n, 2n] },
        mongo: {
          filter: {
            $and: [{ $nor: [{ a: { $eq: 1n } }] }, { b: { $eq: 2n } }],
          },
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Identifier quoting
  // ---------------------------------------------------------------------------
  {
    group: "identifier quoting",
    cases: [
      {
        // Identifiers are always quoted in emitted SQL
        filter: `order = "asc"`,
        postgres: { sql: `"order" = $1`, params: ["asc"] },
        sqlite: { sql: `"order" = ?`, params: ["asc"] },
        mysql: { sql: "`order` = ?", params: ["asc"] },
        mongo: { filter: { order: { $eq: "asc" } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Composite (parenthesized) expression
  // ---------------------------------------------------------------------------
  {
    group: "composite expressions",
    cases: [
      {
        // Single parenthesized term — parens are transparent
        filter: `(a = 1)`,
        postgres: { sql: `"a" = $1`, params: [1n] },
        sqlite: { sql: `"a" = ?`, params: [1n] },
        mysql: { sql: "`a` = ?", params: [1n] },
        mongo: { filter: { a: { $eq: 1n } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Whitespace tolerance
  // ---------------------------------------------------------------------------
  {
    group: "whitespace tolerance",
    cases: [
      {
        // No spaces around operator — restrictions are not whitespace-sensitive
        filter: `a=1`,
        postgres: { sql: `"a" = $1`, params: [1n] },
        sqlite: { sql: `"a" = ?`, params: [1n] },
        mysql: { sql: "`a` = ?", params: [1n] },
        mongo: { filter: { a: { $eq: 1n } } },
      },
      {
        // Extra spaces around operator
        filter: `a  =  1`,
        postgres: { sql: `"a" = $1`, params: [1n] },
        sqlite: { sql: `"a" = ?`, params: [1n] },
        mysql: { sql: "`a` = ?", params: [1n] },
        mongo: { filter: { a: { $eq: 1n } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Duration literals
  // AIP-160 defines durations as a numeric value followed by an `s` suffix.
  // ---------------------------------------------------------------------------
  {
    group: "duration literals",
    cases: [
      {
        filter: `ttl = 20s`,
        postgres: { sql: `"ttl" = $1`, params: [BigInt(20 * 1e9)] },
        sqlite: { sql: `"ttl" = ?`, params: [BigInt(20 * 1e9)] },
        mysql: { sql: "`ttl` = ?", params: [BigInt(20 * 1e9)] },
        mongo: { filter: { ttl: { $eq: BigInt(20 * 1e9) } } },
      },
      {
        filter: `ttl > 1.5s`,
        postgres: { sql: `"ttl" > $1`, params: [BigInt(1.5 * 1e9)] },
        sqlite: { sql: `"ttl" > ?`, params: [BigInt(1.5 * 1e9)] },
        mysql: { sql: "`ttl` > ?", params: [BigInt(1.5 * 1e9)] },
        mongo: { filter: { ttl: { $gt: BigInt(1.5 * 1e9) } } },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Timestamp literals
  // AIP-160 defines timestamps as RFC-3339 formatted strings.
  // ---------------------------------------------------------------------------
  {
    group: "timestamp literals",
    cases: [
      {
        filter: `create_time = "2012-04-21T11:30:00-04:00"`,
        postgres: { sql: `"create_time" = $1`, params: [new Date("2012-04-21T11:30:00-04:00")] },
        sqlite: { sql: `"create_time" = ?`, params: [new Date("2012-04-21T11:30:00-04:00")] },
        mysql: { sql: "`create_time` = ?", params: [new Date("2012-04-21T11:30:00-04:00")] },
        mongo: { filter: { create_time: { $eq: new Date("2012-04-21T11:30:00-04:00") } } },
      },
      {
        filter: `create_time > "2012-04-21T11:30:00Z"`,
        postgres: { sql: `"create_time" > $1`, params: [new Date("2012-04-21T11:30:00Z")] },
        sqlite: { sql: `"create_time" > ?`, params: [new Date("2012-04-21T11:30:00Z")] },
        mysql: { sql: "`create_time` > ?", params: [new Date("2012-04-21T11:30:00Z")] },
        mongo: { filter: { create_time: { $gt: new Date("2012-04-21T11:30:00Z") } } },
      },
      {
        // Fractional seconds — sub-second precision must be preserved
        filter: `create_time > "2024-06-15T08:30:00.123Z"`,
        postgres: {
          sql: `"create_time" > $1`,
          params: [new Date("2024-06-15T08:30:00.123Z")],
        },
        sqlite: { sql: `"create_time" > ?`, params: [new Date("2024-06-15T08:30:00.123Z")] },
        mysql: { sql: "`create_time` > ?", params: [new Date("2024-06-15T08:30:00.123Z")] },
        mongo: {
          filter: { create_time: { $gt: new Date("2024-06-15T08:30:00.123Z") } },
        },
      },
      {
        // Fractional seconds with timezone offset
        filter: `create_time = "2024-06-15T08:30:00.999-05:00"`,
        postgres: {
          sql: `"create_time" = $1`,
          params: [new Date("2024-06-15T08:30:00.999-05:00")],
        },
        sqlite: {
          sql: `"create_time" = ?`,
          params: [new Date("2024-06-15T08:30:00.999-05:00")],
        },
        mysql: {
          sql: "`create_time` = ?",
          params: [new Date("2024-06-15T08:30:00.999-05:00")],
        },
        mongo: {
          filter: { create_time: { $eq: new Date("2024-06-15T08:30:00.999-05:00") } },
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // SQL injection safety — values always go through parameterized queries,
  // identifiers are always quoted. No user input is ever interpolated into SQL.
  // ---------------------------------------------------------------------------
  {
    group: "sql injection safety",
    cases: [
      {
        // Malicious string in a comparison — must be parameterized, never interpolated
        filter: `name = "'; DROP TABLE users; --"`,
        postgres: { sql: `"name" = $1`, params: ["'; DROP TABLE users; --"] },
        sqlite: { sql: `"name" = ?`, params: ["'; DROP TABLE users; --"] },
        mysql: { sql: "`name` = ?", params: ["'; DROP TABLE users; --"] },
        mongo: { filter: { name: { $eq: "'; DROP TABLE users; --" } } },
      },
      {
        // SQL keywords as field identifiers — must be quoted
        filter: `select = "value"`,
        postgres: { sql: `"select" = $1`, params: ["value"] },
        sqlite: { sql: `"select" = ?`, params: ["value"] },
        mysql: { sql: "`select` = ?", params: ["value"] },
        mongo: { filter: { select: { $eq: "value" } } },
      },
      {
        // Quote characters in field names — must be escaped inside quotes
        filter: '`a"b` = 1',
        postgres: { sql: `"a""b" = $1`, params: [1n] },
        sqlite: { sql: `"a""b" = ?`, params: [1n] },
        mysql: { sql: '`a"b` = ?', params: [1n] },
        mongo: { filter: { 'a"b': { $eq: 1n } } },
      },
      {
        // Malicious string in has operator — parameterized via LIKE
        filter: `title:"%; DROP TABLE users; --"`,
        postgres: { sql: `"title" ILIKE $1`, params: ["%%; DROP TABLE users; --%"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["%%; DROP TABLE users; --%"] },
        mysql: { sql: "`title` LIKE ?", params: ["%%; DROP TABLE users; --%"] },
        mongo: {
          filter: {
            title: { $regex: "%; DROP TABLE users; --", $options: "i" },
          },
        },
      },
      {
        // Malicious string in startsWith — parameterized
        filter: `title.startsWith("'; DROP TABLE")`,
        postgres: { sql: `"title" ILIKE $1`, params: ["'; DROP TABLE%"] },
        sqlite: { sql: `"title" LIKE ?`, params: ["'; DROP TABLE%"] },
        mysql: { sql: "`title` LIKE ?", params: ["'; DROP TABLE%"] },
        mongo: {
          filter: { title: { $regex: "^'; DROP TABLE", $options: "i" } },
        },
      },
    ],
  },
];

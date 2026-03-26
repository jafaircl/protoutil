import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import { check, contextDecls, parse } from "@protoutil/aip/filtering";
import { Field, OrderBy } from "@protoutil/aip/orderby";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Engine } from "../engine.js";
import { TestUserSchema } from "../gen/protoutil/repo/v1/test_pb.js";
import { createPostgresEngine } from "./engine.js";

/** Parse and type-check an AIP-160 filter against the TestUser schema. */
function checkedFilter(filter: string) {
  const parsed = parse(filter);
  const { checkedExpr } = check(parsed, { decls: contextDecls(TestUserSchema) });
  return checkedExpr;
}

const CREATE_USERS_TABLE = `
	CREATE TABLE IF NOT EXISTS users (
		uid TEXT PRIMARY KEY,
		display_name TEXT,
		email TEXT NOT NULL,
		age INTEGER,
		active BOOLEAN,
		etag TEXT,
		secret TEXT,
		immutable_field TEXT
	)
`;

describe("createPostgresEngine", () => {
  let pool: Pool;
  let engine: Engine;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.PGHOST ?? "localhost",
      port: parseInt(process.env.PGPORT ?? "5432", 10),
      user: process.env.PGUSER ?? "test",
      password: process.env.PGPASSWORD ?? "test",
      database: process.env.PGDATABASE ?? "test",
    });
  });

  beforeEach(() => {
    engine = createPostgresEngine({ client: pool });
  });

  afterEach(async () => {
    // Drop in dependency order (posts references users via FK)
    await pool.query("DROP TABLE IF EXISTS posts");
    await pool.query("DROP TABLE IF EXISTS users");
    await pool.query("DROP TABLE IF EXISTS test");
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("execute", () => {
    it("should execute DDL statements", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");
    });

    it("should execute INSERT and return empty array", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");
      const result = await engine.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);
      expect(result).toEqual([]);
    });

    it("should execute SELECT and return rows", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");
      await engine.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);
      await engine.execute("INSERT INTO test (name) VALUES ($1)", ["bob"]);

      const rows = await engine.execute<{ id: number; name: string }>("SELECT * FROM test");
      expect(rows).toEqual([
        { id: 1, name: "alice" },
        { id: 2, name: "bob" },
      ]);
    });

    it("should support parameterized queries", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT, age INTEGER)");
      await engine.execute("INSERT INTO test (name, age) VALUES ($1, $2)", ["alice", 30]);

      const rows = await engine.execute<{ name: string; age: number }>(
        "SELECT name, age FROM test WHERE age > $1",
        [25],
      );
      expect(rows).toEqual([{ name: "alice", age: 30 }]);
    });

    it("should support RETURNING clause", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");
      const rows = await engine.execute<{ id: number; name: string }>(
        "INSERT INTO test (name) VALUES ($1) RETURNING *",
        ["alice"],
      );
      expect(rows).toEqual([{ id: 1, name: "alice" }]);
    });

    it("should reject on non-string queries", async () => {
      await expect(engine.execute({ find: "test" })).rejects.toThrow(
        "PostgreSQL engine only supports string queries",
      );
    });
  });

  describe("transaction", () => {
    it("should commit on success", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");

      await engine.transaction(async (tx) => {
        await tx.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);
        await tx.execute("INSERT INTO test (name) VALUES ($1)", ["bob"]);
      });

      const rows = await engine.execute<{ name: string }>("SELECT name FROM test");
      expect(rows).toEqual([{ name: "alice" }, { name: "bob" }]);
    });

    it("should rollback on error", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");

      await expect(
        engine.transaction(async (tx) => {
          await tx.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);
          throw new Error("oops");
        }),
      ).rejects.toThrow("oops");

      const rows = await engine.execute<{ name: string }>("SELECT name FROM test");
      expect(rows).toEqual([]);
    });

    it("should return the callback result", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");

      const result = await engine.transaction(async (tx) => {
        await tx.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);
        return 42;
      });

      expect(result).toBe(42);
    });

    it("should support nested transactions via savepoints", async () => {
      await engine.execute("CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT)");

      await engine.transaction(async (tx) => {
        await tx.execute("INSERT INTO test (name) VALUES ($1)", ["alice"]);

        // Inner transaction fails — should only roll back the savepoint
        await expect(
          tx.transaction(async (inner) => {
            await inner.execute("INSERT INTO test (name) VALUES ($1)", ["bob"]);
            throw new Error("inner fail");
          }),
        ).rejects.toThrow("inner fail");

        // alice should still be there
        await tx.execute("INSERT INTO test (name) VALUES ($1)", ["charlie"]);
      });

      const rows = await engine.execute<{ name: string }>("SELECT name FROM test ORDER BY id");
      expect(rows).toEqual([{ name: "alice" }, { name: "charlie" }]);
    });
  });

  describe("findOne", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      await engine.execute(
        "INSERT INTO users (uid, display_name, email, age, active) VALUES ($1, $2, $3, $4, $5)",
        ["u1", "Alice", "alice@test.com", 30, true],
      );
      await engine.execute(
        "INSERT INTO users (uid, display_name, email, age, active) VALUES ($1, $2, $3, $4, $5)",
        ["u2", "Bob", "bob@test.com", 25, false],
      );
    });

    it("should return a matching row", async () => {
      const row = await engine.findOne<{ uid: string; email: string }>({
        table: "users",
        filter: checkedFilter('uid = "u1"'),
      });
      expect(row).toMatchObject({ uid: "u1", email: "alice@test.com" });
    });

    it("should return undefined when no match", async () => {
      const row = await engine.findOne({
        table: "users",
        filter: checkedFilter('uid = "u999"'),
      });
      expect(row).toBeUndefined();
    });

    it("should respect the columns option", async () => {
      const row = await engine.findOne<{ uid: string }>({
        table: "users",
        columns: ["uid"],
        filter: checkedFilter('uid = "u1"'),
      });
      expect(row).toEqual({ uid: "u1" });
    });
  });

  describe("findMany", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      for (const [uid, name, email, age] of [
        ["u1", "Alice", "alice@test.com", 30],
        ["u2", "Bob", "bob@test.com", 25],
        ["u3", "Charlie", "charlie@test.com", 35],
      ]) {
        await engine.execute(
          "INSERT INTO users (uid, display_name, email, age, active) VALUES ($1, $2, $3, $4, $5)",
          [uid, name, email, age, true],
        );
      }
    });

    it("should return all matching rows", async () => {
      const rows = await engine.findMany<{ uid: string }>({
        table: "users",
        filter: checkedFilter("age > 24"),
      });
      expect(rows).toHaveLength(3);
    });

    it("should support limit and offset", async () => {
      const rows = await engine.findMany<{ uid: string }>({
        table: "users",
        filter: checkedFilter("age > 0"),
        orderBy: new OrderBy([new Field("age", false)]),
        limit: 2,
        offset: 1,
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ uid: "u1" }); // age 30 (second after 25)
    });

    it("should reject non-integer limit", async () => {
      await expect(engine.findMany({ table: "users", limit: 1.5 })).rejects.toThrow(
        InvalidArgumentError,
      );
    });

    it("should reject negative limit", async () => {
      await expect(engine.findMany({ table: "users", limit: -1 })).rejects.toThrow(
        InvalidArgumentError,
      );
    });

    it("should reject non-number limit", async () => {
      await expect(
        engine.findMany({ table: "users", limit: "ten" as unknown as number }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should reject non-integer offset", async () => {
      await expect(engine.findMany({ table: "users", offset: 2.7 })).rejects.toThrow(
        InvalidArgumentError,
      );
    });

    it("should reject negative offset", async () => {
      await expect(engine.findMany({ table: "users", offset: -3 })).rejects.toThrow(
        InvalidArgumentError,
      );
    });

    it("should reject non-number offset", async () => {
      await expect(
        engine.findMany({ table: "users", offset: "five" as unknown as number }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should support orderBy", async () => {
      const rows = await engine.findMany<{ uid: string; age: number }>({
        table: "users",
        filter: checkedFilter("age > 0"),
        orderBy: new OrderBy([new Field("age", true)]),
      });
      expect(rows[0]).toMatchObject({ age: 35 });
      expect(rows[2]).toMatchObject({ age: 25 });
    });

    it("should return empty array when no match", async () => {
      const rows = await engine.findMany({
        table: "users",
        filter: checkedFilter("age > 100"),
      });
      expect(rows).toEqual([]);
    });
  });

  describe("insertOne", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
    });

    it("should insert and return the row", async () => {
      const row = await engine.insertOne<{ uid: string; email: string }>({
        table: "users",
        row: {
          uid: "u1",
          display_name: "Alice",
          email: "alice@test.com",
          age: 30,
          active: true,
        },
      });
      expect(row).toMatchObject({ uid: "u1", email: "alice@test.com" });
    });

    it("should persist the inserted row", async () => {
      await engine.insertOne({
        table: "users",
        row: { uid: "u1", email: "alice@test.com" },
      });
      const rows = await engine.execute<{ uid: string }>("SELECT uid FROM users");
      expect(rows).toEqual([{ uid: "u1" }]);
    });
  });

  describe("updateOne", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      await engine.execute(
        "INSERT INTO users (uid, display_name, email, age) VALUES ($1, $2, $3, $4)",
        ["u1", "Alice", "alice@test.com", 30],
      );
    });

    it("should update and return the row", async () => {
      const row = await engine.updateOne<{ uid: string; age: number }>({
        table: "users",
        filter: checkedFilter('uid = "u1"'),
        row: { age: 31 },
      });
      expect(row).toMatchObject({ uid: "u1", age: 31 });
    });

    it("should return undefined when no match", async () => {
      const row = await engine.updateOne({
        table: "users",
        filter: checkedFilter('uid = "u999"'),
        row: { age: 31 },
      });
      expect(row).toBeUndefined();
    });
  });

  describe("deleteOne", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      await engine.execute("INSERT INTO users (uid, email) VALUES ($1, $2)", [
        "u1",
        "alice@test.com",
      ]);
    });

    it("should delete and return true", async () => {
      const deleted = await engine.deleteOne({
        table: "users",
        filter: checkedFilter('uid = "u1"'),
      });
      expect(deleted).toBe(true);

      const rows = await engine.execute("SELECT * FROM users");
      expect(rows).toEqual([]);
    });

    it("should return false when no match", async () => {
      const deleted = await engine.deleteOne({
        table: "users",
        filter: checkedFilter('uid = "u999"'),
      });
      expect(deleted).toBe(false);
    });
  });

  describe("count", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      for (const [uid, email, age] of [
        ["u1", "a@t.com", 30],
        ["u2", "b@t.com", 25],
        ["u3", "c@t.com", 35],
      ]) {
        await engine.execute("INSERT INTO users (uid, email, age) VALUES ($1, $2, $3)", [
          uid,
          email,
          age,
        ]);
      }
    });

    it("should count all rows without a filter", async () => {
      const n = await engine.count({ table: "users" });
      expect(n).toBe(3);
    });

    it("should count rows matching a filter", async () => {
      const n = await engine.count({
        table: "users",
        filter: checkedFilter("age >= 30"),
      });
      expect(n).toBe(2);
    });

    it("should return 0 when no rows match", async () => {
      const n = await engine.count({
        table: "users",
        filter: checkedFilter("age > 100"),
      });
      expect(n).toBe(0);
    });
  });

  describe("error wrapping", () => {
    beforeEach(async () => {
      await engine.execute(CREATE_USERS_TABLE);
      await engine.execute("INSERT INTO users (uid, email) VALUES ($1, $2)", [
        "u1",
        "alice@test.com",
      ]);
    });

    it("should throw AlreadyExistsError on UNIQUE constraint violation", async () => {
      await expect(
        engine.insertOne({
          table: "users",
          row: { uid: "u1", email: "dupe@test.com" },
        }),
      ).rejects.toThrow(AlreadyExistsError);
    });

    it("should throw InvalidArgumentError on NOT NULL constraint violation", async () => {
      await expect(
        engine.insertOne({
          table: "users",
          row: { uid: "u2" },
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should throw FailedPreconditionError on FOREIGN KEY constraint violation", async () => {
      await engine.execute(`
        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          author_uid TEXT NOT NULL REFERENCES users(uid)
        )
      `);
      await expect(
        engine.insertOne({
          table: "posts",
          row: { author_uid: "nonexistent" },
        }),
      ).rejects.toThrow(FailedPreconditionError);
    });

    it("should throw InternalError on other database errors", async () => {
      await expect(engine.execute("SELECT * FROM nonexistent_table")).rejects.toThrow(
        InternalError,
      );
    });

    it("should include the original error message", async () => {
      try {
        await engine.insertOne({
          table: "users",
          row: { uid: "u1", email: "dupe@test.com" },
        });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AlreadyExistsError);
        expect((err as AlreadyExistsError).message).toContain("unique");
      }
    });
  });

  describe("close", () => {
    it("should close the pool", async () => {
      // Create a separate pool for this test so we don't break other tests
      const testPool = new Pool({
        host: process.env.PGHOST ?? "localhost",
        port: parseInt(process.env.PGPORT ?? "5432", 10),
        user: process.env.PGUSER ?? "test",
        password: process.env.PGPASSWORD ?? "test",
        database: process.env.PGDATABASE ?? "test",
      });
      const testEngine = createPostgresEngine({ client: testPool });
      await testEngine.close();
      await expect(testPool.query("SELECT 1")).rejects.toThrow();
    });
  });
});

import {
  AlreadyExistsError,
  FailedPreconditionError,
  InternalError,
  InvalidArgumentError,
} from "@protoutil/aip/errors";
import { check, contextDecls, parse } from "@protoutil/aip/filtering";
import { Field, OrderBy } from "@protoutil/aip/orderby";
import { MongoClient, ObjectId } from "mongodb";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Engine } from "../engine.js";
import { TestUserSchema } from "../gen/protoutil/repo/v1/test_pb.js";
import { createMongoDBEngine } from "./engine.js";

function checkedFilter(filter: string) {
  const parsed = parse(filter);
  const { checkedExpr } = check(parsed, { decls: contextDecls(TestUserSchema) });
  return checkedExpr;
}

const MONGO_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/?replicaSet=rs0";
const MONGO_DATABASE = process.env.MONGODB_DATABASE ?? "test";

describe("createMongoDBEngine", () => {
  let client: MongoClient;
  let engine: Engine;

  beforeAll(async () => {
    client = new MongoClient(MONGO_URI);
    await client.connect();
  });

  beforeEach(() => {
    engine = createMongoDBEngine({ client, database: MONGO_DATABASE });
  });

  afterEach(async () => {
    await client.db(MONGO_DATABASE).dropDatabase();
  });

  afterAll(async () => {
    await client.close();
  });

  describe("execute", () => {
    it("should execute MongoDB commands", async () => {
      const result = await engine.execute<{ ok: number }>({ ping: 1 });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ ok: 1 });
    });

    it("should normalize cursor-based command results", async () => {
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertMany([
          { uid: "u1", email: "alice@test.com" },
          { uid: "u2", email: "bob@test.com" },
        ]);

      const rows = await engine.execute<{ uid: string }>({
        aggregate: "users",
        pipeline: [{ $project: { _id: 0, uid: 1 } }],
        cursor: {},
      });

      expect(rows).toEqual([{ uid: "u1" }, { uid: "u2" }]);
    });

    it("should reject on string queries", async () => {
      await expect(engine.execute("db.users.find({})")).rejects.toThrow(
        "MongoDB engine only supports object queries",
      );
    });
  });

  describe("transaction", () => {
    it("should commit on success", async () => {
      await engine.transaction(async (tx) => {
        await tx.insertOne({
          table: "users",
          row: { uid: "u1", email: "alice@test.com" },
        });
        await tx.insertOne({
          table: "users",
          row: { uid: "u2", email: "bob@test.com" },
        });
      });

      const rows = await engine.findMany<{ uid: string }>({
        table: "users",
        orderBy: new OrderBy([new Field("uid", false)]),
      });
      expect(rows).toEqual([
        { _id: expect.anything(), uid: "u1", email: "alice@test.com" },
        { _id: expect.anything(), uid: "u2", email: "bob@test.com" },
      ]);
    });

    it("should rollback on error", async () => {
      await expect(
        engine.transaction(async (tx) => {
          await tx.insertOne({
            table: "users",
            row: { uid: "u1", email: "alice@test.com" },
          });
          throw new Error("oops");
        }),
      ).rejects.toThrow("oops");

      const rows = await engine.findMany({ table: "users" });
      expect(rows).toEqual([]);
    });

    it("should return the callback result", async () => {
      const result = await engine.transaction(async (tx) => {
        await tx.insertOne({
          table: "users",
          row: { uid: "u1", email: "alice@test.com" },
        });
        return 42;
      });

      expect(result).toBe(42);
    });

    it("should reject nested transactions", async () => {
      await expect(
        engine.transaction(async (tx) => {
          await tx.transaction(async () => 1);
        }),
      ).rejects.toThrow(FailedPreconditionError);
    });
  });

  describe("findOne", () => {
    beforeEach(async () => {
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertMany([
          { uid: "u1", display_name: "Alice", email: "alice@test.com", age: 30, active: true },
          { uid: "u2", display_name: "Bob", email: "bob@test.com", age: 25, active: false },
        ]);
    });

    it("should return a matching document", async () => {
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
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertMany([
          { uid: "u1", display_name: "Alice", email: "alice@test.com", age: 30, active: true },
          { uid: "u2", display_name: "Bob", email: "bob@test.com", age: 25, active: true },
          { uid: "u3", display_name: "Charlie", email: "charlie@test.com", age: 35, active: true },
        ]);
    });

    it("should return all matching documents", async () => {
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
      expect(rows[0]).toMatchObject({ uid: "u1" });
    });

    it("should reject non-integer limit", async () => {
      await expect(
        engine.findMany({ table: "users", limit: 1.5 }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should reject negative limit", async () => {
      await expect(
        engine.findMany({ table: "users", limit: -1 }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should reject non-number limit", async () => {
      await expect(
        engine.findMany({ table: "users", limit: "ten" as unknown as number }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should reject non-integer offset", async () => {
      await expect(
        engine.findMany({ table: "users", offset: 2.7 }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should reject negative offset", async () => {
      await expect(
        engine.findMany({ table: "users", offset: -3 }),
      ).rejects.toThrow(InvalidArgumentError);
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
    it("should insert and return the document", async () => {
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

    it("should persist the inserted document", async () => {
      await engine.insertOne({
        table: "users",
        row: { uid: "u1", email: "alice@test.com" },
      });
      const rows = await client
        .db(MONGO_DATABASE)
        .collection("users")
        .find({}, { projection: { _id: 0, uid: 1 } })
        .toArray();
      expect(rows).toEqual([{ uid: "u1" }]);
    });
  });

  describe("updateOne", () => {
    beforeEach(async () => {
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertOne({ uid: "u1", display_name: "Alice", email: "alice@test.com", age: 30 });
    });

    it("should update and return the document", async () => {
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
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertOne({ uid: "u1", email: "alice@test.com" });
    });

    it("should delete and return true", async () => {
      const deleted = await engine.deleteOne({
        table: "users",
        filter: checkedFilter('uid = "u1"'),
      });
      expect(deleted).toBe(true);

      const rows = await client.db(MONGO_DATABASE).collection("users").find().toArray();
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
      await client
        .db(MONGO_DATABASE)
        .collection("users")
        .insertMany([
          { uid: "u1", email: "a@t.com", age: 30 },
          { uid: "u2", email: "b@t.com", age: 25 },
          { uid: "u3", email: "c@t.com", age: 35 },
        ]);
    });

    it("should count all documents without a filter", async () => {
      const n = await engine.count({ table: "users" });
      expect(n).toBe(3);
    });

    it("should count documents matching a filter", async () => {
      const n = await engine.count({
        table: "users",
        filter: checkedFilter("age >= 30"),
      });
      expect(n).toBe(2);
    });

    it("should return 0 when no documents match", async () => {
      const n = await engine.count({
        table: "users",
        filter: checkedFilter("age > 100"),
      });
      expect(n).toBe(0);
    });
  });

  describe("error wrapping", () => {
    beforeEach(async () => {
      await client.db(MONGO_DATABASE).createCollection("users", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["email"],
          },
        },
      });
      await client.db(MONGO_DATABASE).collection("users").createIndex({ uid: 1 }, { unique: true });
      await engine.insertOne({
        table: "users",
        row: { uid: "u1", email: "alice@test.com" },
      });
    });

    it("should throw AlreadyExistsError on duplicate key violations", async () => {
      await expect(
        engine.insertOne({
          table: "users",
          row: { uid: "u1", email: "dupe@test.com" },
        }),
      ).rejects.toThrow(AlreadyExistsError);
    });

    it("should throw InvalidArgumentError on document validation failures", async () => {
      await expect(
        engine.insertOne({
          table: "users",
          row: { uid: "u2" },
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it("should throw FailedPreconditionError on immutable field updates", async () => {
      await expect(
        engine.updateOne({
          table: "users",
          filter: checkedFilter('uid = "u1"'),
          row: { _id: new ObjectId() },
        }),
      ).rejects.toThrow(FailedPreconditionError);
    });

    it("should throw InternalError on other database errors", async () => {
      await expect(engine.execute({ thisCommandDoesNotExist: 1 })).rejects.toThrow(InternalError);
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
        expect((err as AlreadyExistsError).message).toContain("E11000");
      }
    });
  });

  describe("close", () => {
    it("should close the client", async () => {
      const testClient = new MongoClient(MONGO_URI);
      await testClient.connect();
      const testEngine = createMongoDBEngine({ client: testClient, database: MONGO_DATABASE });
      await testEngine.close();
      await expect(testClient.db(MONGO_DATABASE).command({ ping: 1 })).rejects.toThrow();
    });
  });
});

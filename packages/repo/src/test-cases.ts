import type { MessageShape } from "@bufbuild/protobuf";
import { fromBinary, fromJsonString, toBinary, toJsonString } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import { AlreadyExistsError, InvalidArgumentError, NotFoundError } from "@protoutil/aip/errors";
import { etag as defaultEtagFn } from "@protoutil/aip/etag";
import { ident, STRING } from "@protoutil/aip/filtering";
import { decode as decodePageToken } from "@protoutil/aip/pagination";
import { fieldMask } from "@protoutil/core/wkt";
import { expect } from "vitest";
import { createContextKey, withReentryGuard } from "./context-values.js";
import { TestUserSchema, TestUserSettingsSchema } from "./gen/protoutil/repo/v1/test_pb.js";
import { createRepository } from "./repository.js";
import type { MappedUserSeed, RepositoryTestContext, UserSeed } from "./test-backends.js";
import type { ColumnConfigMap, Interceptor, RepositoryOptions } from "./types.js";

export type RepositoryCase = {
  name: string;
  run(ctx: RepositoryTestContext): Promise<void> | void;
};

export type RepositoryCaseGroup = {
  group: string;
  cases: RepositoryCase[];
};

const BASE_USERS: UserSeed[] = [
  { uid: "u1", displayName: "Alice", email: "alice@test.com", age: 30, active: true },
  { uid: "u2", displayName: "Bob", email: "bob@test.com", age: 25, active: false },
];

const EXTRA_USERS: UserSeed[] = [
  { uid: "u3", displayName: "Charlie", email: "charlie@test.com", age: 35, active: true },
  { uid: "u4", displayName: "Diana", email: "diana@test.com", age: 22, active: true },
  { uid: "u5", displayName: "Eve", email: "eve@test.com", age: 28, active: true },
];

const COLUMNS: ColumnConfigMap<typeof TestUserSchema> = {
  uid: { name: "user_id" },
  displayName: { name: "name" },
  email: { name: "email_addr" },
  age: { name: "user_age" },
  active: { name: "is_active" },
  immutableField: { name: "immutable" },
};

const MAPPED_USER: MappedUserSeed = {
  user_id: "u1",
  name: "Alice",
  email_addr: "alice@test.com",
  user_age: 30,
  is_active: true,
};

const REPO_USERS_TABLE = "repo_users";
const REPO_MAPPED_USERS_TABLE = "repo_mapped_users";
const REPO_MAPPED_USERS_TABLE_2 = "repo_mapped_users2";

function asBinary(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "object" && value !== null) {
    const binary = value as { buffer?: unknown; value?: unknown };
    if (binary.buffer instanceof Uint8Array) {
      return binary.buffer;
    }
    if (binary.buffer instanceof ArrayBuffer) {
      return new Uint8Array(binary.buffer);
    }
    if (binary.value instanceof Uint8Array) {
      return binary.value;
    }
  }
  return undefined;
}

function repo(
  ctx: RepositoryTestContext,
  opts?: Omit<RepositoryOptions<typeof TestUserSchema>, "engine" | "tableName">,
) {
  return createRepository(TestUserSchema, {
    engine: ctx.engine,
    tableName: REPO_USERS_TABLE,
    ...opts,
  });
}

export async function setupBaseUsers(ctx: RepositoryTestContext): Promise<void> {
  await ctx.insertUsers(BASE_USERS);
}

export const groups: RepositoryCaseGroup[] = [
  {
    group: "tableName",
    cases: [
      {
        name: "should derive table name from proto type name",
        run(ctx) {
          expect(createRepository(TestUserSchema, { engine: ctx.engine }).tableName).toBe(
            "protoutil_repo_v1_test_user",
          );
        },
      },
      {
        name: "should use custom table name when provided",
        run(ctx) {
          expect(
            createRepository(TestUserSchema, { engine: ctx.engine, tableName: "users" }).tableName,
          ).toBe("users");
        },
      },
    ],
  },
  {
    group: "get",
    cases: [
      {
        name: "should find a resource by filter string",
        async run(ctx) {
          const user = await repo(ctx).get('uid = "u1"');
          expect(user.uid).toBe("u1");
          expect(user.displayName).toBe("Alice");
          expect(user.email).toBe("alice@test.com");
          expect(user.age).toBe(30);
        },
      },
      {
        name: "should find a resource by partial object",
        async run(ctx) {
          const user = await repo(ctx).get({ uid: "u2" });
          expect(user.uid).toBe("u2");
          expect(user.displayName).toBe("Bob");
        },
      },
      {
        name: "should throw NotFoundError when no match",
        async run(ctx) {
          await expect(repo(ctx).get({ uid: "u999" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should apply readMask to limit returned fields",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const user = await repo(ctx).get({ uid: "u1" }, { readMask: mask });
          expect(user.uid).toBe("u1");
          expect(user.email).toBe("alice@test.com");
          expect(user.displayName).toBe("");
          expect(user.age).toBe(0);
        },
      },
      {
        name: "should use defaultReadMask when no per-call readMask",
        async run(ctx) {
          const readMask = fieldMask(TestUserSchema, ["uid", "email"]);
          const user = await repo(ctx, { fieldMasks: { read: readMask } }).get({ uid: "u1" });
          expect(user.uid).toBe("u1");
          expect(user.email).toBe("alice@test.com");
          expect(user.displayName).toBe("");
        },
      },
      {
        name: "should support columns name mapping for remapping field names",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE, [MAPPED_USER]);
          const user = await createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
          }).get('uid = "u1"');
          expect(user.uid).toBe("u1");
          expect(user.displayName).toBe("Alice");
          expect(user.email).toBe("alice@test.com");
          expect(user.age).toBe(30);
        },
      },
      {
        name: "should support filterDecls for additional filter identifiers",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE, [MAPPED_USER]);
          const user = await createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
            filterDecls: [ident("name", STRING)],
          }).get('name = "Alice"');
          expect(user.uid).toBe("u1");
          expect(user.displayName).toBe("Alice");
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const user = await repo(ctx).get({ uid: "u1" }, { transaction: tx });
            expect(user.uid).toBe("u1");
          });
        },
      },
      {
        name: "should expose the schema",
        run(ctx) {
          expect(repo(ctx).schema).toBe(TestUserSchema);
        },
      },
    ],
  },
  {
    group: "create",
    cases: [
      {
        name: "should insert a resource and return it",
        async run(ctx) {
          const user = await repo(ctx).create({
            uid: "u3",
            displayName: "Charlie",
            email: "charlie@test.com",
            age: 28,
            active: true,
          });
          expect(user.uid).toBe("u3");
          expect(user.displayName).toBe("Charlie");
          expect(user.email).toBe("charlie@test.com");
          expect(user.age).toBe(28);
          expect(user.active).toBe(true);
        },
      },
      {
        name: "should throw InvalidArgumentError when a required field is missing",
        async run(ctx) {
          await expect(repo(ctx).create({ uid: "u3" })).rejects.toThrow(InvalidArgumentError);
        },
      },
      {
        name: "should compute and persist an etag",
        async run(ctx) {
          const user = await repo(ctx).create({
            uid: "u3",
            displayName: "Charlie",
            email: "charlie@test.com",
            age: 28,
          });
          expect(user.etag).toBeTruthy();
          expect(typeof user.etag).toBe("string");
          expect((await repo(ctx).get({ uid: "u3" })).etag).toBe(user.etag);
        },
      },
      {
        name: "should use a custom etag function when provided",
        async run(ctx) {
          const user = await repo(ctx, { etag: { fn: () => "custom-etag-value" } }).create({
            uid: "u3",
            email: "charlie@test.com",
          });
          expect(user.etag).toBe("custom-etag-value");
        },
      },
      {
        name: "should allow custom etag functions to apply a field mask",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const maskedRepo = repo(ctx, {
            etag: {
              fn: (schema, msg) => defaultEtagFn(schema, msg, { fieldMask: mask }),
            },
          });

          const user1 = await maskedRepo.create(
            { uid: "u3", displayName: "Charlie", email: "charlie@test.com" },
            { validateOnly: true },
          );
          const user2 = await maskedRepo.create(
            { uid: "u3", displayName: "Changed", email: "charlie@test.com" },
            { validateOnly: true },
          );

          expect(user1.etag).toBeTruthy();
          expect(user1.etag).toBe(user2.etag);
        },
      },
      {
        name: "should support a custom etagField",
        async run(ctx) {
          const user = await repo(ctx, { etag: { field: "secret" } }).create({
            uid: "u3",
            email: "charlie@test.com",
          });
          expect(user.secret).toBeTruthy();
          expect(user.etag).toBe("");
          expect((await repo(ctx, { etag: { field: "secret" } }).get({ uid: "u3" })).secret).toBe(
            user.secret,
          );
        },
      },
      {
        name: "should not mutate the input object",
        async run(ctx) {
          const input = { uid: "u3", email: "charlie@test.com", etag: "" };
          await repo(ctx).create(input);
          expect(input.etag).toBe("");
        },
      },
      {
        name: "should support validateOnly without persisting",
        async run(ctx) {
          const user = await repo(ctx).create(
            { uid: "u3", email: "charlie@test.com" },
            { validateOnly: true },
          );
          expect(user.uid).toBe("u3");
          expect(user.etag).toBeTruthy();
          await expect(repo(ctx).get({ uid: "u3" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should validate required fields even with validateOnly",
        async run(ctx) {
          await expect(repo(ctx).create({ uid: "u3" }, { validateOnly: true })).rejects.toThrow(
            InvalidArgumentError,
          );
        },
      },
      {
        name: "should apply readMask to created resource",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const user = await repo(ctx).create(
            { uid: "u3", displayName: "Charlie", email: "charlie@test.com", age: 28 },
            { readMask: mask },
          );
          expect(user.uid).toBe("u3");
          expect(user.email).toBe("charlie@test.com");
          expect(user.displayName).toBe("");
          expect(user.age).toBe(0);
        },
      },
      {
        name: "should apply readMask with validateOnly",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const user = await repo(ctx).create(
            { uid: "u3", displayName: "Charlie", email: "charlie@test.com", age: 28 },
            { validateOnly: true, readMask: mask },
          );
          expect(user.uid).toBe("u3");
          expect(user.email).toBe("charlie@test.com");
          expect(user.displayName).toBe("");
          expect(user.age).toBe(0);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const user = await repo(ctx).create(
              { uid: "u3", email: "charlie@test.com" },
              { transaction: tx },
            );
            expect(user.uid).toBe("u3");
            expect((await repo(ctx).get({ uid: "u3" }, { transaction: tx })).uid).toBe("u3");
          });
          expect((await repo(ctx).get({ uid: "u3" })).uid).toBe("u3");
        },
      },
      {
        name: "should throw AlreadyExistsError when creating a resource with a duplicate identifier",
        async run(ctx) {
          await expect(
            repo(ctx).create({ uid: "u1", displayName: "Duplicate", email: "dup@test.com" }),
          ).rejects.toThrow(AlreadyExistsError);
        },
      },
      {
        name: "should support columns name mapping on create",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE);
          const mappedRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
          });
          const user = await mappedRepo.create({
            uid: "u3",
            displayName: "Charlie",
            email: "charlie@test.com",
            age: 28,
            active: true,
          });
          expect(user.uid).toBe("u3");
          expect(user.displayName).toBe("Charlie");
          expect((await mappedRepo.get({ uid: "u3" })).email).toBe("charlie@test.com");
        },
      },
    ],
  },
  {
    group: "list",
    cases: [
      {
        name: "should return all resources when no filter",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list();
          expect(result.results).toHaveLength(5);
          expect(result.nextPageToken).toBe("");
        },
      },
      {
        name: "should filter resources by query string",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list("age > 28");
          expect(result.results).toHaveLength(2);
          expect(result.results.map((r) => r.uid).sort()).toEqual(["u1", "u3"]);
        },
      },
      {
        name: "should filter resources by partial object",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list({ uid: "u1" });
          expect(result.results).toHaveLength(1);
          expect(result.results[0].uid).toBe("u1");
        },
      },
      {
        name: "should respect pageSize",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list(undefined, { pageSize: 2 });
          expect(result.results).toHaveLength(2);
          expect(result.nextPageToken).not.toBe("");
        },
      },
      {
        name: "should return nextPageToken when more results exist",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list(undefined, { pageSize: 3 });
          expect(result.results).toHaveLength(3);
          expect(result.nextPageToken).not.toBe("");
        },
      },
      {
        name: "should return empty nextPageToken on last page",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list(undefined, { pageSize: 10 });
          expect(result.results).toHaveLength(5);
          expect(result.nextPageToken).toBe("");
        },
      },
      {
        name: "should paginate with pageToken",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const page1 = await repo(ctx).list(undefined, { pageSize: 2, orderBy: "uid" });
          expect(page1.results.map((r) => r.uid)).toEqual(["u1", "u2"]);

          const page2 = await repo(ctx).list(undefined, {
            pageSize: 2,
            pageToken: decodePageToken(page1.nextPageToken),
            orderBy: "uid",
          });
          expect(page2.results.map((r) => r.uid)).toEqual(["u3", "u4"]);

          const page3 = await repo(ctx).list(undefined, {
            pageSize: 2,
            pageToken: decodePageToken(page2.nextPageToken),
            orderBy: "uid",
          });
          expect(page3.results.map((r) => r.uid)).toEqual(["u5"]);
          expect(page3.nextPageToken).toBe("");
        },
      },
      {
        name: "should clamp pageSize to maxPageSize",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx, { pagination: { maxSize: 3 } }).list(undefined, {
            pageSize: 100,
          });
          expect(result.results).toHaveLength(3);
          expect(result.nextPageToken).not.toBe("");
        },
      },
      {
        name: "should use defaultPageSize when not specified",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx, { pagination: { defaultSize: 2 } }).list();
          expect(result.results).toHaveLength(2);
          expect(result.nextPageToken).not.toBe("");
        },
      },
      {
        name: "should combine filter with pagination",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          // 4 active users: u1(30), u3(35), u4(22), u5(28) — page through them
          const page1 = await repo(ctx).list("active = true", {
            pageSize: 2,
            orderBy: "uid",
          });
          expect(page1.results).toHaveLength(2);
          expect(page1.results.map((r) => r.uid)).toEqual(["u1", "u3"]);
          expect(page1.nextPageToken).not.toBe("");

          const page2 = await repo(ctx).list("active = true", {
            pageSize: 2,
            pageToken: decodePageToken(page1.nextPageToken),
            orderBy: "uid",
          });
          expect(page2.results).toHaveLength(2);
          expect(page2.results.map((r) => r.uid)).toEqual(["u4", "u5"]);
          expect(page2.nextPageToken).toBe("");
        },
      },
      {
        name: "should support orderBy",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list(undefined, { orderBy: "age desc" });
          expect(result.results[0].age).toBe(35);
          expect(result.results[result.results.length - 1].age).toBe(22);
        },
      },
      {
        name: "should support columns name mapping on list",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE, [
            MAPPED_USER,
            {
              user_id: "u2",
              name: "Bob",
              email_addr: "bob@test.com",
              user_age: 25,
              is_active: false,
            },
          ]);
          const mappedRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
          });
          const result = await mappedRepo.list(undefined, { orderBy: "display_name desc" });
          expect(result.results.map((r) => r.displayName)).toEqual(["Bob", "Alice"]);
        },
      },
      {
        name: "should apply readMask to results",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const result = await repo(ctx).list(undefined, { readMask: mask });
          for (const user of result.results) {
            expect(user.uid).toBeTruthy();
            expect(user.email).toBeTruthy();
            expect(user.displayName).toBe("");
            expect(user.age).toBe(0);
          }
        },
      },
      {
        name: "should include totalSize when showTotalSize is true",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const result = await repo(ctx).list(undefined, { pageSize: 2, showTotalSize: true });
          expect(result.totalSize).toBe(5);
          expect(result.results).toHaveLength(2);
        },
      },
      {
        name: "should not include totalSize by default",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          expect((await repo(ctx).list()).totalSize).toBeUndefined();
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          await ctx.engine.transaction(async (tx) => {
            expect((await repo(ctx).list(undefined, { transaction: tx })).results).toHaveLength(5);
          });
        },
      },
    ],
  },
  {
    group: "update",
    cases: [
      {
        name: "should update and return the resource",
        async run(ctx) {
          const user = await repo(ctx).update(
            { uid: "u1" },
            { displayName: "Alice Updated", email: "alice@test.com" },
          );
          expect(user.displayName).toBe("Alice Updated");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice Updated");
        },
      },
      {
        name: "should update a resource by filter string",
        async run(ctx) {
          const user = await repo(ctx).update('uid = "u1"', {
            displayName: "Filter Updated",
            email: "alice@test.com",
          });
          expect(user.displayName).toBe("Filter Updated");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Filter Updated");
        },
      },
      {
        name: "should throw NotFoundError when no match",
        async run(ctx) {
          await expect(
            repo(ctx).update({ uid: "u999" }, { displayName: "Nope", email: "nope@test.com" }),
          ).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should recompute etag after update",
        async run(ctx) {
          const created = await repo(ctx).create({
            uid: "u3",
            email: "charlie@test.com",
            displayName: "Charlie",
          });
          const updated = await repo(ctx).update(
            { uid: "u3" },
            { displayName: "Charlie Updated", email: "charlie@test.com" },
          );
          expect(updated.etag).toBeTruthy();
          expect(updated.etag).not.toBe(created.etag);
          expect((await repo(ctx).get({ uid: "u3" })).etag).toBe(updated.etag);
        },
      },
      {
        name: "should apply updateMask to limit updated fields",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["display_name"]);
          const user = await repo(ctx).update(
            { uid: "u1" },
            { displayName: "Masked Update", age: 99, email: "new@test.com" },
            { updateMask: mask },
          );
          expect(user.displayName).toBe("Masked Update");
          expect(user.age).toBe(30);
          expect(user.email).toBe("alice@test.com");
        },
      },
      {
        name: "should use defaultUpdateMask when not specified",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["display_name"]);
          const user = await repo(ctx, { fieldMasks: { update: mask } }).update(
            { uid: "u1" },
            { displayName: "Default Mask", age: 99, email: "new@test.com" },
          );
          expect(user.displayName).toBe("Default Mask");
          expect(user.age).toBe(30);
        },
      },
      {
        name: "should throw InvalidArgumentError when updating immutable fields",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["immutable_field"]);
          await expect(
            repo(ctx).update(
              { uid: "u1" },
              { immutableField: "changed", email: "alice@test.com" },
              { updateMask: mask },
            ),
          ).rejects.toThrow(InvalidArgumentError);
        },
      },
      {
        name: "should ignore output-only fields for wildcard updates",
        async run(ctx) {
          const user = await repo(ctx).update(
            { uid: "u1" },
            {
              displayName: "Alice Updated",
              email: "alice@test.com",
              etag: "client-supplied-etag",
            },
          );
          expect(user.displayName).toBe("Alice Updated");
          expect(user.etag).toBeTruthy();
          expect(user.etag).not.toBe("client-supplied-etag");
          expect((await repo(ctx).get({ uid: "u1" })).etag).toBe(user.etag);
        },
      },
      {
        name: "should support validateOnly without persisting",
        async run(ctx) {
          const user = await repo(ctx).update(
            { uid: "u1" },
            { displayName: "Validate Only", email: "alice@test.com" },
            { validateOnly: true },
          );
          expect(user.displayName).toBe("Validate Only");
          expect(user.etag).toBeTruthy();
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice");
        },
      },
      {
        name: "should apply readMask to returned resource",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "display_name"]);
          const user = await repo(ctx).update(
            { uid: "u1" },
            { displayName: "Read Masked", email: "alice@test.com" },
            { readMask: mask },
          );
          expect(user.uid).toBe("u1");
          expect(user.displayName).toBe("Read Masked");
          expect(user.email).toBe("");
          expect(user.age).toBe(0);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const user = await repo(ctx).update(
              { uid: "u1" },
              { displayName: "Tx Update", email: "alice@test.com" },
              { transaction: tx },
            );
            expect(user.displayName).toBe("Tx Update");
          });
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Tx Update");
        },
      },
      {
        name: "should support columns name mapping",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE_2, [MAPPED_USER]);
          const mappedRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE_2,
            columns: COLUMNS,
          });
          const user = await mappedRepo.update(
            { uid: "u1" },
            { displayName: "Alice Updated", email: "alice@test.com" },
          );
          expect(user.uid).toBe("u1");
          expect(user.displayName).toBe("Alice Updated");
        },
      },
      {
        name: "should use a custom etag function on update",
        async run(ctx) {
          const user = await repo(ctx, { etag: { fn: () => "custom-update-etag" } }).update(
            { uid: "u1" },
            { displayName: "Alice Updated", email: "alice@test.com" },
          );
          expect(user.etag).toBe("custom-update-etag");
          expect((await repo(ctx).get({ uid: "u1" })).etag).toBe("custom-update-etag");
        },
      },
      {
        name: "should support a custom etagField on update",
        async run(ctx) {
          const customRepo = repo(ctx, { etag: { field: "secret" } });
          const created = await customRepo.create({ uid: "u3", email: "charlie@test.com" });
          const updated = await customRepo.update(
            { uid: "u3" },
            { displayName: "Charlie Updated", email: "charlie@test.com" },
          );
          expect(updated.secret).toBeTruthy();
          expect(updated.secret).not.toBe(created.secret);
          expect(updated.etag).toBe("");
        },
      },
    ],
  },
  {
    group: "delete",
    cases: [
      {
        name: "should delete an existing resource",
        async run(ctx) {
          await repo(ctx).delete({ uid: "u1" });
          await expect(repo(ctx).get({ uid: "u1" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should delete a resource by filter string",
        async run(ctx) {
          await repo(ctx).delete('uid = "u2"');
          await expect(repo(ctx).get({ uid: "u2" })).rejects.toThrow(NotFoundError);
          // u1 should still exist
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
        },
      },
      {
        name: "should support validateOnly without deleting",
        async run(ctx) {
          await repo(ctx).delete({ uid: "u1" }, { validateOnly: true });
          // Resource should still exist
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
        },
      },
      {
        name: "should throw NotFoundError with validateOnly when no match",
        async run(ctx) {
          await expect(repo(ctx).delete({ uid: "u999" }, { validateOnly: true })).rejects.toThrow(
            NotFoundError,
          );
        },
      },
      {
        name: "should throw NotFoundError when no match",
        async run(ctx) {
          await expect(repo(ctx).delete({ uid: "u999" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should support columns name mapping",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE, [MAPPED_USER]);
          const mappedRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
          });
          await mappedRepo.delete({ uid: "u1" });
          await expect(mappedRepo.get({ uid: "u1" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            await repo(ctx).delete({ uid: "u1" }, { transaction: tx });
            await expect(repo(ctx).get({ uid: "u1" }, { transaction: tx })).rejects.toThrow(
              NotFoundError,
            );
          });
          await expect(repo(ctx).get({ uid: "u1" })).rejects.toThrow(NotFoundError);
        },
      },
    ],
  },
  {
    group: "count",
    cases: [
      {
        name: "should count all resources when no filter",
        async run(ctx) {
          expect(await repo(ctx).count()).toBe(2);
        },
      },
      {
        name: "should count resources matching a filter string",
        async run(ctx) {
          expect(await repo(ctx).count("age >= 30")).toBe(1);
        },
      },
      {
        name: "should count resources matching a partial object",
        async run(ctx) {
          expect(await repo(ctx).count({ uid: "u1" })).toBe(1);
        },
      },
      {
        name: "should return 0 when no match",
        async run(ctx) {
          expect(await repo(ctx).count("age > 100")).toBe(0);
        },
      },
      {
        name: "should support columns name mapping",
        async run(ctx) {
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE, [
            MAPPED_USER,
            {
              user_id: "u2",
              name: "Bob",
              email_addr: "bob@test.com",
              user_age: 25,
              is_active: false,
            },
          ]);
          const mappedRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE,
            columns: COLUMNS,
          });
          expect(await mappedRepo.count("age >= 30")).toBe(1);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            expect(await repo(ctx).count(undefined, { transaction: tx })).toBe(2);
          });
        },
      },
    ],
  },
  {
    group: "batchGet",
    cases: [
      {
        name: "should retrieve multiple resources in request order",
        async run(ctx) {
          await ctx.insertUsers(EXTRA_USERS);
          const results = await repo(ctx).batchGet([{ uid: "u2" }, { uid: "u1" }]);
          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u2");
          expect(results[1].uid).toBe("u1");
        },
      },
      {
        name: "should throw NotFoundError if any resource is missing",
        async run(ctx) {
          await expect(repo(ctx).batchGet([{ uid: "u1" }, { uid: "u999" }])).rejects.toThrow(
            NotFoundError,
          );
        },
      },
      {
        name: "should apply readMask to all results",
        async run(ctx) {
          const results = await repo(ctx).batchGet([{ uid: "u1" }, { uid: "u2" }], {
            readMask: fieldMask(TestUserSchema, ["uid", "email"]),
          });
          expect(results).toHaveLength(2);
          for (const r of results) {
            expect(r.uid).toBeTruthy();
            expect(r.email).toBeTruthy();
            expect(r.displayName).toBe("");
          }
        },
      },
      {
        name: "should work with filter strings",
        async run(ctx) {
          const results = await repo(ctx).batchGet(['uid = "u1"', 'uid = "u2"']);
          expect(results).toHaveLength(2);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const results = await repo(ctx).batchGet([{ uid: "u1" }, { uid: "u2" }], {
              transaction: tx,
            });
            expect(results).toHaveLength(2);
          });
        },
      },
    ],
  },
  {
    group: "batchCreate",
    cases: [
      {
        name: "should create multiple resources and return them",
        async run(ctx) {
          const results = await repo(ctx).batchCreate([
            { uid: "u3", email: "charlie@test.com", displayName: "Charlie" },
            { uid: "u4", email: "diana@test.com", displayName: "Diana" },
          ]);
          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u3");
          expect(results[1].uid).toBe("u4");

          // Verify they exist in DB
          const u3 = await repo(ctx).get({ uid: "u3" });
          expect(u3.email).toBe("charlie@test.com");
          const u4 = await repo(ctx).get({ uid: "u4" });
          expect(u4.email).toBe("diana@test.com");
        },
      },
      {
        name: "should validate all required fields before inserting any",
        async run(ctx) {
          await expect(
            repo(ctx).batchCreate([
              { uid: "u3", email: "charlie@test.com" },
              { uid: "u4", email: "" }, // missing required email
            ]),
          ).rejects.toThrow(InvalidArgumentError);

          // Neither should exist
          await expect(repo(ctx).get({ uid: "u3" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should throw AlreadyExistsError if any duplicate IDENTIFIER",
        async run(ctx) {
          await expect(
            repo(ctx).batchCreate([
              { uid: "u1", email: "dupe@test.com" }, // u1 already exists
              { uid: "u3", email: "charlie@test.com" },
            ]),
          ).rejects.toThrow(AlreadyExistsError);
        },
      },
      {
        name: "should compute etags for all resources",
        async run(ctx) {
          const results = await repo(ctx).batchCreate([
            { uid: "u3", email: "charlie@test.com" },
            { uid: "u4", email: "diana@test.com" },
          ]);
          for (const r of results) {
            expect(r.etag).toBeTruthy();
          }
        },
      },
      {
        name: "should support validateOnly",
        async run(ctx) {
          const results = await repo(ctx).batchCreate(
            [
              { uid: "u3", email: "charlie@test.com" },
              { uid: "u4", email: "diana@test.com" },
            ],
            { validateOnly: true },
          );
          expect(results).toHaveLength(2);
          expect(results[0].etag).toBeTruthy();

          // Should not exist in DB
          await expect(repo(ctx).get({ uid: "u3" })).rejects.toThrow(NotFoundError);
          await expect(repo(ctx).get({ uid: "u4" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should apply readMask",
        async run(ctx) {
          const results = await repo(ctx).batchCreate(
            [{ uid: "u3", email: "charlie@test.com", displayName: "Charlie" }],
            { readMask: fieldMask(TestUserSchema, ["uid", "email"]) },
          );
          expect(results[0].uid).toBe("u3");
          expect(results[0].email).toBe("charlie@test.com");
          expect(results[0].displayName).toBe("");
        },
      },
      {
        name: "should be atomic — if one fails, none are created",
        async run(ctx) {
          await expect(
            repo(ctx).batchCreate([
              { uid: "u3", email: "charlie@test.com" },
              { uid: "u1", email: "dupe@test.com" }, // duplicate
            ]),
          ).rejects.toThrow();

          await expect(repo(ctx).get({ uid: "u3" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const results = await repo(ctx).batchCreate(
              [{ uid: "u3", email: "charlie@test.com" }],
              { transaction: tx },
            );
            expect(results).toHaveLength(1);
          });
          const u3 = await repo(ctx).get({ uid: "u3" });
          expect(u3.email).toBe("charlie@test.com");
        },
      },
    ],
  },
  {
    group: "batchUpdate",
    cases: [
      {
        name: "should update multiple resources",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: { uid: "u1" },
              resource: { displayName: "Alice Updated", email: "alice@test.com" },
            },
            {
              query: { uid: "u2" },
              resource: { displayName: "Bob Updated", email: "bob@test.com" },
            },
          ]);
          expect(results).toHaveLength(2);
          expect(results[0].displayName).toBe("Alice Updated");
          expect(results[1].displayName).toBe("Bob Updated");

          // Verify in DB
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice Updated");
          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob Updated");
        },
      },
      {
        name: "should match and return results in query order when update payloads omit identifiers",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: { uid: "u2" },
              resource: { displayName: "Bob Reordered", email: "bob@test.com" },
            },
            {
              query: { uid: "u1" },
              resource: { displayName: "Alice Reordered", email: "alice@test.com" },
            },
          ]);

          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u2");
          expect(results[0].displayName).toBe("Bob Reordered");
          expect(results[1].uid).toBe("u1");
          expect(results[1].displayName).toBe("Alice Reordered");

          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob Reordered");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice Reordered");
        },
      },
      {
        name: "should not clobber unrelated fields",
        async run(ctx) {
          // u1 has age=30, active=true; u2 has age=25, active=false
          const results = await repo(ctx).batchUpdate([
            {
              query: { uid: "u1" },
              resource: { displayName: "Alice New", email: "alice@test.com" },
              updateMask: fieldMask(TestUserSchema, ["display_name"]),
            },
            {
              query: { uid: "u2" },
              resource: { displayName: "Bob New", email: "bob@test.com" },
              updateMask: fieldMask(TestUserSchema, ["display_name"]),
            },
          ]);
          expect(results[0].displayName).toBe("Alice New");
          expect(results[1].displayName).toBe("Bob New");

          // Verify unrelated fields are preserved
          const u1 = await repo(ctx).get({ uid: "u1" });
          expect(u1.age).toBe(30);
          expect(u1.active).toBe(true);
          expect(u1.email).toBe("alice@test.com");
          const u2 = await repo(ctx).get({ uid: "u2" });
          expect(u2.age).toBe(25);
          expect(u2.active).toBe(false);
          expect(u2.email).toBe("bob@test.com");
        },
      },
      {
        name: "should update with filter strings",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: 'uid = "u1"',
              resource: { displayName: "Alice Filtered", email: "alice@test.com" },
            },
            {
              query: 'uid = "u2"',
              resource: { displayName: "Bob Filtered", email: "bob@test.com" },
            },
          ]);
          expect(results).toHaveLength(2);
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice Filtered");
          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob Filtered");
        },
      },
      {
        name: "should match the correct records for non-identifier partial queries",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: { email: "bob@test.com" },
              resource: { displayName: "Bob By Email", email: "bob@test.com" },
            },
            {
              query: { email: "alice@test.com" },
              resource: { displayName: "Alice By Email", email: "alice@test.com" },
            },
          ]);

          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u2");
          expect(results[0].displayName).toBe("Bob By Email");
          expect(results[1].uid).toBe("u1");
          expect(results[1].displayName).toBe("Alice By Email");

          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob By Email");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice By Email");
        },
      },
      {
        name: "should return results in filter-string query order",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: 'email = "bob@test.com"',
              resource: { displayName: "Bob String Ordered", email: "bob@test.com" },
            },
            {
              query: 'email = "alice@test.com"',
              resource: { displayName: "Alice String Ordered", email: "alice@test.com" },
            },
          ]);

          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u2");
          expect(results[0].displayName).toBe("Bob String Ordered");
          expect(results[1].uid).toBe("u1");
          expect(results[1].displayName).toBe("Alice String Ordered");

          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob String Ordered");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice String Ordered");
        },
      },
      {
        name: "should return results in order for mixed string and partial-object queries",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate([
            {
              query: 'email = "bob@test.com"',
              resource: { displayName: "Bob Mixed Ordered", email: "bob@test.com" },
            },
            {
              query: { uid: "u1" },
              resource: { displayName: "Alice Mixed Ordered", email: "alice@test.com" },
            },
          ]);

          expect(results).toHaveLength(2);
          expect(results[0].uid).toBe("u2");
          expect(results[0].displayName).toBe("Bob Mixed Ordered");
          expect(results[1].uid).toBe("u1");
          expect(results[1].displayName).toBe("Alice Mixed Ordered");

          expect((await repo(ctx).get({ uid: "u2" })).displayName).toBe("Bob Mixed Ordered");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice Mixed Ordered");
        },
      },
      {
        name: "should throw NotFoundError if any resource is missing",
        async run(ctx) {
          await expect(
            repo(ctx).batchUpdate([
              {
                query: { uid: "u1" },
                resource: { displayName: "Updated", email: "alice@test.com" },
              },
              {
                query: { uid: "u999" },
                resource: { displayName: "Missing", email: "missing@test.com" },
              },
            ]),
          ).rejects.toThrow(NotFoundError);

          // u1 should not be updated (atomic)
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice");
        },
      },
      {
        name: "should recompute etags",
        async run(ctx) {
          const before = await repo(ctx).get({ uid: "u1" });
          const results = await repo(ctx).batchUpdate([
            {
              query: { uid: "u1" },
              resource: { displayName: "New Name", email: "alice@test.com" },
            },
          ]);
          expect(results[0].etag).toBeTruthy();
          expect(results[0].etag).not.toBe(before.etag);
        },
      },
      {
        name: "should support validateOnly",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate(
            [
              {
                query: { uid: "u1" },
                resource: { displayName: "Validated", email: "alice@test.com" },
              },
            ],
            { validateOnly: true },
          );
          expect(results[0].displayName).toBe("Validated");

          // Should not be persisted
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice");
        },
      },
      {
        name: "should apply readMask",
        async run(ctx) {
          const results = await repo(ctx).batchUpdate(
            [
              {
                query: { uid: "u1" },
                resource: { displayName: "Updated", email: "alice@test.com" },
              },
            ],
            { readMask: fieldMask(TestUserSchema, ["uid", "display_name"]) },
          );
          expect(results[0].uid).toBe("u1");
          expect(results[0].displayName).toBe("Updated");
          expect(results[0].email).toBe("");
        },
      },
      {
        name: "should be atomic",
        async run(ctx) {
          await expect(
            repo(ctx).batchUpdate([
              {
                query: { uid: "u1" },
                resource: { displayName: "Updated", email: "alice@test.com" },
              },
              {
                query: { uid: "u999" },
                resource: { displayName: "Missing", email: "no@test.com" },
              },
            ]),
          ).rejects.toThrow(NotFoundError);

          // u1 should not be updated
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice");
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            const results = await repo(ctx).batchUpdate(
              [
                {
                  query: { uid: "u1" },
                  resource: { displayName: "Tx Updated", email: "alice@test.com" },
                },
              ],
              { transaction: tx },
            );
            expect(results[0].displayName).toBe("Tx Updated");
          });
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Tx Updated");
        },
      },
    ],
  },
  {
    group: "batchDelete",
    cases: [
      {
        name: "should delete multiple resources",
        async run(ctx) {
          await repo(ctx).batchDelete([{ uid: "u1" }, { uid: "u2" }]);
          await expect(repo(ctx).get({ uid: "u1" })).rejects.toThrow(NotFoundError);
          await expect(repo(ctx).get({ uid: "u2" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should delete with filter strings",
        async run(ctx) {
          await repo(ctx).batchDelete(['uid = "u1"', 'uid = "u2"']);
          await expect(repo(ctx).get({ uid: "u1" })).rejects.toThrow(NotFoundError);
          await expect(repo(ctx).get({ uid: "u2" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should throw NotFoundError if any resource is missing",
        async run(ctx) {
          await expect(repo(ctx).batchDelete([{ uid: "u1" }, { uid: "u999" }])).rejects.toThrow(
            NotFoundError,
          );

          // u1 should still exist (atomic)
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
        },
      },
      {
        name: "should support validateOnly",
        async run(ctx) {
          await repo(ctx).batchDelete([{ uid: "u1" }, { uid: "u2" }], { validateOnly: true });
          // Both should still exist
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
          expect((await repo(ctx).get({ uid: "u2" })).uid).toBe("u2");
        },
      },
      {
        name: "should be atomic",
        async run(ctx) {
          await expect(repo(ctx).batchDelete([{ uid: "u1" }, { uid: "u999" }])).rejects.toThrow(
            NotFoundError,
          );

          // u1 should still exist
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
        },
      },
      {
        name: "should work within a transaction",
        async run(ctx) {
          await ctx.engine.transaction(async (tx) => {
            await repo(ctx).batchDelete([{ uid: "u1" }], { transaction: tx });
            await expect(repo(ctx).get({ uid: "u1" }, { transaction: tx })).rejects.toThrow(
              NotFoundError,
            );
          });
          await expect(repo(ctx).get({ uid: "u1" })).rejects.toThrow(NotFoundError);
        },
      },
    ],
  },
  {
    group: "transaction rollback",
    cases: [
      {
        name: "should rollback create when transaction throws",
        async run(ctx) {
          await expect(
            ctx.engine.transaction(async (tx) => {
              await repo(ctx).create(
                { uid: "u3", email: "rollback@test.com" },
                { transaction: tx },
              );
              // Verify it exists within the transaction
              expect((await repo(ctx).get({ uid: "u3" }, { transaction: tx })).uid).toBe("u3");
              throw new Error("force rollback");
            }),
          ).rejects.toThrow("force rollback");
          // Should not exist after rollback
          await expect(repo(ctx).get({ uid: "u3" })).rejects.toThrow(NotFoundError);
        },
      },
      {
        name: "should rollback update when transaction throws",
        async run(ctx) {
          await expect(
            ctx.engine.transaction(async (tx) => {
              await repo(ctx).update(
                { uid: "u1" },
                { displayName: "Rolled Back", email: "alice@test.com" },
                { transaction: tx },
              );
              throw new Error("force rollback");
            }),
          ).rejects.toThrow("force rollback");
          expect((await repo(ctx).get({ uid: "u1" })).displayName).toBe("Alice");
        },
      },
      {
        name: "should rollback delete when transaction throws",
        async run(ctx) {
          await expect(
            ctx.engine.transaction(async (tx) => {
              await repo(ctx).delete({ uid: "u1" }, { transaction: tx });
              // Verify deleted within the transaction
              await expect(repo(ctx).get({ uid: "u1" }, { transaction: tx })).rejects.toThrow(
                NotFoundError,
              );
              throw new Error("force rollback");
            }),
          ).rejects.toThrow("force rollback");
          // Should still exist after rollback
          expect((await repo(ctx).get({ uid: "u1" })).uid).toBe("u1");
        },
      },
    ],
  },
  {
    group: "columns: ignore",
    cases: [
      {
        name: "should not include ignored fields in serialized rows",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: { secret: { ignore: true } },
          });
          await r.create({ uid: "ig1", email: "ig@test.com", secret: "hidden" });
          // The ignored field should get proto3 default on read-back
          const fetched = await r.get({ uid: "ig1" });
          expect(fetched.secret).toBe("");
          expect(fetched.uid).toBe("ig1");
          expect(fetched.email).toBe("ig@test.com");
        },
      },
      {
        name: "should work with update on ignored fields",
        async run(ctx) {
          const r = repo(ctx, {
            columns: { secret: { ignore: true } },
          });
          await r.create({ uid: "ig2", email: "ig2@test.com" });
          const updated = await r.update(
            { uid: "ig2" },
            { displayName: "Updated", email: "ig2@test.com" },
          );
          expect(updated.displayName).toBe("Updated");
          expect(updated.secret).toBe("");
        },
      },
      {
        name: "should work with list on ignored fields",
        async run(ctx) {
          const r = repo(ctx, {
            columns: { secret: { ignore: true } },
          });
          await r.create({ uid: "ig3", email: "ig3@test.com", secret: "hidden" });
          const { results } = await r.list();
          expect(results.length).toBeGreaterThanOrEqual(1);
          const found = results.find((u) => u.uid === "ig3");
          expect(found).toBeDefined();
          expect(found!.secret).toBe("");
        },
      },
    ],
  },
  {
    group: "columns: serialize",
    cases: [
      {
        name: "should use custom serialize/deserialize functions on write and read",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              settings: {
                serialize: ({ field, value }) =>
                  value == null || !field.message ? null : toJsonString(field.message, value),
                deserialize: ({ field, value }) =>
                  value == null ||
                  typeof value !== "string" ||
                  field.message !== TestUserSettingsSchema
                    ? undefined
                    : fromJsonString(TestUserSettingsSchema, value),
              },
            },
          });
          const created = await r.create({
            uid: "ser1",
            email: "ser@test.com",
            settings: { theme: "dark", notificationsEnabled: true, language: "en" },
          });
          expect(created.settings).toBeDefined();
          expect(created.settings!.theme).toBe("dark");
          expect(created.settings!.notificationsEnabled).toBe(true);
          expect(created.settings!.language).toBe("en");

          // Read back
          const fetched = await r.get({ uid: "ser1" });
          expect(fetched.settings!.theme).toBe("dark");
          expect(fetched.settings!.notificationsEnabled).toBe(true);
          expect(fetched.settings!.language).toBe("en");
        },
      },
      {
        name: "should use protobuf binary codecs on write and read",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              settings: {
                name: "settingsBin",
                serialize: ({ field, value }) =>
                  value == null || !field.message ? null : toBinary(field.message, value),
                deserialize: ({ field, value }) => {
                  const bytes = asBinary(value);
                  return field.message !== TestUserSettingsSchema || bytes == null
                    ? undefined
                    : fromBinary(TestUserSettingsSchema, bytes);
                },
              },
            },
          });
          const created = await r.create({
            uid: "ser-bin-1",
            email: "ser-bin@test.com",
            settings: { theme: "dark", notificationsEnabled: true, language: "en" },
          });

          expect(created.settings).toBeDefined();
          expect(created.settings!.theme).toBe("dark");
          expect(created.settings!.notificationsEnabled).toBe(true);
          expect(created.settings!.language).toBe("en");

          const fetched = await r.get({ uid: "ser-bin-1" });
          expect(fetched.settings).toBeDefined();
          expect(fetched.settings!.theme).toBe("dark");
          expect(fetched.settings!.notificationsEnabled).toBe(true);
          expect(fetched.settings!.language).toBe("en");
        },
      },
      {
        name: "should handle null nested message with custom serialization hooks",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              settings: {
                serialize: ({ field, value }) =>
                  value == null || !field.message ? null : toJsonString(field.message, value),
                deserialize: ({ field, value }) =>
                  value == null ||
                  typeof value !== "string" ||
                  field.message !== TestUserSettingsSchema
                    ? undefined
                    : fromJsonString(TestUserSettingsSchema, value),
              },
            },
          });
          await r.create({ uid: "ser2", email: "ser2@test.com" });
          const fetched = await r.get({ uid: "ser2" });
          expect(fetched.settings).toBeUndefined();
        },
      },
      {
        name: "should pass read and write operations to column hooks",
        async run(ctx) {
          await ctx.insertUsers([]);
          const serializeOps: string[] = [];
          const deserializeOps: string[] = [];
          const r = repo(ctx, {
            columns: {
              settings: {
                serialize: ({ field, operation, value }) => {
                  serializeOps.push(operation);
                  return value == null || !field.message
                    ? null
                    : toJsonString(field.message, value);
                },
                deserialize: ({ field, operation, value }) => {
                  deserializeOps.push(operation);
                  return value == null ||
                    typeof value !== "string" ||
                    field.message !== TestUserSettingsSchema
                    ? undefined
                    : fromJsonString(TestUserSettingsSchema, value);
                },
              },
            },
          });
          await r.create({
            uid: "ser3",
            email: "ser3@test.com",
            settings: { theme: "light", notificationsEnabled: false, language: "en" },
          });
          await r.get({ uid: "ser3" });
          await r.list({ uid: "ser3" });
          const updated = await r.update(
            { uid: "ser3" },
            {
              email: "ser3@test.com",
              settings: { theme: "dark", notificationsEnabled: true, language: "fr" },
            },
          );
          expect(updated.settings!.theme).toBe("dark");
          expect(updated.settings!.notificationsEnabled).toBe(true);
          expect(updated.settings!.language).toBe("fr");
          expect(serializeOps).toEqual(["create", "update"]);
          expect(deserializeOps).toEqual(["get", "get", "list", "get", "get"]);
        },
      },
      {
        name: "should allow clearing a custom-serialized nested message on update",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              settings: {
                serialize: ({ field, value }) =>
                  value == null || !field.message ? null : toJsonString(field.message, value),
                deserialize: ({ field, value }) =>
                  value == null ||
                  typeof value !== "string" ||
                  field.message !== TestUserSettingsSchema
                    ? undefined
                    : fromJsonString(TestUserSettingsSchema, value),
              },
            },
          });
          await r.create({
            uid: "ser4",
            email: "ser4@test.com",
            settings: { theme: "dark", notificationsEnabled: true, language: "en" },
          });

          const updated = await r.update(
            { uid: "ser4" },
            { settings: undefined },
            { updateMask: fieldMask(TestUserSchema, ["settings"]) },
          );

          expect(updated.settings).toBeUndefined();
          expect((await r.get({ uid: "ser4" })).settings).toBeUndefined();
        },
      },
    ],
  },
  {
    group: "interceptors: timestamps",
    cases: [
      {
        name: "should allow interceptors to populate timestamps on create and update",
        async run(ctx) {
          await ctx.insertUsers([]);
          const timestamps: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              const now = timestampNow();
              ictx.resource = { ...ictx.resource, createTime: now, updateTime: now };
            } else if (ictx.operation === "update") {
              ictx.resource = { ...ictx.resource, updateTime: timestampNow() };
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [timestamps] });

          const before = Date.now();
          const created = await r.create({ uid: "ts1", email: "ts@test.com" });
          const after = Date.now();

          expect(created.createTime).toBeDefined();
          expect(created.updateTime).toBeDefined();
          const createMs = Number(created.createTime!.seconds) * 1000;
          expect(createMs).toBeGreaterThanOrEqual(before - 1000);
          expect(createMs).toBeLessThanOrEqual(after + 1000);

          const updated = await r.update(
            { uid: "ts1" },
            { displayName: "Updated", email: "ts@test.com" },
          );
          expect(updated.updateTime).toBeDefined();
          expect(updated.updateTime!.seconds).toBeGreaterThanOrEqual(created.updateTime!.seconds);
          expect(updated.createTime!.seconds).toBe(created.createTime!.seconds);
        },
      },
      {
        name: "should allow interceptors to populate timestamps for batch writes",
        async run(ctx) {
          await ctx.insertUsers([]);
          const timestamps: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "batchCreate") {
              ictx.resources = ictx.resources.map((resource) => {
                const now = timestampNow();
                return { ...resource, createTime: now, updateTime: now };
              });
            } else if (ictx.operation === "batchUpdate") {
              ictx.updates = ictx.updates.map((update) => ({
                ...update,
                resource: { ...update.resource, updateTime: timestampNow() },
              }));
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [timestamps] });

          const created = await r.batchCreate([
            { uid: "ts4", email: "ts4@test.com" },
            { uid: "ts5", email: "ts5@test.com" },
          ]);
          for (const result of created) {
            expect(result.createTime).toBeDefined();
            expect(result.updateTime).toBeDefined();
          }

          await r.batchCreate([
            { uid: "ts6", email: "ts6@test.com" },
            { uid: "ts7", email: "ts7@test.com" },
          ]);

          const results = await r.batchUpdate([
            { query: { uid: "ts6" }, resource: { displayName: "Six", email: "ts6@test.com" } },
            { query: { uid: "ts7" }, resource: { displayName: "Seven", email: "ts7@test.com" } },
          ]);
          for (const result of results) {
            expect(result.updateTime).toBeDefined();
          }
        },
      },
    ],
  },
  {
    group: "interceptors: contextValues",
    cases: [
      {
        name: "should allow interceptors to set context values for downstream interceptors and column hooks",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kSecretPrefix = createContextKey("", { description: "secret prefix" });
          const seen: string[] = [];
          const setPrefix: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            ictx.contextValues.set(kSecretPrefix, "shared-ctx");
            return next(ictx);
          };
          const observe: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            seen.push(ictx.contextValues.get(kSecretPrefix));
            return next(ictx);
          };
          const r = repo(ctx, {
            columns: {
              secret: {
                serialize: ({ value, contextValues }) =>
                  typeof value !== "string" || value === ""
                    ? value
                    : `${contextValues.get(kSecretPrefix)}:${value}`,
                deserialize: ({ value, contextValues }) =>
                  typeof value !== "string"
                    ? ""
                    : value.replace(`${contextValues.get(kSecretPrefix)}:`, ""),
              },
            },
            interceptors: [setPrefix, observe],
          });

          const created = await r.create({
            uid: "ctx1",
            email: "ctx1@test.com",
            secret: "secret-value",
          });
          expect(created.secret).toBe("secret-value");

          const fetched = await r.get({ uid: "ctx1" });
          expect(fetched.secret).toBe("secret-value");
          expect(seen).toEqual(["shared-ctx", "shared-ctx"]);
        },
      },
      {
        name: "should expose default context values to interceptors and column hooks",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kSecretPrefix = createContextKey("default-ctx", { description: "secret prefix" });
          const seen: string[] = [];
          const observe: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            seen.push(ictx.contextValues.get(kSecretPrefix));
            return next(ictx);
          };
          const r = repo(ctx, {
            columns: {
              secret: {
                serialize: ({ value, contextValues }) =>
                  typeof value !== "string" || value === ""
                    ? value
                    : `${contextValues.get(kSecretPrefix)}:${value}`,
                deserialize: ({ value, contextValues }) =>
                  typeof value !== "string"
                    ? ""
                    : value.replace(`${contextValues.get(kSecretPrefix)}:`, ""),
              },
            },
            interceptors: [observe],
          });

          const created = await r.create({
            uid: "ctx2",
            email: "ctx2@test.com",
            secret: "defaulted-secret",
          });
          expect(created.secret).toBe("defaulted-secret");

          const fetched = await r.get({ uid: "ctx2" });
          expect(fetched.secret).toBe("defaulted-secret");
          expect(seen).toEqual(["default-ctx", "default-ctx"]);
        },
      },
      {
        name: "should let later interceptors override context values",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kSecretPrefix = createContextKey("", { description: "secret prefix" });
          const seen: string[] = [];
          const first: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            ictx.contextValues.set(kSecretPrefix, "first");
            return next(ictx);
          };
          const second: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            ictx.contextValues.set(kSecretPrefix, "second");
            return next(ictx);
          };
          const observe: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            seen.push(ictx.contextValues.get(kSecretPrefix));
            return next(ictx);
          };
          const r = repo(ctx, {
            columns: {
              secret: {
                serialize: ({ value, contextValues }) =>
                  typeof value !== "string" || value === ""
                    ? value
                    : `${contextValues.get(kSecretPrefix)}:${value}`,
                deserialize: ({ value, contextValues }) =>
                  typeof value !== "string"
                    ? ""
                    : value.replace(`${contextValues.get(kSecretPrefix)}:`, ""),
              },
            },
            interceptors: [first, second, observe],
          });

          const created = await r.create({
            uid: "ctx3",
            email: "ctx3@test.com",
            secret: "overridden-secret",
          });
          expect(created.secret).toBe("overridden-secret");

          const fetched = await r.get({ uid: "ctx3" });
          expect(fetched.secret).toBe("overridden-secret");
          expect(seen).toEqual(["second", "second"]);
        },
      },
      {
        name: "should create a fresh context bag for each operation",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kSeenCreate = createContextKey(false, { description: "create marker" });
          const seen: boolean[] = [];
          const marker: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              ictx.contextValues.set(kSeenCreate, true);
            }
            seen.push(ictx.contextValues.get(kSeenCreate));
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [marker] });

          await r.create({ uid: "ctx4", email: "ctx4@test.com" });
          await r.get({ uid: "ctx4" });

          expect(seen).toEqual([true, false]);
        },
      },
      {
        name: "should share context values across batch operations and column hooks",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kSecretPrefix = createContextKey("batch", { description: "secret prefix" });
          const observed: string[] = [];
          const setPrefix: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "batchCreate") {
              ictx.contextValues.set(kSecretPrefix, "batch-create");
            }
            return next(ictx);
          };
          const observe: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            observed.push(ictx.contextValues.get(kSecretPrefix));
            return next(ictx);
          };
          const r = repo(ctx, {
            columns: {
              secret: {
                serialize: ({ value, contextValues }) =>
                  typeof value !== "string" || value === ""
                    ? value
                    : `${contextValues.get(kSecretPrefix)}:${value}`,
                deserialize: ({ value, contextValues }) =>
                  typeof value !== "string"
                    ? ""
                    : value.replace(`${contextValues.get(kSecretPrefix)}:`, ""),
              },
            },
            interceptors: [setPrefix, observe],
          });

          const created = await r.batchCreate([
            { uid: "ctx5", email: "ctx5@test.com", secret: "first-secret" },
            { uid: "ctx6", email: "ctx6@test.com", secret: "second-secret" },
          ]);

          expect(created[0].secret).toBe("first-secret");
          expect(created[1].secret).toBe("second-secret");
          expect(observed).toEqual(["batch-create"]);
        },
      },
    ],
  },
  {
    group: "interceptors",
    cases: [
      {
        name: "should call interceptors with correct operation name",
        async run(ctx) {
          await ctx.insertUsers([]);
          const operations: string[] = [];
          const interceptor: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            operations.push(ictx.operation);
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [interceptor] });

          await r.create({ uid: "int1", email: "int@test.com" });
          await r.get({ uid: "int1" });
          await r.list();
          await r.count();
          await r.update({ uid: "int1" }, { displayName: "Updated", email: "int@test.com" });
          await r.delete({ uid: "int1" });

          expect(operations).toEqual(["create", "get", "list", "count", "update", "delete"]);
        },
      },
      {
        name: "should chain interceptors in order (first = outermost)",
        async run(ctx) {
          await ctx.insertUsers([]);
          const order: string[] = [];
          const first: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            order.push("first-in");
            const result = await next(ictx);
            order.push("first-out");
            return result;
          };
          const second: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            order.push("second-in");
            const result = await next(ictx);
            order.push("second-out");
            return result;
          };
          const r = repo(ctx, { interceptors: [first, second] });

          await r.create({ uid: "int2", email: "int2@test.com" });
          expect(order).toEqual(["first-in", "second-in", "second-out", "first-out"]);
        },
      },
      {
        name: "should propagate errors through interceptors",
        async run(ctx) {
          const errors: unknown[] = [];
          const interceptor: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            try {
              return await next(ictx);
            } catch (err) {
              errors.push(err);
              throw err;
            }
          };
          const r = repo(ctx, { interceptors: [interceptor] });

          await expect(r.get({ uid: "nonexistent" })).rejects.toThrow(NotFoundError);
          expect(errors).toHaveLength(1);
          expect(errors[0]).toBeInstanceOf(NotFoundError);
        },
      },
      {
        name: "should allow interceptors to measure timing",
        async run(ctx) {
          await ctx.insertUsers([]);
          let duration = 0;
          const timer: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            const start = performance.now();
            const result = await next(ictx);
            duration = performance.now() - start;
            return result;
          };
          const r = repo(ctx, { interceptors: [timer] });

          await r.create({ uid: "int3", email: "int3@test.com" });
          expect(duration).toBeGreaterThan(0);
        },
      },
      {
        name: "should pass call arguments in context",
        async run(ctx) {
          await ctx.insertUsers([]);
          const captured: Array<{ op: string; hasQuery?: boolean; hasResource?: boolean }> = [];
          const spy: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              captured.push({ op: "create", hasResource: ictx.resource !== undefined });
            } else if (ictx.operation === "get") {
              captured.push({ op: "get", hasQuery: ictx.query !== undefined });
            } else if (ictx.operation === "update") {
              captured.push({
                op: "update",
                hasQuery: ictx.query !== undefined,
                hasResource: ictx.resource !== undefined,
              });
            } else if (ictx.operation === "list") {
              captured.push({ op: "list", hasQuery: ictx.query !== undefined });
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [spy] });

          await r.create({ uid: "int4", email: "int4@test.com" });
          await r.get({ uid: "int4" });
          await r.update({ uid: "int4" }, { displayName: "Updated", email: "int4@test.com" });
          await r.list('uid = "int4"');

          expect(captured).toEqual([
            { op: "create", hasResource: true },
            { op: "get", hasQuery: true },
            { op: "update", hasQuery: true, hasResource: true },
            { op: "list", hasQuery: true },
          ]);
        },
      },
      {
        name: "should allow interceptors to rewrite create and update inputs",
        async run(ctx) {
          await ctx.insertUsers([]);
          const rewrite: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              ictx.resource = {
                ...ictx.resource,
                displayName: "Created by interceptor",
              };
            } else if (ictx.operation === "update") {
              ictx.resource = {
                ...ictx.resource,
                displayName: "Updated by interceptor",
              };
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [rewrite] });

          const created = await r.create({ uid: "int5", email: "int5@test.com" });
          expect(created.displayName).toBe("Created by interceptor");

          const updated = await r.update(
            { uid: "int5" },
            { displayName: "Ignored", email: "int5@test.com" },
          );
          expect(updated.displayName).toBe("Updated by interceptor");
        },
      },
      {
        name: "should allow interceptors to inspect the result returned by next",
        async run(ctx) {
          await ctx.insertUsers([]);
          const seen: Array<Pick<MessageShape<typeof TestUserSchema>, "displayName" | "etag">> = [];
          const audit: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation !== "create") {
              return next(ictx);
            }
            const result = (await next(ictx)) as MessageShape<typeof TestUserSchema>;
            seen.push({ displayName: result.displayName, etag: result.etag });
            return result;
          };
          const rewrite: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              ictx.resource = {
                ...ictx.resource,
                displayName: "Created by inner interceptor",
              };
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [audit, rewrite] });

          const created = await r.create({ uid: "int6", email: "int6@test.com" });

          expect(created.displayName).toBe("Created by inner interceptor");
          expect(created.etag).toBeTruthy();
          expect(seen).toEqual([
            { displayName: "Created by inner interceptor", etag: created.etag },
          ]);
        },
      },
      {
        name: "should allow an interceptor to call a separate repo after next",
        async run(ctx) {
          await ctx.insertUsers([]);
          await ctx.setupMappedUsers(REPO_MAPPED_USERS_TABLE_2, []);
          const auditRepo = createRepository(TestUserSchema, {
            engine: ctx.engine,
            tableName: REPO_MAPPED_USERS_TABLE_2,
            columns: COLUMNS,
          });
          const audit: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation !== "create") {
              return next(ictx);
            }
            const result = (await next(ictx)) as MessageShape<typeof TestUserSchema>;
            await auditRepo.create({
              uid: `audit-${result.uid}`,
              email: `audit-${result.uid}@test.com`,
              displayName: result.displayName,
              secret: result.etag,
            });
            return result;
          };
          const rewrite: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation === "create") {
              ictx.resource = {
                ...ictx.resource,
                displayName: "Created for audit",
              };
            }
            return next(ictx);
          };
          const r = repo(ctx, { interceptors: [audit, rewrite] });

          const created = await r.create({ uid: "int7", email: "int7@test.com" });
          const auditRecord = await auditRepo.get({ uid: "audit-int7" });

          expect(created.displayName).toBe("Created for audit");
          expect(created.email).toBe("int7@test.com");
          expect(auditRecord.displayName).toBe("Created for audit");
          expect(auditRecord.email).toBe("audit-int7@test.com");
          expect(auditRecord.secret).toBe(created.etag);
        },
      },
      {
        name: "should allow an interceptor to call the same repo with a reentry guard",
        async run(ctx) {
          await ctx.insertUsers([]);
          const kNormalizeGuard = createContextKey(false, { description: "normalize guard" });
          const seen: Array<{ operation: string; guarded: boolean }> = [];
          let r!: ReturnType<typeof repo>;
          const normalize: Interceptor<typeof TestUserSchema> = (next) => async (ictx) => {
            if (ictx.operation !== "create" && ictx.operation !== "update") {
              return next(ictx);
            }
            const result = (await next(ictx)) as MessageShape<typeof TestUserSchema>;
            const guarded = ictx.contextValues.get(kNormalizeGuard);
            seen.push({ operation: ictx.operation, guarded });
            if (guarded || ictx.operation !== "create") {
              return result;
            }
            await withReentryGuard(ictx.contextValues, kNormalizeGuard, async () => {
              await r.update(
                { uid: result.uid },
                {
                  displayName: `${result.displayName} normalized`,
                  email: result.email,
                },
                {
                  contextValues: ictx.contextValues,
                },
              );
            });
            return result;
          };
          r = repo(ctx, { interceptors: [normalize] });

          const created = await r.create({
            uid: "int8",
            email: "int8@test.com",
            displayName: "Created",
          });
          const fetched = await r.get({ uid: "int8" });

          expect(created.displayName).toBe("Created");
          expect(fetched.displayName).toBe("Created normalized");
          expect(fetched.email).toBe("int8@test.com");
          expect(seen).toEqual([
            { operation: "create", guarded: false },
            { operation: "update", guarded: true },
          ]);
        },
      },
    ],
  },
];

export const backendSpecificGroups: Partial<Record<string, RepositoryCaseGroup[]>> = {
  mongodb: [
    {
      group: "mongodb regressions",
      cases: [
        {
          name: "should ignore _id and default omitted fields",
          async run(ctx) {
            await ctx.engine.execute({
              insert: REPO_USERS_TABLE,
              documents: [{ uid: "u9", email: "missing@test.com" }],
            });

            const user = await repo(ctx).get({ uid: "u9" });
            expect(user.uid).toBe("u9");
            expect(user.email).toBe("missing@test.com");
            expect(user.displayName).toBe("");
            expect(user.age).toBe(0);
            expect(user.active).toBe(false);
            expect(user.secret).toBe("");
            expect(user.immutableField).toBe("");
          },
        },
      ],
    },
  ],
};

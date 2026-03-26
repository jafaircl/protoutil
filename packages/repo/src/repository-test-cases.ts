import { AlreadyExistsError, InvalidArgumentError, NotFoundError } from "@protoutil/aip/errors";
import { ident, STRING } from "@protoutil/aip/filtering";
import { decode as decodePageToken } from "@protoutil/aip/pagination";
import { fieldMask } from "@protoutil/core/wkt";
import { expect } from "vitest";
import { TestUserSchema } from "./gen/protoutil/repo/v1/test_pb.js";
import { createRepository } from "./repository.js";
import type {
  MappedUserSeed,
  RepositoryTestContext,
  UserSeed,
} from "./repository-test-backends.js";
import type { Interceptor, RepositoryOptions } from "./types.js";

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

const COLUMNS = {
  uid: { name: "user_id" },
  display_name: { name: "name" },
  email: { name: "email_addr" },
  age: { name: "user_age" },
  active: { name: "is_active" },
  immutable_field: { name: "immutable" },
} as const;

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
        name: "should support etagMask when computing an etag",
        async run(ctx) {
          const mask = fieldMask(TestUserSchema, ["uid", "email"]);
          const maskedRepo = repo(ctx, { etag: { mask } });

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
        name: "should JSON-serialize nested message fields on write and read",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: { settings: { serialize: "json" } },
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
        name: "should handle null nested message with serialize json",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: { settings: { serialize: "json" } },
          });
          await r.create({ uid: "ser2", email: "ser2@test.com" });
          const fetched = await r.get({ uid: "ser2" });
          expect(fetched.settings).toBeUndefined();
        },
      },
      {
        name: "should update nested message with serialize json",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: { settings: { serialize: "json" } },
          });
          await r.create({
            uid: "ser3",
            email: "ser3@test.com",
            settings: { theme: "light", notificationsEnabled: false, language: "en" },
          });
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
        },
      },
    ],
  },
  {
    group: "timestamp auto-population",
    cases: [
      {
        name: "should set create_time on create",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              create_time: { timestamp: "create" },
              update_time: { timestamp: "update" },
            },
          });
          const before = Date.now();
          const created = await r.create({ uid: "ts1", email: "ts@test.com" });
          const after = Date.now();

          expect(created.createTime).toBeDefined();
          const createMs = Number(created.createTime!.seconds) * 1000;
          expect(createMs).toBeGreaterThanOrEqual(before - 1000);
          expect(createMs).toBeLessThanOrEqual(after + 1000);
        },
      },
      {
        name: "should set update_time on both create and update",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              create_time: { timestamp: "create" },
              update_time: { timestamp: "update" },
            },
          });
          const created = await r.create({ uid: "ts2", email: "ts2@test.com" });
          expect(created.updateTime).toBeDefined();

          // Wait a tiny bit to ensure different timestamps
          await new Promise((resolve) => setTimeout(resolve, 10));

          const updated = await r.update(
            { uid: "ts2" },
            { displayName: "Updated", email: "ts2@test.com" },
          );
          expect(updated.updateTime).toBeDefined();
          // update_time should be >= create_time
          expect(updated.updateTime!.seconds).toBeGreaterThanOrEqual(created.updateTime!.seconds);
        },
      },
      {
        name: "should not modify create_time on update",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              create_time: { timestamp: "create" },
              update_time: { timestamp: "update" },
            },
          });
          const created = await r.create({ uid: "ts3", email: "ts3@test.com" });
          const createTimeSeconds = created.createTime!.seconds;

          const updated = await r.update(
            { uid: "ts3" },
            { displayName: "Updated", email: "ts3@test.com" },
          );
          expect(updated.createTime!.seconds).toBe(createTimeSeconds);
        },
      },
      {
        name: "should set create timestamps on batchCreate",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              create_time: { timestamp: "create" },
              update_time: { timestamp: "update" },
            },
          });
          const results = await r.batchCreate([
            { uid: "ts4", email: "ts4@test.com" },
            { uid: "ts5", email: "ts5@test.com" },
          ]);
          for (const result of results) {
            expect(result.createTime).toBeDefined();
            expect(result.updateTime).toBeDefined();
          }
        },
      },
      {
        name: "should set update timestamps on batchUpdate",
        async run(ctx) {
          await ctx.insertUsers([]);
          const r = repo(ctx, {
            columns: {
              create_time: { timestamp: "create" },
              update_time: { timestamp: "update" },
            },
          });
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

import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import type { RepositoryTestContext } from "./test-backends.js";
import { repositoryTestBackends } from "./test-backends.js";
import { backendSpecificGroups, groups, setupBaseUsers } from "./test-cases.js";

describe("createRepository", () => {
  for (const backend of repositoryTestBackends) {
    describe(backend.name, () => {
      let ctx: RepositoryTestContext;

      beforeAll(async () => {
        await backend.setupSuite?.();
      });

      afterAll(async () => {
        await backend.teardownSuite?.();
      });

      beforeEach(async () => {
        ctx = await backend.createContext();
        await setupBaseUsers(ctx);
      });

      afterEach(async () => {
        await ctx.cleanup();
      });

      for (const { group, cases } of groups) {
        describe(group, () => {
          for (const c of cases) {
            it(c.name, async () => {
              await c.run(ctx);
            });
          }
        });
      }

      for (const { group, cases } of backendSpecificGroups[backend.name] ?? []) {
        describe(group, () => {
          for (const c of cases) {
            it(c.name, async () => {
              await c.run(ctx);
            });
          }
        });
      }
    });
  }
});

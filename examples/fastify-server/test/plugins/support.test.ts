import Fastify from "fastify";
import { expect, test } from "vitest";
import Support from "../../src/plugins/support.js";

test("support works standalone", async () => {
  const fastify = Fastify();
  // eslint-disable-next-line no-void
  void fastify.register(Support);
  await fastify.ready();

  expect(fastify.someSupport()).toEqual("hugs");
});

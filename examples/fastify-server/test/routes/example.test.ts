import { expect, test } from "vitest";
import { build } from "../helper.js";

test("example is loaded", async (t) => {
  const app = await build(t);

  const res = await app.inject({
    url: "/example",
  });

  expect(res.payload).toEqual("this is an example");
});

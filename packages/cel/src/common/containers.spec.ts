import { describe, expect, it } from "vitest";
import { exprFactory } from "./ast/factory.js";
import { container, defaultContainer, toQualifiedName } from "./containers.js";
import { resolveAliasExpr, resolveContainerExpr, syncedCases } from "./spec-helpers.js";

describe("containers", () => {
  it("common/containers/container_test.go/TestContainers_ResolveCandidateNames", () => {
    const c = container({ name: "a.b.c.M.N" });
    expect(c.resolveCandidateNames("R.s")).toEqual([
      "a.b.c.M.N.R.s",
      "a.b.c.M.R.s",
      "a.b.c.R.s",
      "a.b.R.s",
      "a.R.s",
      "R.s",
    ]);
  });

  it("common/containers/container_test.go/TestContainers_ResolveCandidateNames_FullyQualifiedName", () => {
    const c = container({ name: "a.b.c.M.N" });
    expect(c.resolveCandidateNames(".R.s")).toEqual(["R.s"]);
  });

  it("common/containers/container_test.go/TestContainers_ResolveCandidateNames_EmptyContainer", () => {
    expect(defaultContainer.resolveCandidateNames("R.s")).toEqual(["R.s"]);
  });

  it("common/containers/container_test.go/TestContainers_Alias", () => {
    let c = defaultContainer.extend({
      aliases: [{ qualifiedName: "my.example.pkg.verbose", alias: "bigex" }],
    });
    expect(c.resolveCandidateNames("bigex.Execute")).toEqual(["my.example.pkg.verbose.Execute"]);

    c = defaultContainer.extend({
      aliases: [{ qualifiedName: "really_long_package_name", alias: "short" }],
    });
    expect(c.resolveCandidateNames("short")).toEqual(["really_long_package_name"]);
    expect(c.resolveCandidateNames("short.field")).toEqual(["really_long_package_name.field"]);
  });

  it("common/containers/container_test.go/TestContainers_Abbrevs", () => {
    const abbr = defaultContainer.extend({ abbrevs: ["my.alias.R"] });
    expect(abbr.resolveCandidateNames("R")).toEqual(["my.alias.R"]);

    const c = container({ name: "a.b.c", abbrevs: ["my.alias.R"] });
    expect(c.resolveCandidateNames("R")).toEqual(["my.alias.R"]);
    expect(c.resolveCandidateNames("R.S.T")).toEqual(["my.alias.R.S.T"]);
    expect(c.resolveCandidateNames("S")).toEqual(["a.b.c.S", "a.b.S", "a.S", "S"]);
  });

  it("common/containers/container_test.go/TestContainers_Aliasing_Errors", () => {
    const cases = syncedCases<{
      container?: string;
      abbrevs?: string[];
      aliases?: Array<{ $expr?: string }>;
      err: unknown;
    }>("common/containers/container_test.go/TestContainers_Aliasing_Errors");
    for (const testCase of cases) {
      expect(() =>
        container({
          name: testCase.container,
          abbrevs: testCase.abbrevs,
          aliases: testCase.aliases?.map(resolveAliasExpr),
        }),
      ).toThrow(resolveContainerExpr(testCase.err));
    }
  });

  it("common/containers/container_test.go/TestContainers_Extend_Alias", () => {
    let c = defaultContainer.extend({ aliases: [{ qualifiedName: "test.alias", alias: "alias" }] });
    expect(c.aliasSet().get("alias")).toBe("test.alias");
    c = c.extend({ name: "with.container" });
    expect(c.name()).toBe("with.container");
    expect(c.aliasSet().get("alias")).toBe("test.alias");
  });

  it("common/containers/container_test.go/TestContainers_Extend_Name", () => {
    let c = defaultContainer.extend({ name: "" });
    expect(c.name()).toBe("");

    c = defaultContainer.extend({ name: "hello.container" });
    expect(c.name()).toBe("hello.container");

    c = c.extend({ name: "goodbye.container" });
    expect(c.name()).toBe("goodbye.container");

    expect(() => c.extend({ name: ".bad.container" })).toThrow(
      "container name must not contain a leading '.': .bad.container",
    );
  });

  it("common/containers/container_test.go/TestContainers_ToQualifiedName", () => {
    const fac = exprFactory();
    const ident = fac.ident(1, "var");
    expect(toQualifiedName(ident)).toEqual(["var", true]);
    const select = fac.select(2, ident, "qualifier");
    expect(toQualifiedName(select)).toEqual(["var.qualifier", true]);
    const presenceTest = fac.presenceTest(3, ident, "qualifier");
    expect(toQualifiedName(presenceTest)).toEqual(["", false]);
  });
});

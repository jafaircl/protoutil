import { describe, expect, it } from "vitest";
import { container, defaultContainer } from "../common/containers.js";
import { attributeTrail, qualifyAttribute, registry, Unknown } from "../common/types/index.js";
import { emptyActivation, partialActivation } from "./activation.js";
import type { Attribute, AttributeFactory } from "./attributes.js";
import { attributePattern, partialAttributeFactory } from "./index.js";
import type { SyncedAttrCase } from "./spec-helpers.js";
import { resolveAttributePatternCases } from "./spec-helpers.js";

/**
 * attribute_patterns_test.go coverage tracks the upstream attribute pattern tests.
 */
describe("interpreter/attribute_patterns_test.go", () => {
  /**
   * TestAttributePattern_UnknownResolution ports the upstream unknown resolution coverage.
   */
  describe("interpreter/attribute_patterns_test.go/TestAttributePattern_UnknownResolution", () => {
    it("interpreter/attribute_patterns_test.go/TestAttributePattern_UnknownResolution", () => {
      const reg = registry();
      const cases = resolveAttributePatternCases(
        "interpreter/attribute_patterns_test.go/TestAttributePattern_UnknownResolution",
      );
      for (const testCase of cases) {
        for (const [index, match] of testCase.matches.entries()) {
          const cont = match.unchecked ? container({ name: match.container }) : defaultContainer;
          const fac = partialAttributeFactory({
            containerValue: cont,
            adapter: reg,
            provider: reg,
          });
          const attr = genAttr(fac, match);
          const partVars = partialActivation({
            bindings: emptyActivation(),
            unknowns: [testCase.pattern],
          });
          let value: unknown;
          try {
            value = attr.resolve(partVars);
          } catch (error) {
            throw new Error(`${testCase.name}/match[${index}]: ${(error as Error).message}`);
          }
          expect(value, `${testCase.name}/match[${index}]`).toBeInstanceOf(Unknown);
        }
        for (const [index, miss] of testCase.misses.entries()) {
          const cont = miss.unchecked ? container({ name: miss.container }) : defaultContainer;
          const fac = partialAttributeFactory({
            containerValue: cont,
            adapter: reg,
            provider: reg,
          });
          const attr = genAttr(fac, miss);
          const partVars = partialActivation({
            bindings: emptyActivation(),
            unknowns: [testCase.pattern],
          });
          expect(() => attr.resolve(partVars), `${testCase.name}/miss[${index}]`).toThrow();
        }
      }
    });
  });

  /**
   * TestAttributePattern_CrossReference ports the upstream cross-reference coverage.
   */
  describe("interpreter/attribute_patterns_test.go/TestAttributePattern_CrossReference", () => {
    it("interpreter/attribute_patterns_test.go/TestAttributePattern_CrossReference", () => {
      const reg = registry();
      const fac = partialAttributeFactory({
        containerValue: defaultContainer,
        adapter: reg,
        provider: reg,
      });
      const a = fac.absoluteAttribute(1, "a");
      const b = fac.absoluteAttribute(2, "b");
      a.addQualifier(b);

      let partVars = partialActivation({
        bindings: { a: [1, 2] },
        unknowns: [attributePattern("b")],
      });
      let value = a.resolve(partVars) as Unknown;
      expect(unknownContains(value, unknownFor("b", 2))).toBe(true);

      partVars = partialActivation({
        bindings: { a: [1, 2] },
        unknowns: [attributePattern("a").qualInt(0), attributePattern("b")],
      });
      value = a.resolve(partVars) as Unknown;
      expect(unknownContains(value, unknownFor("b", 2))).toBe(true);

      partVars = partialActivation({
        bindings: { a: [1, 2], b: 0 },
        unknowns: [attributePattern("a").qualInt(0).qualString("c")],
      });
      value = a.resolve(partVars) as Unknown;
      expect(unknownContains(value, unknownFor("a", 2, 0))).toBe(true);

      partVars = partialActivation({
        bindings: { a: [1, 2], b: 0 },
        unknowns: [],
      });
      expect(a.resolve(partVars)).toBe(1);

      partVars = partialActivation({
        bindings: { a: [1, 2], b: 0 },
        unknowns: [attributePattern("a").qualInt(0).qualString("c")],
      });
      a.addQualifier(fac.qualifier({ id: 3, value: "c", optional: false }));
      value = a.resolve(partVars) as Unknown;
      expect(unknownContains(value, unknownFor("a", 3, 0, "c"))).toBe(true);
    });
  });
});

/**
 * genAttr ports the upstream helper that builds an attribute from a simplified case description.
 */
function genAttr(fac: AttributeFactory, value: SyncedAttrCase): Attribute {
  let id = 1;
  const attr = value.unchecked
    ? fac.maybeAttribute(1, value.name)
    : fac.absoluteAttribute(1, value.name);
  for (const qualifier of value.quals ?? []) {
    attr.addQualifier(fac.qualifier({ id, value: qualifier, optional: false }));
    id += 1;
  }
  return attr;
}

/**
 * unknownFor builds an expected unknown value for a variable path and expression id.
 */
function unknownFor(
  variable: string,
  id: number,
  ...qualifiers: Array<boolean | number | bigint | string>
): Unknown {
  const attr = attributeTrail(variable);
  for (const qualifier of qualifiers) {
    qualifyAttribute(attr, qualifier);
  }
  return new Unknown(new Map([[id, [attr]]]));
}

/**
 * unknownContains checks whether one unknown contains another.
 */
function unknownContains(actual: Unknown, expected: Unknown): boolean {
  return actual.contains(expected);
}

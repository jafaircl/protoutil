import { describe, expect, it } from "vitest";
import { container, defaultContainer } from "../common/containers.js";
import { attributeTrail, qualifyAttribute, registry, Unknown } from "../common/types/index.js";
import { emptyActivation, partialActivation } from "./activation.js";
import type { Activation } from "./activation.js";
import type { Attribute, AttributeFactory } from "./attributes.js";
import { executionFrame } from "./frame.js";
import { attributePattern, partialAttributeFactory } from "./index.js";
import type { SyncedAttrCase } from "./spec-helpers.js";
import { resolveAttributePatternCases } from "./spec-helpers.js";

/**
 * LocalActivation exposes one locally bound variable for partial-attribute tests.
 */
class LocalActivation implements Activation {
  /** parent returns the wrapped partial activation. */
  public parent(): Activation | undefined {
    return undefined;
  }

  /** resolveName returns the local x value. */
  public resolveName(name: string): [unknown, boolean] {
    return name === "x" ? [1, true] : [undefined, false];
  }

  /** isLocalVariable reports that x belongs to this local scope. */
  public isLocalVariable(name: string): boolean {
    return name === "x";
  }
}

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

  describe("interpreter/attribute_patterns_test.go/TestAttributePattern_LocallyBound", () => {
    it("does not replace a locally bound variable with a partial unknown", () => {
      const reg = registry();
      const fac = partialAttributeFactory({
        containerValue: defaultContainer,
        adapter: reg,
        provider: reg,
      });
      const partial = partialActivation({
        bindings: {},
        unknowns: [attributePattern("x"), attributePattern("y")],
      });
      const frame = executionFrame({ input: partial }).push(new LocalActivation());

      expect(fac.absoluteAttribute(1, "x").resolve(frame)).toBe(1);
      expect(fac.absoluteAttribute(2, "y").resolve(frame)).toBeInstanceOf(Unknown);
      frame.close();
    });
  });

  describe("interpreter/attribute_patterns_test.go/TestQualifierValueEquals", () => {
    it("matches equivalent field, string, boolean, and numeric qualifier values", () => {
      const reg = registry();
      const fac = partialAttributeFactory({
        containerValue: defaultContainer,
        adapter: reg,
        provider: reg,
      });

      expect(attributePattern("a").qualString("hello").qualifierPatterns()[0]?.matches(
        fac.qualifier({ id: 1, value: "hello", optional: false }),
      )).toBe(true);
      expect(attributePattern("a").qualBool(true).qualifierPatterns()[0]?.matches(
        fac.qualifier({ id: 1, value: true, optional: false }),
      )).toBe(true);
      expect(attributePattern("a").qualInt(42).qualifierPatterns()[0]?.matches(
        fac.qualifier({ id: 1, value: 42n, optional: false }),
      )).toBe(true);
    });
  });

  describe(
    "interpreter/attribute_patterns_test.go/TestPartialAttributeFactory_MaybeAttributeGloballyNamespaced",
    () => {
      it("creates an unchecked globally namespaced attribute", () => {
        const reg = registry();
        const fac = partialAttributeFactory({
          containerValue: defaultContainer,
          adapter: reg,
          provider: reg,
        });

        expect(fac.maybeAttribute(10, ".global_var")).toBeDefined();
      });
    },
  );

  describe(
    "interpreter/attribute_patterns_test.go/TestPartialAttributeFactory_ResolveUnknownQualifier",
    () => {
      it("preserves the qualified trail and qualifier expression id", () => {
        const reg = registry();
        const fac = partialAttributeFactory({
          containerValue: defaultContainer,
          adapter: reg,
          provider: reg,
        });
        const attribute = fac.absoluteAttribute(1, "a");
        attribute.addQualifier(fac.qualifier({ id: 2, value: "b", optional: false }));
        const value = attribute.resolve(
          partialActivation({
            bindings: { a: { b: 1 } },
            unknowns: [attributePattern("a").qualString("b")],
          }),
        ) as Unknown;

        expect(value.contains(unknownFor("a", 2, "b"))).toBe(true);
      });
    },
  );
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

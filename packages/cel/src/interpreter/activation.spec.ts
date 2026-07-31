import { describe, expect, it } from "vitest";
import { String as CelString, Int, True } from "../common/types/index.js";
import {
  activation,
  asPartialActivation,
  attributePattern,
  hierarchicalActivation,
  partialActivation,
} from "./activation.js";

/**
 * activation_test.go coverage ports the upstream activation tests.
 */
describe("interpreter/activation_test.go", () => {
  /**
   * TestActivation ports the upstream activation constructor coverage.
   */
  describe("interpreter/activation_test.go/TestActivation", () => {
    it("interpreter/activation_test.go/TestActivation", () => {
      const act = activation({ bindings: { a: True } });
      expect(act).toBeDefined();
      expect(activation({ bindings: act })).toBe(act);
      expect(() => activation({ bindings: "" })).toThrow(
        "activation input must be an activation or map[string]interface: got string",
      );
    });
  });

  /**
   * TestActivation_Resolve ports the upstream direct name resolution coverage.
   */
  describe("interpreter/activation_test.go/TestActivation_Resolve", () => {
    it("interpreter/activation_test.go/TestActivation_Resolve", () => {
      const act = activation({ bindings: { a: True } });
      expect(act.resolveName("a")).toEqual([True, true]);
    });
  });

  /**
   * TestActivation_ResolveLazy ports the upstream lazy ref.Val resolution coverage.
   */
  describe("interpreter/activation_test.go/TestActivation_ResolveLazy", () => {
    it("interpreter/activation_test.go/TestActivation_ResolveLazy", () => {
      let cached: Int | undefined;
      const act = activation({
        bindings: {
          now: () => {
            cached ??= new Int(BigInt(Date.now()));
            return cached;
          },
        },
      });
      const [first, firstFound] = act.resolveName("now");
      const [second, secondFound] = act.resolveName("now");
      expect(firstFound).toBe(true);
      expect(secondFound).toBe(true);
      expect(first).toBe(second);
    });
  });

  /**
   * TestActivation_ResolveLazyAny ports the upstream lazy any resolution coverage.
   */
  describe("interpreter/activation_test.go/TestActivation_ResolveLazyAny", () => {
    it("interpreter/activation_test.go/TestActivation_ResolveLazyAny", () => {
      let cached: number | undefined;
      const act = activation({
        bindings: {
          now: () => {
            cached ??= Date.now();
            return cached;
          },
        },
      });
      const [first, firstFound] = act.resolveName("now");
      const [second, secondFound] = act.resolveName("now");
      expect(firstFound).toBe(true);
      expect(secondFound).toBe(true);
      expect(first).toBe(second);
    });
  });

  /**
   * TestHierarchicalActivation ports the upstream parent-child resolution coverage.
   */
  describe("interpreter/activation_test.go/TestHierarchicalActivation", () => {
    it("interpreter/activation_test.go/TestHierarchicalActivation", () => {
      const parent = activation({
        bindings: {
          a: new CelString("world"),
          b: new Int(-42n),
        },
      });
      const child = activation({
        bindings: {
          a: True,
          c: new CelString("universe"),
        },
      });
      const combined = hierarchicalActivation({ parent, child });

      expect(combined.resolveName("a")).toEqual([True, true]);
      expect(combined.resolveName("b")).toEqual([new Int(-42n), true]);
      expect(combined.resolveName("c")).toEqual([new CelString("universe"), true]);
    });
  });

  /**
   * TestAsPartialActivation ports the upstream partial activation lookup coverage.
   */
  describe("interpreter/activation_test.go/TestAsPartialActivation", () => {
    it("interpreter/activation_test.go/TestAsPartialActivation", () => {
      const parent = partialActivation({
        bindings: {
          a: new CelString("world"),
          b: new Int(-42n),
        },
        unknowns: [attributePattern("c")],
      });
      const child = activation({
        bindings: {
          d: new CelString("universe"),
        },
      });
      const combined = hierarchicalActivation({ parent, child });

      expect(asPartialActivation(combined)).toEqual([parent, true]);
    });
  });

  describe("interpreter/activation_test.go/TestActivation_NewActivationNilInput", () => {
    it("rejects nil activation bindings", () => {
      expect(() => activation({ bindings: undefined })).toThrow("bindings must be non-nil");
    });
  });

  describe("interpreter/activation_test.go/TestPartialActivation_NewPartialActivationNilInput", () => {
    it("rejects nil partial activation bindings", () => {
      expect(() => partialActivation({ bindings: undefined, unknowns: [] })).toThrow(
        "bindings must be non-nil",
      );
    });
  });

  describe("interpreter/activation_test.go/TestAsPartialActivation_NonPartialActivation", () => {
    it("reports ordinary activations as non-partial", () => {
      expect(asPartialActivation(activation({ bindings: { a: 1 } }))).toEqual([undefined, false]);
    });
  });

  describe("interpreter/activation_test.go/TestIsLocalVariableNested", () => {
    it("searches nested local activation scopes", () => {
      const localScope = (names: string[]) => ({
        isLocalVariable: (name: string) => names.includes(name),
        parent: () => undefined,
        resolveName: (): [unknown, boolean] => [undefined, false],
      });
      const outer = hierarchicalActivation({
        parent: activation({ bindings: {} }),
        child: localScope(["accu1", "iter1", "iter1_2"]),
      });
      const inner = hierarchicalActivation({
        parent: outer,
        child: localScope(["accu2", "iter2"]),
      }) as ReturnType<typeof hierarchicalActivation> & {
        isLocalVariable(name: string): boolean;
      };

      expect(inner.isLocalVariable("accu2")).toBe(true);
      expect(inner.isLocalVariable("iter1_2")).toBe(true);
      expect(inner.isLocalVariable("x")).toBe(false);
    });
  });
});

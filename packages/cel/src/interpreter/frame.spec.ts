import { describe, expect, it } from "vitest";
import { IntOne } from "../common/types/index.js";
import {
  activation,
  asPartialActivation,
  emptyActivation,
  partialActivation,
} from "./activation.js";
import { executionFrame } from "./frame.js";

/**
 * frame_test.go coverage tracks the upstream execution frame tests.
 */
describe("interpreter/frame_test.go", () => {
  /**
   * TestFrameCheckInterrupt ports the upstream interrupt coverage.
   */
  describe("interpreter/frame_test.go/TestFrameCheckInterrupt", () => {
    it("interpreter/frame_test.go/TestFrameCheckInterrupt", () => {
      const cases = [
        {
          name: "nil context",
          setup: () => ({
            frame: executionFrame({ input: emptyActivation() }),
            hook: undefined as undefined | ((step: number) => void),
          }),
          checks: [false, false],
        },
        {
          name: "zero frequency not canceled",
          setup: () => {
            const frame = executionFrame({ input: emptyActivation() });
            frame.setContext({ interruptCheckFrequency: 0 });
            return { frame, hook: undefined as undefined | ((step: number) => void) };
          },
          checks: [false, false],
        },
        {
          name: "frequency one canceled dynamically",
          setup: () => {
            const controller = new AbortController();
            const frame = executionFrame({ input: emptyActivation() });
            frame.setContext({ signal: controller.signal, interruptCheckFrequency: 1 });
            return {
              frame,
              hook: (step: number) => {
                if (step === 1) {
                  controller.abort();
                }
              },
            };
          },
          checks: [false, true, true],
        },
        {
          name: "frequency two canceled dynamically",
          setup: () => {
            const controller = new AbortController();
            const frame = executionFrame({ input: emptyActivation() });
            frame.setContext({ signal: controller.signal, interruptCheckFrequency: 2 });
            return {
              frame,
              hook: (step: number) => {
                if (step === 1) {
                  controller.abort();
                }
              },
            };
          },
          checks: [false, true, true],
        },
      ];

      for (const testCase of cases) {
        const { frame, hook } = testCase.setup();
        try {
          for (const [index, want] of testCase.checks.entries()) {
            hook?.(index);
            expect(frame.checkInterrupt(), testCase.name).toBe(want);
          }
        } finally {
          frame.close();
        }
      }
    });
  });

  /**
   * TestFrameResolveName tracks the upstream resolve-name coverage.
   */
  describe("interpreter/frame_test.go/TestFrameResolveName", () => {
    it("interpreter/frame_test.go/TestFrameResolveName", () => {
      const baseAct = activation({ bindings: { x: 1 } });
      const childAct = activation({ bindings: { y: 2 } });

      const base = executionFrame({ input: baseAct });
      expect(base.resolveName("x")).toEqual([1, true]);
      expect(base.resolveName("y")).toEqual([undefined, false]);

      const child = base.push(childAct);
      expect(child.resolveName("y")).toEqual([2, true]);
      expect(child.resolveName("x")).toEqual([1, true]);
      expect(child.resolveName("z")).toEqual([undefined, false]);

      child.pop();
      base.close();
    });
  });

  /**
   * TestFrameParent tracks the upstream parent lookup coverage.
   */
  describe("interpreter/frame_test.go/TestFrameParent", () => {
    it("interpreter/frame_test.go/TestFrameParent", () => {
      const baseAct = activation({ bindings: { x: 1 } });
      const childAct = activation({ bindings: { y: 2 } });

      const base = executionFrame({ input: baseAct });
      expect(base.parent()).toBeUndefined();

      const child = base.push(childAct);
      expect(child.parent()).toBe(baseAct);

      child.pop();
      base.close();
    });
  });

  /**
   * TestFrameUnwrap tracks the upstream unwrap coverage.
   */
  describe("interpreter/frame_test.go/TestFrameUnwrap", () => {
    it("interpreter/frame_test.go/TestFrameUnwrap", () => {
      const baseAct = activation({ bindings: { x: 1 } });
      const base = executionFrame({ input: baseAct });
      expect(base.unwrap()).toBe(baseAct);

      const childAct = activation({ bindings: { y: 2 } });
      const child = base.push(childAct);
      expect(child.unwrap()).toBe(child.activation());

      child.pop();
      base.close();
    });
  });

  /**
   * TestFrameAsPartialActivation tracks the upstream partial activation coverage.
   */
  describe("interpreter/frame_test.go/TestFrameAsPartialActivation", () => {
    it("interpreter/frame_test.go/TestFrameAsPartialActivation", () => {
      const baseAct = activation({ bindings: { x: 1 } });
      const partAct = partialActivation({ bindings: { y: 2 }, unknowns: [] });

      const base = executionFrame({ input: baseAct });
      expect(asPartialActivation(base)[1]).toBe(false);
      base.close();

      const partial = executionFrame({ input: partAct });
      expect(partial.asPartialActivation()[1]).toBe(true);
      partial.close();

      const wrapped = executionFrame({ input: partAct });
      const child = wrapped.push(baseAct);
      expect(child.asPartialActivation()[1]).toBe(true);
      child.pop();
      wrapped.close();
    });
  });

  /**
   * TestFramePushPop tracks the upstream push/pop coverage.
   */
  describe("interpreter/frame_test.go/TestFramePushPop", () => {
    it("interpreter/frame_test.go/TestFramePushPop", () => {
      const base = executionFrame({ input: activation({ bindings: { x: 1 } }) });
      const child = base.push(activation({ bindings: { y: 2 } }));
      expect(child.parentFrame()).toBe(base);
      expect(child.pop()).toBe(base);
      const reused = base.push(activation({ bindings: { z: 3 } }));
      expect(reused === child).toBe(true);
      expect(reused.resolveName("z")).toEqual([3, true]);
      reused.pop();
      base.close();
    });
  });

  /**
   * TestFrameClose tracks the upstream close coverage.
   */
  describe("interpreter/frame_test.go/TestFrameClose", () => {
    it("interpreter/frame_test.go/TestFrameClose", () => {
      const controller = new AbortController();
      const frame = executionFrame({ input: emptyActivation() });
      frame.setContext({ signal: controller.signal, interruptCheckFrequency: 1 });
      const internalSignal = frame.signal();
      expect(internalSignal?.aborted).toBe(false);
      frame.close();
      expect(internalSignal?.aborted).toBe(true);
    });
  });

  /**
   * TestFrameLifecycleAndPooling tracks the upstream pooling coverage.
   */
  describe("interpreter/frame_test.go/TestFrameLifecycleAndPooling", () => {
    it("interpreter/frame_test.go/TestFrameLifecycleAndPooling", () => {
      const frame = executionFrame({ input: { a: 1, b: 2 } });
      const inputActivation = frame.activation();
      expect(frame.resolveName("a")).toEqual([1, true]);

      const parentAct = activation({ bindings: { c: 3 } });
      frame.setActivationHierarchy({ parent: parentAct, child: frame.activation() });
      expect(frame.resolveName("c")).toEqual([3, true]);
      expect(frame.resolveName("a")).toEqual([1, true]);

      frame.close();

      const fresh = executionFrame({ input: { x: 10 } });
      expect(fresh === frame).toBe(true);
      expect(fresh.activation() === inputActivation).toBe(true);
      expect(fresh.resolveName("x")).toEqual([10, true]);
      expect(fresh.resolveName("a")).toEqual([undefined, false]);
      fresh.close();
    });
  });

  /**
   * TestFrameSetContext tracks the upstream context setup coverage.
   */
  describe("interpreter/frame_test.go/TestFrameSetContext", () => {
    it("interpreter/frame_test.go/TestFrameSetContext", () => {
      const frame = executionFrame({ input: emptyActivation() });
      expect(() => frame.setContext({ interruptCheckFrequency: 1 })).not.toThrow();
      frame.close();
    });
  });

  /**
   * TestFrameSetContextTwiceError tracks the upstream duplicate context error coverage.
   */
  describe("interpreter/frame_test.go/TestFrameSetContextTwiceError", () => {
    it("interpreter/frame_test.go/TestFrameSetContextTwiceError", () => {
      const frame = executionFrame({ input: emptyActivation() });
      frame.setContext({ interruptCheckFrequency: 1 });
      expect(() => frame.setContext({ interruptCheckFrequency: 1 })).toThrow(
        "setContext() called more than once",
      );
      frame.close();
    });
  });

  /**
   * TestFrameSetContextChildError tracks the upstream child context error coverage.
   */
  describe("interpreter/frame_test.go/TestFrameSetContextChildError", () => {
    it("interpreter/frame_test.go/TestFrameSetContextChildError", () => {
      const frame = executionFrame({ input: emptyActivation() });
      const child = frame.push(emptyActivation());
      expect(() => child.setContext({ interruptCheckFrequency: 1 })).toThrow(
        "setContext() called on child frame",
      );
      child.pop();
      frame.close();
    });
  });

  /**
   * TestNewExecutionFrameInvalidInput tracks the upstream invalid input coverage.
   */
  describe("interpreter/frame_test.go/TestNewExecutionFrameInvalidInput", () => {
    it("interpreter/frame_test.go/TestNewExecutionFrameInvalidInput", () => {
      expect(() => executionFrame({ input: 123 })).toThrow(
        "invalid input, wanted Activation or map[string]any, got: (number)123",
      );
    });
  });

  /**
   * TestFramePopBaseFrame tracks the upstream base-frame pop coverage.
   */
  describe("interpreter/frame_test.go/TestFramePopBaseFrame", () => {
    it("interpreter/frame_test.go/TestFramePopBaseFrame", () => {
      const frame = executionFrame({ input: emptyActivation() });
      expect(frame.pop()).toBe(frame);
      frame.close();
    });
  });

  describe("interpreter/frame_test.go/TestFrameDoubleClose", () => {
    it("allows a frame to be closed more than once", () => {
      const frame = executionFrame({ input: emptyActivation() });
      expect(() => {
        frame.close();
        frame.close();
      }).not.toThrow();
    });
  });

  /**
   * TestLazyVariableResolution tracks the upstream lazy variable coverage.
   */
  describe("interpreter/frame_test.go/TestLazyVariableResolution", () => {
    it("interpreter/frame_test.go/TestLazyVariableResolution", () => {
      let lazyRefCalls = 0;
      let lazyAnyCalls = 0;

      const frame = executionFrame({
        input: {
          lazy_ref: () => {
            lazyRefCalls += 1;
            return IntOne;
          },
          lazy_any: () => {
            lazyAnyCalls += 1;
            return 2;
          },
          normal: 3,
        },
      });

      expect(frame.resolveName("missing")).toEqual([undefined, false]);
      expect(frame.resolveName("normal")).toEqual([3, true]);

      expect(frame.resolveName("lazy_ref")).toEqual([IntOne, true]);
      expect(lazyRefCalls).toBe(1);
      expect(frame.resolveName("lazy_ref")).toEqual([IntOne, true]);
      expect(lazyRefCalls).toBe(1);

      expect(frame.resolveName("lazy_any")).toEqual([2, true]);
      expect(lazyAnyCalls).toBe(1);
      expect(frame.resolveName("lazy_any")).toEqual([2, true]);
      expect(lazyAnyCalls).toBe(1);

      frame.close();
    });
  });
});

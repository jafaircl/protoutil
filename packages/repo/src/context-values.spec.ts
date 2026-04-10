import { describe, expect, it } from "vitest";
import { createContextKey, createContextValues, withReentryGuard } from "./context-values.js";

describe("context values", () => {
  it("should return default values for unset keys", () => {
    const values = createContextValues();
    const key = createContextKey("default");

    expect(values.get(key)).toBe("default");
  });

  it("should support set/get/delete with chaining", () => {
    const values = createContextValues();
    const key = createContextKey("default");

    values.set(key, "set-value").delete(key);

    expect(values.get(key)).toBe("default");
  });

  it("should keep distinct keys isolated", () => {
    const values = createContextValues();
    const first = createContextKey("default", { description: "same" });
    const second = createContextKey("default", { description: "same" });

    values.set(first, "first-value");

    expect(values.get(first)).toBe("first-value");
    expect(values.get(second)).toBe("default");
  });

  it("should set and clear a guard around the wrapped function", async () => {
    const values = createContextValues();
    const key = createContextKey(false);
    const seen: boolean[] = [];

    const result = await withReentryGuard(values, key, async () => {
      seen.push(values.get(key));
      return "guarded";
    });

    expect(result).toBe("guarded");
    expect(seen).toEqual([true]);
    expect(values.get(key)).toBe(false);
  });

  it("should preserve the outer guard state for nested calls", async () => {
    const values = createContextValues();
    const key = createContextKey(false);
    const seen: boolean[] = [];

    await withReentryGuard(values, key, async () => {
      seen.push(values.get(key));
      await withReentryGuard(values, key, async () => {
        seen.push(values.get(key));
      });
      seen.push(values.get(key));
    });

    expect(seen).toEqual([true, true, true]);
    expect(values.get(key)).toBe(false);
  });

  it("should clear the guard even if the wrapped function throws", async () => {
    const values = createContextValues();
    const key = createContextKey(false);

    await expect(
      withReentryGuard(values, key, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(values.get(key)).toBe(false);
  });
});

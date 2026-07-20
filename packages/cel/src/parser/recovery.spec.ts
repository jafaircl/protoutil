import { describe, expect, it } from "vitest";
import { parserOptions } from "./options.js";
import { ParserRecoveryState } from "./recovery.js";

/**
 * configuredState creates a recovery state with small explicit limits for focused unit tests.
 */
function configuredState(): ParserRecoveryState {
  return new ParserRecoveryState(
    parserOptions({
      errorRecoveryLimit: 2,
      errorRecoveryTokenLookaheadLimit: 3,
    }),
  );
}

describe("parser/recovery.ts", () => {
  it("tracks recovery-attempt limits", () => {
    const state = configuredState();
    expect(state.attemptLimit()).toBe(2);
    expect(state.attemptLimitReached()).toBe(false);
    state.noteAttempt();
    expect(state.attemptLimitReached()).toBe(false);
    state.noteAttempt();
    expect(state.attemptLimitReached()).toBe(true);
  });

  it("tracks recovery-lookahead limits", () => {
    const state = configuredState();
    expect(state.lookaheadLimit()).toBe(3);
    expect(state.lookaheadLimitReached()).toBe(false);
    state.noteLookahead();
    state.noteLookahead();
    expect(state.lookaheadLimitReached()).toBe(false);
    state.noteLookahead();
    expect(state.lookaheadLimitReached()).toBe(true);
  });

  it("reports leading invalid overflow only after the configured threshold", () => {
    const state = configuredState();
    expect(state.noteLeadingInvalid()).toBe("ok");
    expect(state.noteLeadingInvalid()).toBe("ok");
    expect(state.noteLeadingInvalid()).toBe("ok");
    expect(state.hasReportedLookaheadLimit()).toBe(false);
    expect(state.noteLeadingInvalid()).toBe("limit-exceeded");
    expect(state.hasReportedLookaheadLimit()).toBe(true);
  });

  it("reports trailing invalid saturation once and preserves the reported state", () => {
    const state = configuredState();
    expect(state.noteTrailingInvalid()).toBe("ok");
    expect(state.noteTrailingInvalid()).toBe("ok");
    expect(state.hasReportedLookaheadLimit()).toBe(false);
    expect(state.noteTrailingInvalid()).toBe("limit-reached");
    expect(state.hasReportedLookaheadLimit()).toBe(true);
    expect(state.noteTrailingInvalid()).toBe("ok");
  });

  it("supports the one-shot stop-after-invalid flag", () => {
    const state = configuredState();
    expect(state.shouldStopAfterInvalid()).toBe(false);
    state.stopAfterNextInvalid();
    expect(state.shouldStopAfterInvalid()).toBe(true);
    state.clearStopAfterInvalid();
    expect(state.shouldStopAfterInvalid()).toBe(false);
  });
});

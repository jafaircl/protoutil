import type { ParserOptions } from "./options.js";

/**
 * LeadingInvalidResult reports whether a leading invalid token stays within the configured limit.
 */
export type LeadingInvalidResult = "ok" | "limit-exceeded";

/**
 * TrailingInvalidResult reports whether a trailing invalid token reached the configured limit.
 */
export type TrailingInvalidResult = "ok" | "limit-reached";

/**
 * ParserRecoveryState centralizes recovery counters and one-off control flags used while mirroring
 * cel-go's malformed-input diagnostics.
 */
export class ParserRecoveryState {
  private attemptCount = 0;
  private lookaheadCount = 0;
  private leadingInvalidCount = 0;
  private reportedLookaheadLimit = false;
  private stopAfterInvalidFlag = false;

  /**
   * constructor binds the recovery state to the parser option limits it enforces.
   */
  constructor(private readonly options: ParserOptions) {}

  /**
   * attemptLimit returns the configured recovery-attempt ceiling.
   */
  public attemptLimit(): number {
    return this.options.errorRecoveryLimit;
  }

  /**
   * lookaheadLimit returns the configured recovery-lookahead ceiling.
   */
  public lookaheadLimit(): number {
    return this.options.errorRecoveryTokenLookaheadLimit;
  }

  /**
   * noteAttempt records a recovery attempt after the caller has checked the limit.
   */
  public noteAttempt(): void {
    this.attemptCount += 1;
  }

  /**
   * attemptLimitReached reports whether another recovery attempt would exceed the configured cap.
   */
  public attemptLimitReached(): boolean {
    return this.attemptCount === this.options.errorRecoveryLimit;
  }

  /**
   * noteLookahead records one token of recovery lookahead after the caller has checked the limit.
   */
  public noteLookahead(): void {
    this.lookaheadCount += 1;
  }

  /**
   * lookaheadLimitReached reports whether another recovery-lookahead step would exceed the cap.
   */
  public lookaheadLimitReached(): boolean {
    return this.lookaheadCount >= this.options.errorRecoveryTokenLookaheadLimit;
  }

  /**
   * noteLeadingInvalid tracks invalid leading tokens before parsing begins.
   */
  public noteLeadingInvalid(): LeadingInvalidResult {
    this.leadingInvalidCount += 1;
    if (this.leadingInvalidCount > this.options.errorRecoveryTokenLookaheadLimit) {
      this.reportedLookaheadLimit = true;
      return "limit-exceeded";
    }
    return "ok";
  }

  /**
   * noteTrailingInvalid tracks invalid trailing tokens while recovering after the main parse.
   */
  public noteTrailingInvalid(): TrailingInvalidResult {
    this.lookaheadCount += 1;
    if (
      this.lookaheadCount === this.options.errorRecoveryTokenLookaheadLimit &&
      !this.reportedLookaheadLimit
    ) {
      this.reportedLookaheadLimit = true;
      return "limit-reached";
    }
    return "ok";
  }

  /**
   * hasReportedLookaheadLimit reports whether the parser has already surfaced the internal
   * lookahead-limit diagnostic and should switch into the abbreviated trailing recovery path.
   */
  public hasReportedLookaheadLimit(): boolean {
    return this.reportedLookaheadLimit;
  }

  /**
   * stopAfterNextInvalid marks that the next invalid token should terminate trailing recovery.
   */
  public stopAfterNextInvalid(): void {
    this.stopAfterInvalidFlag = true;
  }

  /**
   * shouldStopAfterInvalid reports whether the parser should stop once the current invalid token is
   * consumed.
   */
  public shouldStopAfterInvalid(): boolean {
    return this.stopAfterInvalidFlag;
  }

  /**
   * clearStopAfterInvalid resets the one-shot trailing-recovery stop flag.
   */
  public clearStopAfterInvalid(): void {
    this.stopAfterInvalidFlag = false;
  }
}

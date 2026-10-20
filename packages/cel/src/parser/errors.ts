import { type Errors, NO_LOCATION } from "../common/index.js";
import type { Location } from "../common/location.js";

/**
 * ParseErrors specializes common Errors for parser reporting.
 */
export class ParseErrors {
  /**
   * Wraps the shared CEL error accumulator.
   */
  constructor(private readonly errs: Errors) {}

  /**
   * Returns the number of accumulated parse errors.
   */
  public errorCount(): number {
    return this.errs.getErrors().length;
  }

  /**
   * Reports an internal parser failure without a source location.
   */
  public internalError(message: string): void {
    this.errs.reportErrorAtId(0, NO_LOCATION, "%s", message);
  }

  /**
   * Reports a syntax error at a concrete source location.
   */
  public syntaxError(location: Location, message: string): void {
    this.errs.reportErrorAtId(0, location, "Syntax error: %s", message);
  }

  /**
   * Forwards an id-scoped error into the shared accumulator.
   */
  public reportErrorAtId(
    id: number,
    location: Location,
    message: string,
    ...args: unknown[]
  ): void {
    this.errs.reportErrorAtId(id, location, message, ...args);
  }
}

import { Error as CommonError } from "./error.js";
import type { Location } from "./location.js";
import { SourceLocation } from "./location.js";
import { type Source, textSource } from "./source.js";

/**
 * Errors contains a list of parsing or diagnostic errors.
 */
export class Errors {
  private readonly errorsValue: CommonError[];
  private readonly sourceValue: Source;
  private numErrorsValue: number;

  /** MaxErrorsToReport bounds the number of emitted display lines. */
  public readonly maxErrorsToReport: number;

  constructor(
    source?: Source,
    errors: CommonError[] = [],
    numErrors = errors.length,
    maxErrors = 100,
  ) {
    this.errorsValue = errors;
    this.sourceValue = source ?? textSource("");
    this.numErrorsValue = numErrors;
    this.maxErrorsToReport = maxErrors;
  }

  /**
   * ReportError records an error at a source location.
   */
  public reportError(location: Location, format: string, ...args: unknown[]): void {
    this.reportErrorAtId(0, location, format, ...args);
  }

  /**
   * ReportErrorString records an already formatted error at a source location.
   */
  public reportErrorString(location: Location, message: string): void {
    this.reportErrorAtId(0, location, "%s", message);
  }

  /**
   * ReportErrorAtId records an error at a source location and expression id.
   */
  public reportErrorAtId(
    exprId: number,
    location: Location,
    format: string,
    ...args: unknown[]
  ): void {
    this.numErrorsValue += 1;
    if (this.numErrorsValue > this.maxErrorsToReport) {
      return;
    }
    this.errorsValue.push(new CommonError(location, sprintf(format, ...args), exprId));
  }

  /**
   * GetErrors returns the list of observed errors.
   */
  public getErrors(): CommonError[] {
    return [...this.errorsValue];
  }

  /**
   * Append creates a new Errors object with the current and input errors.
   */
  public append(errs: CommonError[]): Errors {
    return new Errors(
      this.sourceValue,
      [...this.errorsValue, ...errs],
      this.numErrorsValue + errs.length,
      this.maxErrorsToReport,
    );
  }

  /**
   * ToDisplayString returns the error set as a newline-delimited string.
   */
  public toDisplayString(): string {
    let errorsInString = this.maxErrorsToReport;
    if (this.numErrorsValue > this.maxErrorsToReport) {
      errorsInString += 1;
    } else {
      errorsInString = this.numErrorsValue;
    }
    const result = new Array<string>(errorsInString);
    const sorted = [...this.errorsValue].sort((left, right) => {
      if (left.location.line() !== right.location.line()) {
        return left.location.line() - right.location.line();
      }
      return left.location.column() - right.location.column();
    });
    for (const [index, err] of sorted.entries()) {
      if (index >= this.maxErrorsToReport) {
        break;
      }
      result[index] = err.toDisplayString(this.sourceValue);
    }
    if (this.numErrorsValue > this.maxErrorsToReport) {
      result[this.maxErrorsToReport] =
        `${this.numErrorsValue - this.maxErrorsToReport} more errors were truncated`;
    }
    return result.join("\n");
  }
}

/**
 * ErrorsValue creates an error accumulator.
 */
export function errorsValue(source?: Source, maxErrors?: number): Errors {
  return new Errors(source, [], 0, maxErrors ?? 100);
}

/**
 * NoLocation mirrors the upstream illegal location helper for common errors.
 */
export const noLocation: Location = new SourceLocation(-1, -1);

function sprintf(format: string, ...args: unknown[]): string {
  let argIndex = 0;
  return format.replace(/%[sdv]/g, () => String(args[argIndex++] ?? ""));
}

import type { Location } from "./location.js";
import type { Source } from "./source.js";

const dot = ".";
const ind = "^";
const wideDot = "\uff0e";
const wideInd = "\uff3e";
const maxSnippetLength = 16384;

/**
 * Error describes an issue associated with a source location and expression id.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: this is just how cel-go defines the error type, and we want to keep it consistent for now
export class Error {
  constructor(
    /** Location reports where the error occurred. */
    public readonly location: Location,
    /** Message is the human-readable error. */
    public readonly message: string,
    /** ExprId is the related expression id when available. */
    public readonly exprId = 0,
  ) {}

  /**
   * ToDisplayString decorates the error message with source location context.
   */
  public toDisplayString(source: Source): string {
    let result = `ERROR: ${source.description()}:${this.location.line()}:${this.location.column() + 1}: ${this.message}`;
    const [snippet, found] = source.snippet(this.location.line());
    if (!found || snippet.length > maxSnippetLength) {
      return result;
    }
    const normalized = snippet.replaceAll("\t", " ");
    const srcLine = `\n | ${normalized}`;
    let indLine = "\n | ";
    let remaining = normalized;
    for (let i = 0; i < this.location.column() && remaining.length > 0; i += 1) {
      const codePoint = remaining.codePointAt(0)!;
      const symbol = String.fromCodePoint(codePoint);
      remaining = remaining.slice(symbol.length);
      indLine += codePoint > 0x7f ? wideDot : dot;
    }
    const next = remaining.codePointAt(0);
    indLine += next !== undefined && next > 0x7f ? wideInd : ind;
    result += srcLine + indLine;
    return result;
  }
}

/**
 * ErrorValue creates an error associated with an expression id and source location.
 */
export function errorValue(exprId: number, message: string, location: Location): Error {
  return new Error(location, message, exprId);
}

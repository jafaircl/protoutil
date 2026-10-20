import { RE2JS } from "@bufbuild/re2";

/**
 * RegexProgram exposes the instruction-count method used by the RE2 implementation.
 */
interface RegexProgram {
  /** numInst returns the number of instructions in the compiled regular-expression program. */
  numInst(): number;
}

/**
 * RegexCompiler exposes the compiled program retained by the RE2 implementation.
 */
interface RegexCompiler {
  /** prog is the compiled regular-expression instruction program. */
  prog: RegexProgram;
}

/**
 * regexProgramSize calculates the instruction count of a regular-expression program.
 */
export function regexProgramSize(pattern: string): number {
  const compiled = RE2JS.compile(pattern);
  return (compiled.re2() as unknown as RegexCompiler).prog.numInst();
}

/**
 * compileRegexWithLimit compiles a regular expression and enforces its maximum program size.
 *
 * A non-positive limit leaves the program size unbounded.
 */
export function compileRegexWithLimit(pattern: string, limit: number): RE2JS {
  const compiled = RE2JS.compile(pattern);
  if (limit > 0) {
    const size = (compiled.re2() as unknown as RegexCompiler).prog.numInst();
    if (size > limit) {
      throw new Error(`regex program size ${size} exceeds limit of ${limit}`);
    }
  }
  return compiled;
}

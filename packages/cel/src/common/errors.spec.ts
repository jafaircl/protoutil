import { describe, expect, it } from "vitest";
import { Errors } from "./errors.js";
import { SourceLocation } from "./location.js";
import { stringSource, textSource } from "./source.js";

describe("errors", () => {
  it("common/errors_test.go/TestErrors", () => {
    const source = stringSource("a.b\n&&arg(missing, paren", "errors-test");
    const errors = new Errors(source);
    errors.reportError(new SourceLocation(1, 1), "No such field");
    expect(errors.getErrors()).toHaveLength(1);
    errors.reportError(new SourceLocation(2, 20), "Syntax error, missing paren");
    expect(errors.getErrors()).toHaveLength(2);
    expect(errors.toDisplayString()).toBe(
      "ERROR: errors-test:1:2: No such field\n" +
        " | a.b\n" +
        " | .^\n" +
        "ERROR: errors-test:2:21: Syntax error, missing paren\n" +
        " | &&arg(missing, paren\n" +
        " | ....................^",
    );
  });

  it("common/errors_test.go/TestErrorsReportingLimit", () => {
    const errors = new Errors(textSource("hello world"));
    for (let i = 0; i < 2 * errors.maxErrorsToReport; i += 1) {
      errors.reportError(new SourceLocation(-1, -1), "error %d", i);
    }
    expect(errors.toDisplayString().endsWith("100 more errors were truncated")).toBe(true);
  });

  it("common/errors_test.go/TestErrorsAppendReportingLimit", () => {
    const errors = new Errors(textSource("hello world"));
    for (let i = 0; i < 75; i += 1) {
      errors.reportError(new SourceLocation(-1, -1), "error %d", i);
    }
    const errors2 = new Errors(textSource("hello world"));
    for (let i = 0; i < 75; i += 1) {
      errors2.reportError(new SourceLocation(-1, -1), "error %d", i + 75);
    }
    expect(
      errors
        .append(errors2.getErrors())
        .toDisplayString()
        .endsWith("50 more errors were truncated"),
    ).toBe(true);
  });

  it("common/errors_test.go/TestErrors_WideAndNarrowCharacters", () => {
    const source = stringSource("你好吗\n我a很好\n", "errors-test");
    const errors = new Errors(source);
    errors.reportError(new SourceLocation(2, 3), "Unexpected character '好'");
    expect(errors.toDisplayString()).toBe(
      "ERROR: errors-test:2:4: Unexpected character '好'\n" + " | 我a很好\n" + " | ．.．＾",
    );
  });

  it("common/errors_test.go/TestErrors_WideAndNarrowCharactersWithEmojis", () => {
    const source = stringSource("      '😁' in ['😁', '😑', '😦'] && in.😁", "errors-test");
    const errors = new Errors(source);
    errors.reportError(
      new SourceLocation(1, 32),
      "Syntax error: extraneous input 'in' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}",
    );
    errors.reportError(new SourceLocation(1, 35), "Syntax error: token recognition error at: '😁'");
    errors.reportError(new SourceLocation(1, 36), "Syntax error: missing IDENTIFIER at '<EOF>'");
    expect(errors.toDisplayString()).toBe(
      "ERROR: errors-test:1:33: Syntax error: extraneous input 'in' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}\n" +
        " |       '😁' in ['😁', '😑', '😦'] && in.😁\n" +
        " | .......．.......．....．....．......^\n" +
        "ERROR: errors-test:1:36: Syntax error: token recognition error at: '😁'\n" +
        " |       '😁' in ['😁', '😑', '😦'] && in.😁\n" +
        " | .......．.......．....．....．.........＾\n" +
        "ERROR: errors-test:1:37: Syntax error: missing IDENTIFIER at '<EOF>'\n" +
        " |       '😁' in ['😁', '😑', '😦'] && in.😁\n" +
        " | .......．.......．....．....．.........．^",
    );
  });
});

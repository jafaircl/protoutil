/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseErrorListener, RecognitionException, Recognizer, Token } from 'antlr4ng';
import { Expr } from '../protogen/cel/expr/syntax_pb.js';
import { ReferenceInfo } from './ast.js';
import { Container } from './container.js';
import { CELError } from './error.js';
import { formatCELType, formatFunctionDeclType } from './format.js';
import { Location } from './location.js';
import { Source, TextSource } from './source.js';
import { Type } from './types/types.js';
import { HashSet } from './utils.js';

export class Errors {
  public readonly errors = new HashSet<CELError>();

  constructor(
    public readonly source: Source = new TextSource(''),
    public readonly maxErrorsToReport = 100
  ) {}

  public length() {
    return this.errors.size;
  }

  public reportError(location: Location, message: string) {
    this.reportErrorAtId(BigInt(0), location, message);
  }

  public reportErrorAtId(id: bigint, location: Location, message: string) {
    if (this.errors.size > this.maxErrorsToReport) {
      return;
    }
    this.errors.add(new CELError(id, location, message));
  }

  public reportInternalError(message: string) {
    this.reportError({ line: -1, column: -1 }, message);
  }

  public reportSyntaxError(location: Location, message: string) {
    this.reportError(location, `Syntax error: ${message}`);
  }

  public reportUnexpectedAstTypeError(
    id: bigint,
    location: Location,
    kind: string,
    typeName: string
  ) {
    return this.reportErrorAtId(id, location, `unexpected ${kind} type: ${typeName}`);
  }

  public reportUndeclaredReference(
    id: bigint,
    location: Location,
    container: Container,
    name: string
  ) {
    return this.reportErrorAtId(
      id,
      location,
      `undeclared reference to '${name}' (in container '${container.name}')`
    );
  }

  public reportTypeMismatch(id: bigint, location: Location, expected: Type, actual: Type) {
    return this.reportErrorAtId(
      id,
      location,
      `expected type '${formatCELType(expected)}' but found '${formatCELType(actual)}'`
    );
  }

  public reportTypeDoesNotSupportFieldSelection(id: bigint, location: Location, type: Type) {
    return this.reportErrorAtId(
      id,
      location,
      `type '${type.toString()}' does not support field selection`
    );
  }

  public reportUndefinedField(id: bigint, location: Location, field: string) {
    return this.reportErrorAtId(id, location, `undefined field '${field}'`);
  }

  public reportNotAnOptionalFieldSelection(id: bigint, location: Location, field: Expr) {
    return this.reportErrorAtId(id, location, `unsupported optional field selection: ${field}`);
  }

  public reportNoMatchingOverload(
    id: bigint,
    location: Location,
    name: string,
    args: Type[],
    isInstance: boolean
  ) {
    const signature = formatFunctionDeclType(null, args, isInstance);
    return this.reportErrorAtId(
      id,
      location,
      `found no matching overload for '${name}' applied to '${signature}'`
    );
  }

  public reportNotAType(id: bigint, location: Location, name: string) {
    return this.reportErrorAtId(id, location, `'${name}' is not a type`);
  }

  public reportNotAMessageType(id: bigint, location: Location, name: string) {
    return this.reportErrorAtId(id, location, `'${name}' is not a message type`);
  }

  public reportFieldTypeMismatch(
    id: bigint,
    location: Location,
    name: string,
    field: Type,
    value: Type
  ) {
    return this.reportErrorAtId(
      id,
      location,
      `expected type of field '${name}' is '${field.toString()}' but provided type is '${value.toString()}'`
    );
  }

  public reportUnexpectedFailedResolution(id: bigint, location: Location, name: string) {
    return this.reportErrorAtId(id, location, `unexpected failed resolution of '${name}'`);
  }

  public reportNotAComprehensionRange(id: bigint, location: Location, t: Type) {
    return this.reportErrorAtId(
      id,
      location,
      `expression of type '${t.toString()}' cannot be range of a comprehension (must be list, map, or dynamic)`
    );
  }

  public reportIncompatibleTypes(id: bigint, location: Location, ex: Expr, prev: Type, next: Type) {
    return this.reportErrorAtId(
      id,
      location,
      `incompatible type already exists for expression: ${ex}(${
        ex.id
      }) old:${prev.toString()}, new:${next.toString()}`
    );
  }

  public reportReferenceRedefinition(
    id: bigint,
    location: Location,
    ex: Expr,
    prev: ReferenceInfo,
    next: ReferenceInfo
  ) {
    return this.reportErrorAtId(
      id,
      location,
      `reference already exists for expression: ${ex}(${
        ex.id
      }) old:${prev.toString()}, new:${next.toString()}`
    );
  }

  public toDisplayString() {
    let hasRecursionError = false;
    const errors = [];
    for (const error of this.errors) {
      const str = error.toDisplayString(this.source);
      // Deduplicate recursion errors.
      if (
        str.includes('expression recursion limit exceeded') ||
        str.includes('max recursion depth exceeded')
      ) {
        if (!hasRecursionError) {
          hasRecursionError = true;
          errors.push(str);
        }
      } else {
        errors.push(str);
      }
    }

    return errors.join('\n ');
  }

  /**
   * GetErrors returns the list of observed errors.
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Append creates a new Errors object with the current and input errors.
   */
  append(errs: CELError[]) {
    const e = new Errors(this.source, this.maxErrorsToReport);
    for (const err of this.errors) {
      e.errors.add(err);
    }
    for (const err of errs) {
      e.errors.add(err);
    }
    return e;
  }
}

export class LexerErrorListener extends BaseErrorListener {
  constructor(private readonly errors: Errors) {
    super();
  }

  override syntaxError(
    recognizer: Recognizer<any>,
    offendingSymbol: Token | null,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | null
  ): void {
    this.errors.reportSyntaxError({ line, column: charPositionInLine }, msg);
  }
}

export class ParserErrorListener extends BaseErrorListener {
  constructor(
    // private readonly parserHelper: ParserHelper,
    private readonly errors: Errors
  ) {
    super();
  }

  override syntaxError(
    recognizer: Recognizer<any>,
    offendingSymbol: Token | null,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | null
  ): void {
    if (msg.startsWith('expression recursion limit exceeded')) {
      this.errors.reportInternalError(msg);
    } else {
      this.errors.reportSyntaxError({ line, column: charPositionInLine }, msg);
    }
  }
}

import type { Expr } from "../gen/google/api/expr/v1alpha1/syntax_pb.js";
import type { Position } from "./position.js";

export class LexError extends Error {
  constructor(
    message: string,
    public readonly filter?: string,
    public readonly position?: Position,
  ) {
    super(message);
    this.name = "LexError";
  }
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly filter?: string,
    public readonly position?: Position,
    public readonly err?: Error,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export class FilterTypeError extends Error {
  constructor(
    message: string,
    public readonly expr?: Expr,
    public readonly err?: Error,
  ) {
    super(message);
    this.name = "FilterTypeError";
  }
}

export function drillDownOnErrorMessage(err: ParseError | LexError | FilterTypeError) {
  let message = err.message;
  while ("err" in err) {
    if (!err.err) {
      break;
    }
    message = err.err.message;
    err = err.err;
  }
  return message;
}

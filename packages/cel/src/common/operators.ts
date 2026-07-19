// String "names" for CEL operators.

// Symbolic operators.
export const Conditional = "_?_:_";
export const LogicalAnd = "_&&_";
export const LogicalOr = "_||_";
export const LogicalNot = "!_";
export const Equals = "_==_";
export const NotEquals = "_!=_";
export const Less = "_<_";
export const LessEquals = "_<=_";
export const Greater = "_>_";
export const GreaterEquals = "_>=_";
export const Add = "_+_";
export const Subtract = "_-_";
export const Multiply = "_*_";
export const Divide = "_/_";
export const Modulo = "_%_";
export const Negate = "-_";
export const Index = "_[_]";
export const OptIndex = "_[?_]";
export const OptSelect = "_?._";

// Macros, must have a valid identifier.
export const Has = "has";
export const All = "all";
export const Exists = "exists";
export const ExistsOne = "exists_one";
const MapOperator = "map";
export { MapOperator as Map };
export const Filter = "filter";

// Named operators, must not have be valid identifiers.
export const NotStrictlyFalse = "@not_strictly_false";
export const In = "@in";

// Deprecated: named operators with valid identifiers.
export const OldNotStrictlyFalse = "__not_strictly_false__";
export const OldIn = "_in_";

const operators: Record<string, string> = {
  "+": Add,
  "/": Divide,
  "==": Equals,
  ">": Greater,
  ">=": GreaterEquals,
  in: In,
  "<": Less,
  "<=": LessEquals,
  "%": Modulo,
  "*": Multiply,
  "!=": NotEquals,
  "-": Subtract,
};

type OperatorEntry = {
  displayName: string;
  precedence: number;
  arity: number;
};

// operatorMap of the operator symbol which refers to a struct containing the display name,
// if applicable, the operator precedence, and the arity.
//
// If the symbol does not have a display name listed in the map, it is only because it requires
// special casing to render properly as text.
const operatorMap: Record<string, OperatorEntry> = {
  [Conditional]: { displayName: "", precedence: 8, arity: 3 },
  [LogicalOr]: { displayName: "||", precedence: 7, arity: 2 },
  [LogicalAnd]: { displayName: "&&", precedence: 6, arity: 2 },
  [Equals]: { displayName: "==", precedence: 5, arity: 2 },
  [Greater]: { displayName: ">", precedence: 5, arity: 2 },
  [GreaterEquals]: { displayName: ">=", precedence: 5, arity: 2 },
  [In]: { displayName: "in", precedence: 5, arity: 2 },
  [Less]: { displayName: "<", precedence: 5, arity: 2 },
  [LessEquals]: { displayName: "<=", precedence: 5, arity: 2 },
  [NotEquals]: { displayName: "!=", precedence: 5, arity: 2 },
  [OldIn]: { displayName: "in", precedence: 5, arity: 2 },
  [Add]: { displayName: "+", precedence: 4, arity: 2 },
  [Subtract]: { displayName: "-", precedence: 4, arity: 2 },
  [Divide]: { displayName: "/", precedence: 3, arity: 2 },
  [Modulo]: { displayName: "%", precedence: 3, arity: 2 },
  [Multiply]: { displayName: "*", precedence: 3, arity: 2 },
  [LogicalNot]: { displayName: "!", precedence: 2, arity: 1 },
  [Negate]: { displayName: "-", precedence: 2, arity: 1 },
  [Index]: { displayName: "", precedence: 1, arity: 2 },
  [OptIndex]: { displayName: "", precedence: 1, arity: 2 },
  [OptSelect]: { displayName: "", precedence: 1, arity: 2 },
};

/**
 * Find returns the internal function name for an operator symbol, if the input text is one.
 */
export function find(text: string): [string, boolean] {
  const operator = operators[text];
  return operator === undefined ? ["", false] : [operator, true];
}

/**
 * FindReverse returns the unmangled text representation of the operator.
 */
export function findReverse(symbol: string): [string, boolean] {
  const operator = operatorMap[symbol];
  if (operator === undefined) {
    return ["", false];
  }
  return [operator.displayName, true];
}

/**
 * FindReverseBinaryOperator returns the unmangled text representation of a binary operator.
 */
export function findReverseBinaryOperator(symbol: string): [string, boolean] {
  const operator = operatorMap[symbol];
  if (operator === undefined || operator.arity !== 2) {
    return ["", false];
  }
  if (operator.displayName === "") {
    return ["", false];
  }
  return [operator.displayName, true];
}

/**
 * Precedence returns the operator precedence, where a higher number indicates higher precedence.
 */
export function precedence(symbol: string): number {
  const operator = operatorMap[symbol];
  if (operator === undefined) {
    return 0;
  }
  return operator.precedence;
}

/**
 * Arity returns the number of arguments the operator takes, or `-1` for an unknown symbol.
 */
export function arity(symbol: string): number {
  const operator = operatorMap[symbol];
  if (operator === undefined) {
    return -1;
  }
  return operator.arity;
}

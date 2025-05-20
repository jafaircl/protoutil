// Symbolic operators.
export const CONDITIONAL_OPERATOR = '_?_:_';
export const LOGICAL_AND_OPERATOR = '_&&_';
export const LOGICAL_OR_OPERATOR = '_||_';
export const LOGICAL_NOT_OPERATOR = '!_';
export const EQUALS_OPERATOR = '_==_';
export const NOT_EQUALS_OPERATOR = '_!=_';
export const LESS_OPERATOR = '_<_';
export const LESS_EQUALS_OPERATOR = '_<=_';
export const GREATER_OPERATOR = '_>_';
export const GREATER_EQUALS_OPERATOR = '_>=_';
export const ADD_OPERATOR = '_+_';
export const SUBTRACT_OPERATOR = '_-_';
export const MULTIPLY_OPERATOR = '_*_';
export const DIVIDE_OPERATOR = '_/_';
export const MODULO_OPERATOR = '_%_';
export const NEGATE_OPERATOR = '-_';
export const INDEX_OPERATOR = '_[_]';
export const OPT_INDEX_OPERATOR = '_[?_]';
export const OPT_SELECT_OPERATOR = '_?._';

// Macros, must have a valid identifier.
export const HAS_MACRO = 'has';
export const ALL_MACRO = 'all';
export const EXISTS_MACRO = 'exists';
export const EXISTS_ONE_MACRO = 'exists_one';
export const MAP_MACRO = 'map';
export const FILTER_MACRO = 'filter';

// Named operators, must not have be valid identifiers.
export const NOT_STRICTLY_FALSE_OPERATOR = '@not_strictly_false';
export const IN_OPERATOR = '@in';

const operatorMap = new Map<string, { displayName: string; precedence: number; arity: number }>([
  [CONDITIONAL_OPERATOR, { displayName: '', precedence: 8, arity: 3 }],
  [LOGICAL_OR_OPERATOR, { displayName: 'OR', precedence: 7, arity: 2 }],
  [LOGICAL_AND_OPERATOR, { displayName: 'AND', precedence: 6, arity: 2 }],
  [EQUALS_OPERATOR, { displayName: '=', precedence: 5, arity: 2 }],
  [GREATER_OPERATOR, { displayName: '>', precedence: 5, arity: 2 }],
  [GREATER_EQUALS_OPERATOR, { displayName: '>=', precedence: 5, arity: 2 }],
  [LESS_OPERATOR, { displayName: '<', precedence: 5, arity: 2 }],
  [LESS_EQUALS_OPERATOR, { displayName: '<=', precedence: 5, arity: 2 }],
  [NOT_EQUALS_OPERATOR, { displayName: '!=', precedence: 5, arity: 2 }],
  [IN_OPERATOR, { displayName: 'IN', precedence: 5, arity: 2 }],
  [ADD_OPERATOR, { displayName: '+', precedence: 4, arity: 2 }],
  [SUBTRACT_OPERATOR, { displayName: '-', precedence: 4, arity: 2 }],
  [DIVIDE_OPERATOR, { displayName: '/', precedence: 3, arity: 2 }],
  [MODULO_OPERATOR, { displayName: '%', precedence: 3, arity: 2 }],
  [MULTIPLY_OPERATOR, { displayName: '*', precedence: 3, arity: 2 }],
  [LOGICAL_NOT_OPERATOR, { displayName: '!', precedence: 2, arity: 1 }],
  [NEGATE_OPERATOR, { displayName: '-', precedence: 2, arity: 1 }],
  [INDEX_OPERATOR, { displayName: '', precedence: 1, arity: 2 }],
  [OPT_INDEX_OPERATOR, { displayName: '', precedence: 1, arity: 2 }],
  [OPT_SELECT_OPERATOR, { displayName: '', precedence: 1, arity: 2 }],
]);

export function findReverse(operator: string) {
  const op = operatorMap.get(operator);
  if (!op) {
    return '';
  }
  return op.displayName;
}

export function findReverseBinaryOperator(symbol: string) {
  const op = operatorMap.get(symbol);
  if (!op || op.arity !== 2) {
    return '';
  }
  if (op.displayName === '') {
    return '';
  }
  return op.displayName;
}

export function precedence(symbol: string) {
  const op = operatorMap.get(symbol);
  if (!op) {
    return 0;
  }
  return op.precedence;
}

export function arity(symbol: string) {
  const op = operatorMap.get(symbol);
  if (!op) {
    return -1;
  }
  return op.arity;
}

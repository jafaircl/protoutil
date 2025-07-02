import { Ast } from '@protoutil/cel';
import { translate, translateCompiled } from '../translate.js';
import { DefaultCostEstimator } from './cost.js';
import { DefaultDialect } from './dialect.js';
import { DefaultEnv } from './env.js';

let defaultDialect: DefaultDialect | null = null;

function getDefaultDialect(): DefaultDialect {
  if (!defaultDialect) {
    defaultDialect = new DefaultDialect();
  }
  return defaultDialect;
}

/**
 * Translate a compiled CEL AST into an SQL query string using the provided environment and default dialect.
 *
 * This is helpful if you already have a compiled AST and want to convert it to SQL without recompiling the expression.
 */
export function translateDefaultCompiled(
  ast: Ast,
  env: DefaultEnv,
  costHints: Map<string, bigint> = new Map()
) {
  return translateCompiled(ast, env, getDefaultDialect(), new DefaultCostEstimator(costHints));
}

/**
 * Translate a CEL expression into an SQL query string using the provided environment and default dialect.
 */
export function translateDefault(
  expr: string,
  env: DefaultEnv,
  costHints: Map<string, bigint> = new Map()
) {
  return translate(expr, env, getDefaultDialect(), new DefaultCostEstimator(costHints));
}

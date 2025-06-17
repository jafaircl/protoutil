import { Ast, CostEstimate, CostEstimator, Env } from '@protoutil/cel';
import { compile } from './compile.js';
import { Dialect } from './dialect.js';
import { unparse } from './unparse.js';

/**
 * Translate a compiled CEL AST into an SQL query string and variables using the provided environment and dialect.
 *
 * This is helpful if you already have a compiled AST and want to convert it to SQL without recompiling the expression.
 */
export function translateCompiled(
  ast: Ast,
  env: Env,
  dialect: Dialect,
  estimator: CostEstimator | null
): { sql: string; vars: unknown[]; cost: CostEstimate | null } {
  const { sql, vars } = unparse(ast, dialect);
  let cost: CostEstimate | null = null;
  if (estimator) {
    cost = env.estimateCost(ast, estimator);
  }
  return { sql, vars, cost };
}

/**
 * Translate a CEL expression into an SQL query string and variables using the provided environment and dialect.
 */
export function translate(
  expr: string,
  env: Env,
  dialect: Dialect,
  estimator: CostEstimator | null
): { sql: string; vars: unknown[]; cost: CostEstimate | null } {
  const compiled = compile(expr, env);
  return translateCompiled(compiled, env, dialect, estimator);
}

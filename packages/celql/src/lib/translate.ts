import { CostEstimate, CostEstimator, Env } from '@protoutil/cel';
import { compile } from './compile.js';
import { Dialect } from './dialect.js';
import { unparse } from './unparse.js';

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
  const { sql, vars } = unparse(compiled, dialect);
  let cost: CostEstimate | null = null;
  if (estimator) {
    cost = env.estimateCost(compiled, estimator);
  }
  return {
    sql,
    vars,
    cost: cost,
  };
}

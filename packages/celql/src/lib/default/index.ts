import { translate } from '../translate.js';
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
 * Translate a CEL expression into an SQL query string using the provided environment and default dialect.
 */
export function translateDefault(
  expr: string,
  env: DefaultEnv,
  costHints: Map<string, bigint> = new Map()
) {
  return translate(expr, env, getDefaultDialect(), new DefaultCostEstimator(costHints));
}

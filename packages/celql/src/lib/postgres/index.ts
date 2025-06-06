import { translate } from '../translate.js';
import { PostgresCostEstimator } from './cost.js';
import { PostgresDialect } from './dialect.js';
import { PostgresEnv } from './env.js';

let postgresDialect: PostgresDialect | null = null;

function getPostgresDialect(): PostgresDialect {
  if (!postgresDialect) {
    postgresDialect = new PostgresDialect();
  }
  return postgresDialect;
}

/**
 * Translate a CEL expression into a PostgreSQL query string using the provided environment and default dialect.
 */
export function translatePostgres(
  expr: string,
  env: PostgresEnv,
  costHints: Map<string, bigint> = new Map()
) {
  return translate(expr, env, getPostgresDialect(), new PostgresCostEstimator(costHints));
}

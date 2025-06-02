import { translate } from '../translate.js';
import { PostgresDialect } from './dialect.js';
import { PostgresEnv } from './env.js';

let postgresDialect: PostgresDialect | null;

function getPostgresDialect(): PostgresDialect {
  if (!postgresDialect) {
    postgresDialect = new PostgresDialect();
  }
  return postgresDialect;
}

/**
 * Translate a CEL expression into a PostgreSQL query string using the provided environment and default dialect.
 */
export function translatePostgres(expr: string, env: PostgresEnv) {
  return translate(expr, env, getPostgresDialect());
}

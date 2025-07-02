import { Ast } from '@protoutil/cel';
import { translate, translateCompiled } from '../translate.js';
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
 * Translate a compiled CEL AST into a PostgreSQL query string using the provided environment and default dialect.
 *
 * This is helpful if you already have a compiled AST and want to convert it to SQL without recompiling the expression.
 */
export function translatePostgresCompiled(
  ast: Ast,
  env: PostgresEnv,
  costHints: Map<string, bigint> = new Map()
) {
  return translateCompiled(ast, env, getPostgresDialect(), new PostgresCostEstimator(costHints));
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

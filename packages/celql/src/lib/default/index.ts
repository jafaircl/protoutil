import { translate } from '../translate.js';
import { DefaultDialect } from './dialect.js';
import { DefaultEnv } from './env.js';

let defaultDialect: DefaultDialect | null;

function getDefaultDialect(): DefaultDialect {
  if (!defaultDialect) {
    defaultDialect = new DefaultDialect();
  }
  return defaultDialect;
}

/**
 * Translate a CEL expression into an SQL query string using the provided environment and default dialect.
 */
export function translateDefault(expr: string, env: DefaultEnv) {
  return translate(expr, env, getDefaultDialect());
}

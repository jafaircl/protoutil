import { Env } from '@protoutil/cel';
import { compile } from './compile.js';
import { Dialect } from './dialect.js';
import { unparse } from './unparse.js';

/**
 * Translate a CEL expression into an SQL query string and variables using the provided environment and dialect.
 */
export function translate(expr: string, env: Env, dialect: Dialect) {
  const compiled = compile(expr, env);
  return unparse(compiled, dialect);
}

import { Env } from '@bearclaw/cel';
import { compile } from './compile.js';
import { Dialect } from './dialect.js';
import { Unparser } from './unparser.js';

/**
 * Translate a CEL expression into an SQL query string using the provided environment and dialect.
 */
export function translate(expr: string, env: Env, dialect: Dialect) {
  const compiled = compile(expr, env);
  const unparser = new Unparser(compiled, dialect);
  return unparser.unparse();
}

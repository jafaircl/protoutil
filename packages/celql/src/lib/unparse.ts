import { Ast } from '@protoutil/cel';
import { Dialect } from './dialect.js';
import { Unparser } from './unparser.js';

/**
 * Unparse a compiled CEL expression into a SQL string and variables using the provided dialect.
 */
export function unparse(compiled: Ast, dialect: Dialect): { sql: string; vars: unknown[] } {
  if (!compiled.isChecked()) {
    throw new Error('expression must be checked before unparse');
  }
  const unparser = new Unparser(compiled, dialect);
  return unparser.unparse();
}

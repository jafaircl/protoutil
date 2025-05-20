import { BoolType, Env, Issues } from '@bearclaw/cel';
import { DEFAULT_DIALECT, Dialect } from './dialect.js';
import { Unparser } from './unparser.js';

export function sql(
  expression: string,
  env: Env,
  dialect: Dialect = DEFAULT_DIALECT
): { sql: string; vars: unknown[] } {
  const compiled = env.compile(expression);
  if (compiled instanceof Issues) {
    throw compiled.err();
  }
  if (!compiled.outputType()?.equal(BoolType).value()) {
    throw new Error('Expression must be a boolean expression');
  }
  const unparser = new Unparser(compiled, dialect);
  return unparser.unparse();
}

export function celql(): string {
  return 'celql';
}

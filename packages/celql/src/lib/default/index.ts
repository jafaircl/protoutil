import { compile } from '../compile.js';
import { Unparser } from '../unparser.js';
import { DefaultDialect } from './dialect.js';
import { DefaultEnv } from './env.js';

let defaultDialect: DefaultDialect | null;

function getDefaultDialect(): DefaultDialect {
  if (!defaultDialect) {
    defaultDialect = new DefaultDialect();
  }
  return defaultDialect;
}

export function defaultSql(expr: string, env: DefaultEnv) {
  const compiled = compile(expr, env);
  const unparser = new Unparser(compiled, getDefaultDialect());
  return unparser.unparse();
}

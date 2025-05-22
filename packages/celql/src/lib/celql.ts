import { Ast, BoolType, Env, Issues } from '@bearclaw/cel';
import { Dialect, MySqlDialect, PostgresqlDialect } from './dialect.js';
import { Unparser } from './unparser.js';

/**
 * Compile a CEL expression into an AST. This will check to make sure the expression
 * is a valid CEL expression that will evaluate to a boolean value. It can be used
 * on the front end to validate the expression before sending it to the server.
 */
export function compile(expression: string, env: Env): Ast {
  const compiled = env.compile(expression);
  if (compiled instanceof Issues) {
    throw compiled.err();
  }
  if (!compiled.outputType()?.equal(BoolType).value()) {
    throw new Error('Expression must be a boolean expression');
  }
  return compiled;
}

/**
 * Convert a CEL expression into a SQL expression. This will compile the expression
 * and then unparse it into a SQL expression. The dialect can be specified to
 * generate the correct SQL syntax for the database being used.
 */
export function sql(
  expression: string,
  env: Env,
  dialect: Dialect
): { sql: string; vars: unknown[] } {
  const compiled = compile(expression, env);
  const unparser = new Unparser(compiled, dialect);
  return unparser.unparse();
}

const POSTGRESQL_DIALECT = new PostgresqlDialect();

/**
 * Convert a CEL expression into a PostgreSQL expression.
 */
export function postgres(expression: string, env: Env): { sql: string; vars: unknown[] } {
  return sql(expression, env, POSTGRESQL_DIALECT);
}

const MYSQL_DIALECT = new MySqlDialect();

/**
 * Convert a CEL expression into a MySQL expression.
 */
export function mysql(expression: string, env: Env): { sql: string; vars: unknown[] } {
  return sql(expression, env, MYSQL_DIALECT);
}

import { Ast, BoolType, CELError, Env, Issues } from '@bearclaw/cel';

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
    const ast = compiled.nativeRep();
    const expr = ast.expr();
    const sourceInfo = compiled.nativeRep().sourceInfo();
    const location = sourceInfo.getStartLocation(expr.id);
    const errMessage = new CELError(
      expr.id,
      location,
      'expression must evaluate to a boolean value'
    ).toDisplayString(sourceInfo.source());
    throw new Error(errMessage);
  }
  return compiled;
}

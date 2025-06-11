/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isMessage } from '@bufbuild/protobuf';
import {
  BoolType,
  CELError,
  Env,
  Issues,
  maybeForeignType,
  maybeUnwrapOptional,
  newActivation,
  Program,
  VariableDecl,
} from '@protoutil/cel';

export class Policy {
  #program: Program | null = null;
  #envVariableMap = new Map<string, VariableDecl>();

  constructor(
    public readonly name: string,
    public readonly expr: string,
    public readonly env: Env
  ) {}

  /**
   * Check if the policy has been compiled. A policy is considered compiled if the
   * `compile` method has been called and the expression is valid.
   */
  public get compiled() {
    return this.#program !== null;
  }

  /**
   * Compile a CEL expression into a program. This will check to make sure the expression
   * is a valid CEL expression that will evaluate to a boolean value. The compiled program
   * can then be evaluated against a set of bindings to determine if the policy allows the
   * requested action.
   */
  compile() {
    if (this.compiled) {
      return;
    }
    const compiled = this.env.compile(this.expr);
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
        `expression must evaluate to a boolean value, got '${compiled
          .outputType()
          ?.toString()}' instead`
      ).toDisplayString(sourceInfo.source());
      throw new Error(errMessage);
    }
    const program = this.env.program(compiled);
    if (program instanceof Error) {
      throw program;
    }
    for (const v of this.env.variables) {
      this.#envVariableMap.set(v.name(), v);
    }
    this.#program = program;
  }

  /**
   * Check that all the keys in the bindings map are present in the environment variable
   * map, and that the type of the binding value matches the type of the variable in the
   * environment. Calling `check` before `compile` will lazily compile the expression.
   */
  check(bindings: Map<string, any> | Record<string, any>): boolean {
    if (!this.compiled) {
      this.compile();
    }
    for (const key of Object.keys(bindings)) {
      // If the key is not in the environment variable map, the binding is unimportant
      if (!this.#envVariableMap.has(key)) {
        continue;
      }
      // If the type of the binding value does not match the type of the variable in
      // the environment, the bindings are invalid
      const envVariable = this.#envVariableMap.get(key)!;
      const envVariableType = maybeUnwrapOptional(envVariable.type());
      const bindingValue = bindings instanceof Map ? bindings.get(key) : bindings[key];
      if (isMessage(bindingValue) && envVariableType.typeName() === bindingValue.$typeName) {
        // If the binding value is a message, we allow it if the type name matches
        continue;
      }
      const valueType = maybeForeignType(this.env.adapter.nativeToValue(bindingValue).type());
      if (!envVariableType.isAssignableType(valueType)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate the compiled CEL expression against the provided bindings. Calling
   * `allow` before `compile` will lazily compile the expression.
   */
  allow(bindings: Map<string, any> | Record<string, any>): boolean {
    if (!this.compiled) {
      this.compile();
    }
    if (!this.check(bindings)) {
      return false;
    }
    const activation = newActivation(bindings);
    const [allowed] = this.#program!.eval(activation);
    return allowed?.value() ?? false;
  }
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  BoolType,
  BoolVal,
  CELError,
  DynType,
  EmptyActivation,
  Env,
  func,
  isRegistry,
  Issues,
  mapType,
  overload,
  overloadUnaryBinding,
  Program,
  StringType,
  types,
} from '@protoutil/cel';
import { Policy } from './policy.js';

/**
 * A PolicyTest is a test for a CEL policy expression. It allows you to define a CEL Policy
 * expression and a test expression with bindings that will be evaluated against the policy.
 *
 * @example
 * ```typescript
 * import { Env, StringType, types, variable } from '@protoutil/cel';
 * import { Policy, PolicyTest } from '@protoutil/cel-policy-agent';
 * const policy = new Policy('testPolicy', 'input == "allowed"', new Env(variable('input', StringType)));
 * const positiveTest = new PolicyTest('test1', 'allow({ "input": "allowed" }) == true', policy);
 * positiveTest.compile();
 * const positiveResult = positiveTest.run();
 * console.log(positiveResult.result); // true
 * const negativeTest = new PolicyTest('test2', 'allow({ "input": "not-allowed" }) == false', policy);
 * negativeTest.compile();
 * const negativeResult = negativeTest.run();
 * console.log(negativeResult.result); // true
 * ```
 */
export class PolicyTest {
  #program: Program | null = null;

  constructor(
    public readonly name: string,
    public readonly expression: string,
    public readonly policy: Policy,
    public env: Env = new Env()
  ) {}

  /**
   * Check if the policy test has been compiled. A policy test is considered compiled if the
   * `compile` method has been called and the expression is valid.
   */
  public get compiled(): boolean {
    return this.#program !== null;
  }

  /**
   * Compile the CEL expression into a program. This will check to make sure the expression
   * is a valid CEL expression that will evaluate to a boolean value. The compiled program
   * can then be evaluated against a set of bindings to determine if the policy allows the
   * requested action.
   */
  compile() {
    if (this.compiled) {
      return;
    }
    if (isRegistry(this.policy.env.provider)) {
      this.env = this.env.extend(types(...this.policy.env.provider.descriptors().values()));
    }
    // Add the `allow` function to the environment
    const boundAllow = this.policy.allow.bind(this.policy);
    this.env = this.env.extend(
      func(
        'allow',
        overload(
          'allow_overload',
          [mapType(StringType, DynType)],
          BoolType,
          overloadUnaryBinding((x) => new BoolVal(boundAllow(x.convertToNative(Object))))
        )
      )
    );
    const compiled = this.env.compile(this.expression);
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
    this.#program = program;
  }

  /**
   * Run the policy test against the compiled program. This will evaluate the
   * policy test expression against an empty activation, as policy test
   * bindings are defined within the test expression.
   */
  run() {
    if (!this.policy.compiled) {
      this.policy.compile();
    }
    if (!this.compiled) {
      this.compile();
    }
    const [result] = this.#program!.eval(new EmptyActivation());
    return (result?.value() as boolean | null) ?? false;
  }
}

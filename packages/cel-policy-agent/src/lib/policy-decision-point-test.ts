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
import { PolicyDecisionPoint } from './policy-decision-point.js';

/**
 * A PolicyDecisionPointTest is a test for a CEL policy decision point. It allows you to define a CEL
 * Policy Decision Point (PDP) and a test expression with bindings that will be evaluated against the PDP.
 *
 * @example
 * ```typescript
 * import { Env, StringType, types, variable } from '@protoutil/cel';
 * import { Policy, PolicyDecisionPoint, PolicyDecisionPointTest } from '@protoutil/cel-policy-agent';
 * const pdp = new PolicyDecisionPoint();
 * const policy = new Policy('testPolicy', 'input == "allowed"', new Env(variable('input', StringType)));
 * pdp.add(policy);
 * const test = new PolicyDecisionPointTest(
 *   'test1',
 *   'allow({ "input": "allowed" }) == true',
 *    pdp
 * );
 * test.compile();
 * const result = test.run();
 * console.log(result.result); // true
 * const negativeTest = new PolicyDecisionPointTest(
 *   'test2',
 *   'allow({ "input": "not-allowed" }) == false',
 *   pdp
 * );
 * negativeTest.compile();
 * const negativeResult = negativeTest.run();
 * console.log(negativeResult.result); // true
 */
export class PolicyDecisionPointTest {
  #program: Program | null = null;

  constructor(
    public readonly name: string,
    public readonly expression: string,
    public readonly pdp: PolicyDecisionPoint,
    public env: Env = new Env()
  ) {}

  /**
   * Check if the PDP test has been compiled. A PDP test is considered compiled if the
   * `compile` method has been called and the expression is valid.
   */
  public get compiled(): boolean {
    return this.#program !== null;
  }

  /**
   * Compile the CEL expression into a program. This will check to make sure the expression
   * is a valid CEL expression that will evaluate to a boolean value. The compiled program
   * can then be evaluated against a set of bindings to determine if the PDP allows the
   * requested action.
   */
  compile() {
    if (this.compiled) {
      return;
    }
    for (const policy of this.pdp.policies) {
      if (isRegistry(policy.env.provider)) {
        this.env = this.env.extend(types(...policy.env.provider.descriptors().values()));
      }
    }
    // Add the `allow` function to the environment
    const boundAllow = this.pdp.allow.bind(this.pdp);
    this.env = this.env.extend(
      func(
        'allow',
        overload(
          'allow_overload',
          [mapType(StringType, DynType)],
          BoolType,
          overloadUnaryBinding((x) => new BoolVal(boundAllow(x.convertToNative(Object)).allowed))
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
   * Run the policy decision point test against the compiled program. This will
   * evaluate the test expression against an empty activation, as the PDP test
   * bindings are defined within the test expression.
   */
  run() {
    if (!this.compiled) {
      this.compile();
    }
    const [result] = this.#program!.eval(new EmptyActivation());
    return (result?.value() as boolean | null) ?? false;
  }
}

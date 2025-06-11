/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  BoolType,
  BoolVal,
  CELError,
  DynType,
  EmptyActivation,
  Env,
  EnvOption,
  func,
  Issues,
  mapType,
  overload,
  overloadUnaryBinding,
  Program,
  StringType,
} from '@protoutil/cel';
import { Policy } from './policy.js';

export class PolicyTest {
  #env: Env | null = null;
  #program: Program | null = null;

  constructor(
    public readonly name: string,
    public readonly expression: string,
    public readonly policy: Policy
  ) {}

  /**
   * Check if the policy test has been compiled. A policy test is considered compiled if the
   * `compile` method has been called and the expression is valid.
   */
  public get compiled(): boolean {
    return this.#program !== null;
  }

  /**
   * A CEL function that allows the policy to be evaluated against a set of bindings.
   */
  #allowFunc() {
    const boundAllow = this.policy.allow.bind(this.policy);
    return func(
      'allow',
      overload(
        'allow_overload',
        [mapType(StringType, DynType)],
        BoolType,
        overloadUnaryBinding((x) => {
          return new BoolVal(boundAllow(x.convertToNative(Object)));
        })
      )
    );
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
    const opts: EnvOption[] = [];
    if (!this.policy.env.hasFunction('allow')) {
      opts.push(this.#allowFunc());
    }
    this.#env = this.policy.env.extend(...opts);
    const compiled = this.#env.compile(this.expression);
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
    const program = this.#env.program(compiled);
    if (program instanceof Error) {
      throw program;
    }
    this.#program = program;
  }

  /**
   * Run the policy test against the compiled program. This will evaluate the
   * policy test expression against an empty activation, as policy tests
   * bindings are defined within the test expression.
   */
  run() {
    if (!this.policy.compiled) {
      this.policy.compile();
    }
    if (!this.compiled) {
      this.compile();
    }
    const [result, details, err] = this.#program!.eval(new EmptyActivation());
    return { result, details, err };
  }
}

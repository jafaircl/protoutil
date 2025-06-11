import { create } from '@bufbuild/protobuf';
import { BoolType, Env, objectType, StringType, types, variable } from '@protoutil/cel';
import { NestedTestAllTypesSchema, TestAllTypesSchema } from '@protoutil/core/unittest-proto3';
import { Policy } from './policy.js';
import { formatError } from './test-helpers.js';

describe('Policy', () => {
  it('compile should throw an error if the expression is not valid', () => {
    expect(() => new Policy('a', '1 +', new Env()).compile()).toThrow(
      formatError(`ERROR: <input>:1:4: Syntax error: mismatched input '<EOF>' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}
     | 1 +
     | ...^`)
    );
  });

  it('compile should throw an error if the expression does not evaluate to a boolean', () => {
    const policy = new Policy('a', '1 + 2', new Env());
    expect(() => policy.compile()).toThrow(
      formatError(
        `ERROR: <input>:1:3: expression must evaluate to a boolean value, got 'int' instead
     | 1 + 2
     | ..^`
      )
    );
  });

  const checkTestCasess = [
    {
      name: 'simple',
      expr: 'input == "test"',
      env: new Env(variable('input', StringType)),
      input: { input: 'test' },
      expected: true,
    },
    {
      name: 'simple false',
      expr: 'input == "test"',
      env: new Env(variable('input', StringType)),
      input: { input: 1 },
      expected: false,
    },
    {
      name: 'extra variables',
      expr: 'input == "value"',
      env: new Env(variable('input', StringType), variable('opt', StringType)),
      input: { input: 'value' },
      expected: true,
    },
    {
      name: 'extra bindings',
      expr: 'input == "value"',
      env: new Env(variable('input', StringType), variable('opt', StringType)),
      input: { input: 'value', opt: 'extra' },
      expected: true,
    },
    {
      name: 'erroneous bindings',
      expr: 'input == "value"',
      env: new Env(variable('input', StringType)),
      input: { input: 'value', asdf: 1 },
      expected: true,
    },
    {
      name: 'message bindings',
      expr: 'message.optional_string == "test"',
      env: new Env(
        types(TestAllTypesSchema),
        variable('message', objectType(TestAllTypesSchema.typeName))
      ),
      input: {
        message: create(TestAllTypesSchema, { optionalString: 'test' }),
      },
      expected: true,
    },
    {
      name: 'invalid message bindings',
      expr: 'message.optional_string == "test"',
      env: new Env(
        types(TestAllTypesSchema),
        variable('message', objectType(TestAllTypesSchema.typeName))
      ),
      input: {
        message: create(NestedTestAllTypesSchema, { child: { payload: { optionalBool: true } } }), // Invalid type
      },
      expected: false,
    },
  ];
  for (const tc of checkTestCasess) {
    it(`check should check bindings: ${tc.name}`, () => {
      const policy = new Policy(tc.name, tc.expr, tc.env);
      expect(() => policy.compile()).not.toThrow();
      expect(policy.check(tc.input)).toBe(tc.expected);
    });
  }

  it('allow should lazily compile the expression', () => {
    const policy = new Policy('a', 'true', new Env());
    expect(() => policy.allow({})).not.toThrow();
    expect(policy.compiled).toBe(true);
  });

  const allowTestCases = [
    {
      name: 'boolean constant',
      expression: 'true',
      env: new Env(),
      input: {},
      allowed: true,
    },
    {
      name: 'boolean constant false',
      expression: 'false',
      env: new Env(),
      input: {},
      allowed: false,
    },
    {
      name: 'string equality',
      expression: '"hello" == "hello"',
      env: new Env(),
      input: {},
      allowed: true,
    },
    {
      name: 'string equality false',
      expression: '"hello" == "world"',
      env: new Env(),
      input: {},
      allowed: false,
    },
    {
      name: 'variable string equality',
      expression: 'input == "test"',
      env: new Env(variable('input', StringType)),
      input: { input: 'test' },
      allowed: true,
    },
    {
      name: 'variable string equality false',
      expression: 'input == "test"',
      env: new Env(variable('input', StringType)),
      input: { input: 'not-test' },
      allowed: false,
    },
    {
      name: 'boolean variable',
      expression: 'isAllowed',
      env: new Env(variable('isAllowed', BoolType)),
      input: { isAllowed: true },
      allowed: true,
    },
    {
      name: 'boolean variable false',
      expression: 'isAllowed',
      env: new Env(variable('isAllowed', BoolType)),
      input: { isAllowed: false },
      allowed: false,
    },
    {
      name: 'unrelated bindings',
      expression: 'true',
      env: new Env(variable('input', StringType)),
      input: { input: 1 },
      allowed: false,
    },
  ];
  for (const tc of allowTestCases) {
    it(`should determine if bindings are allowed by a policy: ${tc.name}`, () => {
      const policy = new Policy(tc.name, tc.expression, tc.env);
      expect(() => policy.compile()).not.toThrow();
      expect(policy.allow(tc.input)).toBe(tc.allowed);
    });
  }

  it('check should be fast', () => {
    const policy = new Policy('a', 'input == "test"', new Env(variable('input', StringType)));
    policy.compile();
    const iterations = 100000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      policy.check({ input: 'test' });
    }
    const end = performance.now();
    const duration = end - start;
    const average = duration / iterations;
    console.log(
      `Check for a single policy took ${average * 1_000}µs on average over ${iterations} iterations`
    );
    expect(average).toBeLessThan(10); // Adjust this threshold as needed
  });

  it('allow should be fast', () => {
    const policy = new Policy('a', 'input == "test"', new Env(variable('input', StringType)));
    policy.compile();
    const iterations = 100000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      policy.allow({ input: 'test' });
    }
    const end = performance.now();
    const duration = end - start;
    const average = duration / iterations;
    console.log(
      `Allow for a single policy took ${average * 1_000}µs on average over ${iterations} iterations`
    );
    expect(average).toBeLessThan(20); // Adjust this threshold as needed
  });
});

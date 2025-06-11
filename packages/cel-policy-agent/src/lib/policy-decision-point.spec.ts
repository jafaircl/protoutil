/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from '@bufbuild/protobuf';
import { Env, StringType, objectType, types, variable } from '@protoutil/cel';
import { TestAllTypesSchema } from '@protoutil/core/unittest-proto3';
import { PolicyDecisionPoint } from './policy-decision-point.js';
import { Policy } from './policy.js';

describe('PolicyDecisionPoint', () => {
  it('should have basic map operations', () => {
    const pdp = new PolicyDecisionPoint();
    const policy = new Policy('testPolicy', '1 + 1 == 2', new Env());

    expect(pdp.has('testPolicy')).toBe(false);
    expect(pdp.get('testPolicy')).toBeUndefined();

    pdp.add(policy);
    expect(pdp.has('testPolicy')).toBe(true);
    expect(pdp.get('testPolicy')).toBe(policy);

    pdp.delete('testPolicy');
    expect(pdp.has('testPolicy')).toBe(false);
    expect(pdp.get('testPolicy')).toBeUndefined();

    pdp.add(policy);
    expect(pdp.has('testPolicy')).toBe(true);
    expect(pdp.get('testPolicy')).toBe(policy);

    pdp.clear();
    expect(pdp.has('testPolicy')).toBe(false);
    expect(pdp.get('testPolicy')).toBeUndefined();
  });

  const policy1 = new Policy('policy1', 'true', new Env());
  const policy2 = new Policy('policy2', 'false', new Env());
  const policy3 = new Policy(
    'policy3',
    'input == "allowed"',
    new Env(variable('input', StringType))
  );
  const policy4 = new Policy(
    'policy4',
    'message.optional_string == "abc"',
    new Env(types(TestAllTypesSchema), variable('message', objectType(TestAllTypesSchema.typeName)))
  );
  const testCases: {
    name: string;
    policies: Policy[];
    input: any;
    expected: boolean;
    expectedPolicy?: string;
    expectedDuration?: number;
  }[] = [
    {
      name: 'basic allow',
      policies: [policy1],
      input: {},
      expected: true,
      expectedPolicy: 'policy1',
    },
    {
      name: 'basic deny',
      policies: [policy2],
      input: {},
      expected: false,
    },
    {
      name: 'allow with variable input',
      policies: [policy3],
      input: { input: 'allowed' },
      expected: true,
      expectedPolicy: 'policy3',
    },
    {
      name: 'deny with variable input',
      policies: [policy3],
      input: { input: 'not allowed' },
      expected: false,
    },
    {
      name: 'allow with message type',
      policies: [policy4],
      input: { message: create(TestAllTypesSchema, { optionalString: 'abc' }) },
      expected: true,
      expectedPolicy: 'policy4',
    },
    {
      name: 'deny with message type',
      policies: [policy4],
      input: { message: create(TestAllTypesSchema, { optionalString: 'xyz' }) },
      expected: false,
    },
    {
      name: 'multiple policies, first allows',
      policies: [policy2, policy1],
      input: {},
      expected: true,
      expectedPolicy: 'policy1',
    },
    {
      name: 'multiple policies, last allows',
      policies: [policy2, policy3],
      input: { input: 'allowed' },
      expected: true,
      expectedPolicy: 'policy3',
    },
    {
      name: 'multiple policies, all deny',
      policies: [policy2, policy4],
      input: { message: { optional_string: 'xyz' } },
      expected: false,
    },
  ];
  for (const tc of testCases) {
    it(`should allow with policy: ${tc.name}`, () => {
      const pdp = new PolicyDecisionPoint();
      for (const policy of tc.policies) {
        policy.compile();
        pdp.add(policy);
      }
      const output = pdp.allow(tc.input);
      expect(output.allowed).toBe(tc.expected);
      expect(output.policy).toBe(tc.expectedPolicy);
      expect(typeof output.elapsed).toBe('number');
      if (tc.expectedDuration) {
        expect(output.elapsed).toBeLessThanOrEqual(tc.expectedDuration);
      } else {
        // Compiled policies should execute in less than 1ms. We'll allow up to 2ms for
        // the test to account for CI environments or slower machines.
        expect(output.elapsed).toBeLessThanOrEqual(2);
      }
    });
  }

  it('should not allow if no policies are defined', () => {
    const pdp = new PolicyDecisionPoint();
    const output = pdp.allow({});
    expect(output.allowed).toBe(false);
    expect(output.policy).toBeUndefined();
    expect(output.elapsed).toBeLessThanOrEqual(2); // Should execute very quickly
  });

  it('should be fast', () => {
    const pdp = new PolicyDecisionPoint();
    pdp.add(policy2);
    pdp.add(policy3);
    pdp.add(policy4);
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      pdp.allow({
        input: 'allowed',
        message: create(TestAllTypesSchema, { optionalString: 'abc' }),
      });
    }
    const elapsed = performance.now() - start;
    const average = elapsed / iterations;
    console.log(
      `Average time per check with ${pdp.policies.length} policies: ${(average * 1_000).toFixed(
        2
      )}µs`
    );
    expect(elapsed).toBeLessThan(100); // Should be fast enough for real-time checks
    expect(average).toBeLessThan(2); // Average time per check should be less than 1ms. We allow
    // up to 2ms for CI environments or slower machines.
  });
});

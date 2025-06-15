import { container, Env, objectType, StringType, types, variable } from '@protoutil/cel';
import { NestedTestAllTypesSchema, TestAllTypesSchema } from '@protoutil/cel/conformance-proto3';
import { PolicyDecisionPointTest } from './policy-decision-point-test.js';
import { PolicyDecisionPoint } from './policy-decision-point.js';
import { Policy } from './policy.js';

describe('PolicyDecisionPointTest', () => {
  const policy1 = new Policy('policy1', 'true', new Env());
  const policy2 = new Policy('policy2', 'false', new Env());
  const policy3 = new Policy(
    'policy3',
    'input == "allowed"',
    new Env(variable('input', StringType))
  );
  const policy4 = new Policy(
    'policy4',
    'message.single_string == "abc"',
    new Env(types(TestAllTypesSchema), variable('message', objectType(TestAllTypesSchema.typeName)))
  );
  const policy5 = new Policy(
    'policy5',
    `message.single_string == "abc" && input == "allowed"`,
    new Env(
      types(TestAllTypesSchema),
      variable('message', objectType(TestAllTypesSchema.typeName)),
      variable('input', StringType)
    )
  );
  const policy6 = new Policy(
    'policy6',
    `message.single_string == "abc" || input == "allowed"`,
    new Env(
      types(TestAllTypesSchema),
      variable('message', objectType(TestAllTypesSchema.typeName)),
      variable('input', StringType)
    )
  );
  const policy7 = new Policy(
    'policy7',
    `msg.child.payload.single_string == "allowed"`,
    new Env(
      types(NestedTestAllTypesSchema),
      variable('msg', objectType(NestedTestAllTypesSchema.typeName))
    )
  );

  const testCases = [
    {
      name: 'TestConstant',
      policies: [policy1, policy2, policy3, policy4, policy5, policy6, policy7],
      test: 'allow({}) == true',
      out: true,
    },
    {
      name: 'TestConstantNotEqual',
      policies: [policy1, policy3, policy4, policy5, policy6, policy7],
      test: 'allow({}) == false',
      out: false,
    },
    {
      name: 'TestVariable',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'input': 'allowed' }) == true`,
      out: true,
    },
    {
      name: 'TestVariableNotEqual',
      policies: [policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'input': 'not-allowed' }) == true`,
      out: false,
    },
    {
      name: 'TestVariableNotEqualPass',
      policies: [policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'input': 'not-allowed' }) == false`,
      out: true,
    },
    {
      name: 'TestMessage',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "abc"} }) == true`,
      out: true,
    },
    {
      name: 'TestMessageNotEqual',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "xyz"} }) == true`,
      out: false,
    },
    {
      name: 'TestMessageNotEqualPass',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "xyz"} }) == false`,
      out: true,
    },
    {
      name: 'TestMessageWithVariable',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "abc"}, 'input': 'allowed' }) == true`,
      out: true,
    },
    {
      name: 'TestMessageWithVariableNotEqual',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "xyz"}, 'input': 'not-allowed' }) == true`,
      out: false,
    },
    {
      name: 'TestMessageWithVariableNotEqualPass',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "xyz"}, 'input': 'not-allowed' }) == false`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedField',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({
        'msg': cel.expr.conformance.proto3.NestedTestAllTypes{
            child: cel.expr.conformance.proto3.NestedTestAllTypes{
                payload: cel.expr.conformance.proto3.TestAllTypes{
                    single_string: "allowed"
                }
            }
        } }) == true`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedFieldNotEqual',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({
        'msg': cel.expr.conformance.proto3.NestedTestAllTypes{
            child: cel.expr.conformance.proto3.NestedTestAllTypes{
                payload: cel.expr.conformance.proto3.TestAllTypes{
                    single_string: "not-allowed"
                }
            }
        } }) == true`,
      out: false,
    },
    {
      name: 'TestMessageWithNestedFieldNotEqualPass',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      test: `allow({
        'msg': cel.expr.conformance.proto3.NestedTestAllTypes{
            child: cel.expr.conformance.proto3.NestedTestAllTypes{
                payload: cel.expr.conformance.proto3.TestAllTypes{
                    single_string: "not-allowed"
                }
            }
        } }) == false`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedFieldAndContainer',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      env: new Env(container('cel.expr.conformance.proto3')),
      test: `allow({
          'msg': NestedTestAllTypes{
              child: NestedTestAllTypes{
                  payload: TestAllTypes{
                      single_string: "allowed"
                  }
              }
          } }) == true`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedFieldAndContainerNotEqual',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      env: new Env(container('cel.expr.conformance.proto3')),
      test: `allow({
        'msg': NestedTestAllTypes{
            child: NestedTestAllTypes{
                payload: TestAllTypes{
                    single_string: "not-allowed"
                }
            }
        } }) == true`,
      out: false,
    },
    {
      name: 'TestMessageWithNestedFieldAndContainerNotEqualPass',
      policies: [policy2, policy3, policy4, policy5, policy6, policy7],
      env: new Env(container('cel.expr.conformance.proto3')),
      test: `allow({
        'msg': NestedTestAllTypes{
            child: NestedTestAllTypes{
                payload: TestAllTypes{
                    single_string: "not-allowed"
                }
            }
        } }) == false`,
      out: true,
    },
  ];

  for (const tc of testCases) {
    it(`PolicyDecisionPointTest: ${tc.name}`, () => {
      const pdp = new PolicyDecisionPoint();
      for (const policy of tc.policies) {
        pdp.add(policy);
      }
      const policyTest = new PolicyDecisionPointTest(tc.name, tc.test, pdp, tc.env);
      expect(() => policyTest.compile()).not.toThrow();
      expect(policyTest.compiled).toBe(true);
      expect(policyTest.run()).toBe(tc.out);
    });
  }
});

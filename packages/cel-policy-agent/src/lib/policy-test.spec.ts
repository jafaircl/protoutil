import { container, Env, objectType, StringType, types, variable } from '@protoutil/cel';
import { NestedTestAllTypesSchema, TestAllTypesSchema } from '@protoutil/cel/conformance-proto3';
import { PolicyTest } from './policy-test.js';
import { Policy } from './policy.js';

describe('PolicyTest', () => {
  const testCases = [
    {
      name: 'TestConstant',
      env: new Env(),
      expr: '"hello" == "hello"',
      test: 'allow({}) == true',
      out: true,
    },
    {
      name: 'TestConstantNotEqual',
      env: new Env(),
      expr: '"hello" == "world"',
      test: 'allow({}) == true',
      out: false,
    },
    {
      name: 'TestConstantNotEqualPass',
      env: new Env(),
      expr: '"hello" == "world"',
      test: 'allow({}) == false',
      out: true,
    },
    {
      name: 'TestVariable',
      env: new Env(variable('input', StringType)),
      expr: 'input == "allowed"',
      test: `allow({ 'input': 'allowed' }) == true`,
      out: true,
    },
    {
      name: 'TestVariableNotEqual',
      env: new Env(variable('input', StringType)),
      expr: 'input == "allowed"',
      test: `allow({ 'input': 'not-allowed' }) == true`,
      out: false,
    },
    {
      name: 'TestVariableNotEqualPass',
      env: new Env(variable('input', StringType)),
      expr: 'input == "allowed"',
      test: `allow({ 'input': 'not-allowed' }) == false`,
      out: true,
    },
    {
      name: 'TestMessage',
      env: new Env(
        types(TestAllTypesSchema),
        variable('message', objectType(TestAllTypesSchema.typeName))
      ),
      expr: 'message.single_string == "allowed"',
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "allowed"} }) == true`,
      out: true,
    },
    {
      name: 'TestMessageNotEqual',
      env: new Env(
        types(TestAllTypesSchema),
        variable('message', objectType(TestAllTypesSchema.typeName))
      ),
      expr: 'message.single_string == "allowed"',
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "not-allowed"} }) == true`,
      out: false,
    },
    {
      name: 'TestMessageNotEqualPass',
      env: new Env(
        types(TestAllTypesSchema),
        variable('message', objectType(TestAllTypesSchema.typeName))
      ),
      expr: 'message.single_string == "allowed"',
      test: `allow({ 'message': cel.expr.conformance.proto3.TestAllTypes{single_string: "not-allowed"} }) == false`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedField',
      env: new Env(
        container('cel.expr.conformance.proto3'),
        types(NestedTestAllTypesSchema, TestAllTypesSchema),
        variable('msg', objectType(NestedTestAllTypesSchema.typeName))
      ),
      expr: 'msg.child.payload.single_string == "allowed"',
      test: `allow({ 'msg': NestedTestAllTypes{child: NestedTestAllTypes{payload: TestAllTypes{single_string: "allowed"}}} }) == true`,
      out: true,
    },
    {
      name: 'TestMessageWithNestedFieldNotEqual',
      env: new Env(
        container('cel.expr.conformance.proto3'),
        types(NestedTestAllTypesSchema, TestAllTypesSchema),
        variable('msg', objectType(NestedTestAllTypesSchema.typeName))
      ),
      expr: 'msg.child.payload.single_string == "allowed"',
      test: `allow({ 'msg': NestedTestAllTypes{child: NestedTestAllTypes{payload: TestAllTypes{single_string: "not-allowed"}}} }) == true`,
      out: false,
    },
    {
      name: 'TestMessageWithNestedFieldNotEqualPass',
      env: new Env(
        container('cel.expr.conformance.proto3'),
        types(NestedTestAllTypesSchema, TestAllTypesSchema),
        variable('msg', objectType(NestedTestAllTypesSchema.typeName))
      ),
      expr: 'msg.child.payload.single_string == "allowed"',
      test: `allow({ 'msg': NestedTestAllTypes{child: NestedTestAllTypes{payload: TestAllTypes{single_string: "not-allowed"}}} }) == false`,
      out: true,
    },
  ];
  for (const tc of testCases) {
    it(`${tc.name}`, () => {
      const policy = new Policy(tc.name, tc.expr, tc.env);
      const policyTest = new PolicyTest(tc.name, tc.test, policy);
      const { result } = policyTest.run();
      expect(result?.value()).toEqual(tc.out);
    });
  }
});

# @protoutil/cel-policy-agent

A set of utilities for defining and enforcing authorization policies using [CEL (Common Expression Language)](https://github.com/google/cel-spec). These utilities assume you are using [`protobuf-es`](https://github.com/bufbuild/protobuf-es) to work with messages and [`@protoutil/cel`](https://github.com/jafaircl/protoutil/tree/main/packages/cel) to define and evaulate CEL expressions.

## Install

Use your configured package manager to install the `@protoutil/cel-policy-agent` package. i.e. install from npm using `npm install @protoutil/cel-policy-agent`.

## Usage

### Defining a Policy

An authorization policy is a CEL expression that can be evaulated against a set of bindings to determine if a principal has access to a resource. The expression must be a valid CEL expression that evaluates to a boolean. Once a policy has been compiled, evaluating it against an input should be very fast (on the order of single-digit microseconds).

```typescript
import { Env, StringType, variable } from '@protoutil/cel';
import { Policy } from '@protoutil/cel-policy-agent';

const env = new Env(variable('input', StringType));
const policy = new Policy('my-policy-id', 'input == "allowed"', env);
policy.compile();
policy.allow({ input: 'allowed' }); // true
policy.allow({ input: 'not-allowed' }); // false
```

### Testing a Policy

This library also provides a utility class for defining a test expression which can be used to evaluate an input binding against a policy. The test expression environment provides an `allow` function which returns the result of evaluating its single map argument as the input binding against the policy. This can be used to ensure that modifying a policy does not change the result of some expected outcome.

```typescript
import { PolicyTest } from '@protoutil/cel-policy-agent';

const policyTest = new PolicyTest('my-test-id', 'allow({ "input": "allowed" }) == true', policy);
policyTest.run(); // true (test passes)
```

Policy tests can also provide a CEL Environment which will be extended with the policy's protobuf types and the `allow` function. For example, if your policy depends on a `MyMessageSchema` type, you can either use the fully qualified name e.g. `allow({ 'message': my.schema.v1.MyMessage{value: "some value"} })` or define an environment with a container and simplify your expression:

```typescript
import { Env, container } from '@protoutil/cel';

const env = new Env(container('my.schema.v1'));
new PolicyTest(
  'my-test-id',
  `allow({ 'message': MyMessage{value: "some value"} }) == true`,
  policy,
  env
);
```

Since the environment is simply a CEL environment, any option you provide to it will be reflected when the test expression is evaluated.

### Defining a Policy Decision Point (PDP)

A Policy Decision Point (PDP) can group policies together and evaluate a single input against all the policies it contains. If the input binding does not match a particular policy, it will be skipped. If any policy allows the action, the PDP will allow the action.

```typescript
import { PolicyDecisionPoint } from '@protoutil/cel-policy-agent';

const pdp = new PolicyDecisionPoint(policy);
policy.allow({ input: 'allowed' }); // true
policy.allow({ input: 'not-allowed' }); // false
```

### Testing a PDP

Similary to individual policies, we also export a utility class for testing PDPs:

```typescript
import { PolicyDecisionPointTest } from '@protoutil/cel-policy-agent';

const policyTest = new PolicyDecisionPointTest(
  'my-test-id',
  'allow({ "input": "allowed" }) == true',
  pdp
);
policyTest.run(); // true (test passes)
```

## Contributing

### Building

Run `nx build cel-policy-agent` to build the library.

### Running unit tests

Run `nx test cel-policy-agent` to execute the unit tests via [Jest](https://jestjs.io).

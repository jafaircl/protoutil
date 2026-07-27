# @protoutil/cel

Utilities and generated protobuf types for working with CEL expressions in TypeScript.

## Public API

### Parse

Use `parse()` for the ergonomic path. It returns an `AST` and throws if parsing fails.

```ts
import { parse } from "@protoutil/cel/parser";

const ast = parse("a + b * c");
const parsedExpr = ast.toParsedExpr();
```

If you want structured diagnostics instead of exceptions, use `tryParse()`.

```ts
import { tryParse } from "@protoutil/cel/parser";

const result = tryParse("a + b * c");
if (result.errors) {
  console.error(result.errors.toDisplayString());
} else {
  console.log(result.ast.toParsedExpr());
}
```

### Unparse

Use `unparse()` to render an `AST`, local `Expr`, or protobuf `Expr` back to CEL source.

```ts
import { parse, unparse } from "@protoutil/cel/parser";

const ast = parse("a + b * c");
const source = unparse(ast);
```

If you want a non-throwing helper, use `tryUnparse()`.

```ts
import { parse, tryUnparse } from "@protoutil/cel/parser";

const ast = parse("a + b * c");
const result = tryUnparse(ast);
if (result.error) {
  console.error(result.error.message);
} else {
  console.log(result.source);
}
```

### Check

Use `check()` for the ergonomic path. It returns a checked `AST` and throws if type-checking fails.

```ts
import { defaultContainer, registry, textSource } from "@protoutil/cel/common";
import { env, check } from "@protoutil/cel/checker";
import { parse } from "@protoutil/cel/parser";

const source = textSource("a + b");
const parsed = parse("a + b");
const checked = check(parsed, source, env(defaultContainer, registry()));
const checkedExpr = checked.toCheckedExpr();
```

If you want diagnostics instead of exceptions, use `tryCheck()`.

```ts
import { defaultContainer, registry, textSource } from "@protoutil/cel/common";
import { env, tryCheck } from "@protoutil/cel/checker";
import { parse } from "@protoutil/cel/parser";

const source = textSource("a + b");
const parsed = parse("a + b");
const result = tryCheck(parsed, source, env(defaultContainer, registry()));
if (result.errors) {
  console.error(result.errors.toDisplayString());
} else {
  console.log(result.ast.toCheckedExpr());
}
```

### Cost

Use `cost()` to estimate the static checker cost of a checked AST. The returned `CostEstimate`
has bigint `Min` and `Max` bounds.

```ts
import { cost, SizeEstimate } from "@protoutil/cel/checker";

const estimate = cost(checked, {
  estimateSize(node) {
    if (node.path()?.join(".") === "input") {
      return new SizeEstimate(0n, 500n);
    }
    return undefined;
  },
  estimateCallCost() {
    return undefined;
  },
});

console.log(estimate.Min, estimate.Max);
```

### Interpreter

The interpreter plans checked or unchecked ASTs into reusable programs and evaluates them against
an activation. It supports standard and custom overload dispatch, protobuf field access and object
construction, optional values, unknown propagation, comprehensions, exhaustive evaluation,
interruption, state observation, AST pruning, and runtime-cost tracking.
CEL `matches()` expressions use RE2-compatible syntax and linear-time matching in both ordinary
and constant-optimized execution.

```ts
import { registry, standardFunctions } from "@protoutil/cel/common";
import {
  dispatcher,
  executionFrame,
  interpreter,
  optimizeConfig,
} from "@protoutil/cel/interpreter";

const reg = registry();
const functions = dispatcher();
for (const declaration of standardFunctions()) {
  functions.add({ overloads: declaration.bindings() });
}

const runtime = interpreter({
  dispatcher: functions,
  provider: reg,
  adapter: reg,
});
const program = runtime.interpretable({
  exprAst: checked,
  plannerConfig: optimizeConfig(),
});
const frame = executionFrame({
  input: { a: 1n, b: 2n },
});

try {
  const result = program.exec(frame);
  console.log(result.value());
} finally {
  frame.close();
}
```

Use `activation()` or `partialActivation()` when explicit activation behavior or unknown attribute
patterns are needed. An `ExecutionFrame` can also receive an abort signal for interruptible
comprehensions.

### Runtime Cost

Use `costObserverConfig()` while planning an interpretable to measure actual evaluation cost. A
fresh `CostTracker` is created for each evaluation, and an optional limit terminates evaluation
with `CostLimitExceededError` when the observed cost exceeds it.

```ts
import {
  CostTracker,
  costObserverConfig,
  executionFrame,
} from "@protoutil/cel/interpreter";

let tracker: CostTracker | undefined;
const program = runtime.interpretable({
  exprAst: checked,
  plannerConfig: costObserverConfig({
    trackerFactory: () => {
      tracker = new CostTracker({ limit: 1_000 });
      return tracker;
    },
  }),
});

program.exec(executionFrame({ input: bindings }));
console.log(tracker?.actualCost());
```

`CostTracker` also accepts an `estimator`, per-overload `overloadTrackers`, and
`presenceTestHasCost` to customize runtime accounting.

### Interpreter Planning Modes

Planner configurations expose the cel-go interpreter execution modes. `optimizeConfig()` folds
constant list, map, and type-conversion expressions; `exhaustiveEvalConfig()` evaluates every
logical, conditional, and comprehension branch; and `interruptableEvalConfig()` checks an
`ExecutionFrame` abort signal while folding comprehensions.

Constant regular expressions can be compiled while planning:

```ts
import {
  compileRegexConstantsConfig,
  matchesRegexOptimization,
} from "@protoutil/cel/interpreter";

const program = runtime.interpretable({
  exprAst: checked,
  plannerConfig: compileRegexConstantsConfig({
    optimizations: [matchesRegexOptimization],
  }),
});
```

### AST Proto Conversion

The local `AST` type is the main working object.

- `ast.toParsedExpr()` returns `cel.expr.ParsedExpr`
- `ast.toCheckedExpr()` returns `cel.expr.CheckedExpr`
- `ast.toProto()` returns `ParsedExpr` for unchecked ASTs and `CheckedExpr` for checked ASTs

### Prune

Use `pruneAst()` with evaluation state recorded by `evalStateObserverConfig()` to produce a
copy-on-write residual AST. Known scalar, list, map, duration, timestamp, and optional values are
folded while unknown and error-dependent expressions remain in the result.

```ts
import { evalState, pruneAst } from "@protoutil/cel/interpreter";

const state = evalState();
// Evaluate the parsed AST with evalStateObserverConfig({ factory: () => state }).
const residual = pruneAst({
  expr: parsed.expr(),
  macroCalls: parsed.sourceInfo().macroCalls(),
  state,
});
```

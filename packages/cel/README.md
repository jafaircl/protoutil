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

### AST Proto Conversion

The local `AST` type is the main working object.

- `ast.toParsedExpr()` returns `cel.expr.ParsedExpr`
- `ast.toCheckedExpr()` returns `cel.expr.CheckedExpr`
- `ast.toProto()` returns `ParsedExpr` for unchecked ASTs and `CheckedExpr` for checked ASTs

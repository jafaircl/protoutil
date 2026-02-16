# AIP-160: Filtering

This package provides a way to parse and type-check the filter strings as described by [AIP-160](https://google.aip.dev/160). The [EBNF grammar can be found here](https://google.aip.dev/assets/misc/ebnf-filtering.txt).

You can parse filter strings into [protobuf-es](https://github.com/bufbuild/protobuf-es) `ParsedExpr` message objects like so:

```ts
import { parseFilter, Parser } from '@protoutil/aip';

// Class API
const parser = new Parser('a = 1');
const parsed = parser.parse();
// parsed is either a `ParsedExpr` object or an Error for you to handle as you see fit

// Functional API
const parsed = parseFilter('a = 1');
// parsed is a `ParsedExpr` object
// If an invalid filter is passed, an error will be thrown
```

It is also possible to un-parse an `Expr` object into a filter string:

```ts
import { unparseFilter, Unparser } from '@protoutil/aip';

// Class API
const unparser = new Unparser(parsed.expr!);
const unparsed = unparser.unparse();
// unparsed should be a filter string that is functionally equivalent to the original parsed string.
// An error will be thrown if the `Expr` was unable to be translated.

// Functional API
const parsed = unparseFilter(parsed.expr!);
// unparsed should be a filter string that is functionally equivalent to the original parsed string.
// An error will be thrown if the `Expr` was unable to be translated.
```

You can also type-check the parsed expression. Valid filters must always evaulate to a boolean type.

```ts
import {
  checkParsedExpression,
  extendStandardFilterDeclarations,
  newIdentDeclaration,
  TypeInt,
  TypeString,
  Checker,
} from '@protoutil/aip';

// Class API
const declarations = new Declarations({
  declarations: [
    ...standardFunctionDeclarations(),
    newIdentDeclaration('a', TypeInt),
    newEnumDeclaration('enum', MyEnumSchema),
    // `myFunction` returns an int and accepts a string as an argument
    newFunctionDeclaration(
      'myFunction',
      newFunctionOverload('myFunction_overload', TypeInt, TypeString)
    ),
  ],
});
const checker = new Checker(parsed.expr!, parsed.sourceInfo!, declarations);
const checked = checker.check();
// checked is either a `CheckedExpr` object or an Error for you to handle as you see fit

// Functional API
const declarations = extendStandardFilterDeclarations([
  newIdentDeclaration('a', TypeInt),
  newEnumDeclaration('enum', MyEnumSchema),
  // `myFunction` returns an int and accepts a string as an argument
  newFunctionDeclaration(
    'myFunction',
    newFunctionOverload('myFunction_overload', TypeInt, TypeString)
  ),
]);
const checked = checkParsedExpression(parsed, declarations);
// checked is a `CheckedExpr` object
// If the type-checking fails or the filter evaluates to a non-bool type, an error will be thrown
```

See more about `ParsedExpr` and `CheckedExpr` objects here: https://buf.build/googleapis/googleapis/docs/main:google.api.expr.v1alpha1

A one-step function to parse and check is also provided:

```ts
import {
  parseAndCheckFilter,
  extendStandardFilterDeclarations,
  newIdentDeclaration,
  TypeInt,
} from '@protoutil/aip';

const checked = parseAndCheckFilter(
  'a = 1',
  extendStandardFilterDeclarations([newIdentDeclaration('a', TypeInt)])
);

// checked is a CheckedExpr object
// If the type-checking fails or the filter evaluates to a non-bool type, an error will be thrown
```

For applications where finer-grained control may be required, the `Lexer`, `Parser`, `Declarations`, and `Checker` classes are exported from the package along with several helper functions to generate `Type` and `Decl` message objects.

There is also experimental support for custom protobuf message types:

```protobuf
syntax = "proto3";
package custom;

message MyMessage {
    int64 my_field = 1;
}
```

```ts
import { createTypeRegistry } from '@bufbuild/protobuf';
import {
  parseAndCheckFilter,
  extendStandardFilterDeclarations,
  newIdentDeclaration,
  typeMessage,
} from '@protoutil/aip';
import { MyMessageSchema } from './gen/custom';

const checked = parseAndCheckFilter(
  'a.my_field = 1',
  extendStandardFilterDeclarations(
    [newIdentDeclaration('a', typeMessage(MyMessageSchema.typeName))],
    createTypeRegistry(MyMessageSchema)
  )
);
```

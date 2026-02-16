# AIP-122: Resource Names

This package provides primitives for implementing resources names as described in [AIP-122](https://google.aip.dev/122).

The `resourceNameAncestor` function extracts an ancestor from the provided name, using a pattern for the ancestor:

```ts
import { resourceNameAncestor } from '@protoutil/aip';

resourceNameAncestor('foo/1/bar/2', 'foo/{foo}'); // returns 'foo/1'
```

The `resourceNameHasParent` function tests whether name has the specified parent. Wildcard segments (-) are considered. Resource names without revisions are considered parents of the same resource name with a revision:

```ts
import { resourceNameHasParent } from '@protoutil/aip';

resourceNameHasParent('shippers/1/sites/1', 'shippers/1'); // true
resourceNameHasParent('shippers/1/sites/1/settings', 'shippers/1/sites/1/settings'); // false
```

The `joinResourceNames` function combines resource names, separating them by slashes:

```ts
import { joinResourceNames } from '@protoutil/aip';

joinResourceNames('/parent/1', 'child/2'); // 'parent/1/child/2'
```

The `matchesResourcePattern` function reports whether the specified resource name matches the specified resource name pattern:

```ts
import { matchesResourcePattern } from '@protoutil/aip';

matchesResourcePattern('shippers/{shipper}/sites/{site}', 'shippers/1/sites/1'); // true
matchesResourcePattern('shippers/{shipper}/sites/{site}', 'shippers/1/sites/1/settings'); // false
```

The `printResourceName` function formats resource name variables according to a pattern and returns the resulting string:

```ts
import { printResourceName } from '@protoutil/aip';

printResourceName('publishers/{publisher}', { publisher: 'foo' }); // 'publishers/foo'
```

The `scanResourceName` function scans a resource name, storing segments into an object with keys determined by the provided pattern:

```ts
import { scanResourceName } from '@protoutil/aip';

scanResourceName('publishers/foo/books/bar', 'publishers/{publisher}/books/{book}');
// returns: { publisher: 'foo', book: 'bar' }
```

The `assertValidResourcName`, `isValidResourceName`, `assertValidResourcPattern`, and `isValidResourcePattern` functions assert that a resource names and patterns conform to the restrictions outlined in AIP-122:

```ts
import {
  assertValidResourcName,
  assertValidResourcPattern,
  isValidResourceName,
  isValidResourcePattern,
} from '@protoutil/aip';

assertValidResourceName('ice cream is best'); // throws
isValidResourceName('ice cream is best'); // false
assertValidResourceName('foo/bar'); // does not throw
isValidResourceName('foo/bar'); // true

assertValidResourcePattern('ice cream is best'); // throws
isValidResourcePattern('ice cream is best'); // false
assertValidResourcePattern('foo/bar/{baz}'); // does not throw
isValidResourcePattern('foo/bar/{baz}'); // true
```

The `containsWildcard` function reports whether the specified resource name contains any wildcard segments:

```ts
import { containsWildcard } from '@protoutil/aip';

containsWildcard('foo/-/bar'); // true
containsWildcard('foo/bar'); // false
```

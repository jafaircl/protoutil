# AIP-122: Resource Names

This package provides primitives for implementing resource names as described in [AIP-122](https://google.aip.dev/122).

## Extracting Ancestors

`ancestor` extracts an ancestor from a resource name, using a pattern for the ancestor:

```ts
import { ancestor } from "@protoutil/aip/resourcename";

ancestor("foo/1/bar/2", "foo/{foo}"); // "foo/1"
```

## Checking Parent Relationships

`hasParent` tests whether a name has the specified parent. Wildcard segments (`-`) are considered. Resource names without revisions are considered parents of the same name with a revision:

```ts
import { hasParent } from "@protoutil/aip/resourcename";

hasParent("shippers/1/sites/1", "shippers/1"); // true
hasParent("shippers/1/sites/1/settings", "shippers/1/sites/1/settings"); // false
```

## Joining Resource Names

`join` combines resource names, separating them by slashes and normalizing leading/trailing slashes:

```ts
import { join } from "@protoutil/aip/resourcename";

join("/parent/1", "child/2"); // "parent/1/child/2"
```

## Pattern Matching

`matches` reports whether a resource name matches a resource name pattern:

```ts
import { matches } from "@protoutil/aip/resourcename";

matches("shippers/{shipper}/sites/{site}", "shippers/1/sites/1"); // true
matches("shippers/{shipper}/sites/{site}", "shippers/1/sites/1/settings"); // false
```

## Printing Resource Names

`print` formats resource name variables according to a pattern:

```ts
import { print } from "@protoutil/aip/resourcename";

print("publishers/{publisher}", { publisher: "foo" }); // "publishers/foo"
```

## Scanning Resource Names

`scan` scans a resource name and extracts segment values into an object keyed by the pattern's variable names:

```ts
import { scan } from "@protoutil/aip/resourcename";

scan("publishers/foo/books/bar", "publishers/{publisher}/books/{book}");
// { publisher: "foo", book: "bar" }
```

## Validation

Validate that resource names and patterns conform to AIP-122 restrictions:

```ts
import {
  assertValid,
  assertValidPattern,
  isValid,
  isValidPattern,
} from "@protoutil/aip/resourcename";

assertValid("ice cream is best"); // throws
isValid("ice cream is best"); // false
assertValid("foo/bar"); // does not throw
isValid("foo/bar"); // true

assertValidPattern("foo/bar/{baz}"); // does not throw
isValidPattern("foo/bar/{baz}"); // true
```

## Wildcards

`containsWildcard` reports whether a resource name contains any wildcard segments (`-`):

```ts
import { containsWildcard } from "@protoutil/aip/resourcename";

containsWildcard("foo/-/bar"); // true
containsWildcard("foo/bar"); // false
```

## Resource Descriptors

Inspect `google.api.resource` annotations on message descriptors:

```ts
import {
  hasResourceDescriptor,
  getResourceDescriptor,
  getResourceNamePatterns,
} from "@protoutil/aip/resourcename";

// Check if a message has a resource annotation
hasResourceDescriptor(MyMessageSchema); // true/false

// Get the full resource descriptor
const descriptor = getResourceDescriptor(MyMessageSchema);

// Get just the resource name patterns
const patterns = getResourceNamePatterns(MyMessageSchema);
// e.g. ["publishers/{publisher}/books/{book}"]
```

## Low-Level Scanner

The `Scanner` class provides a low-level iterator for walking resource name segments:

```ts
import { Scanner } from "@protoutil/aip/resourcename";

const scanner = new Scanner("//example.com/publishers/foo/books/bar");
// scanner.full() === true after scanning a full resource name (starting with //)
// scanner.serviceName() === "example.com"
while (scanner.scan()) {
  const segment = scanner.segment(); // Segment instance
  console.log(segment.value);        // "publishers", "foo", "books", "bar"
  console.log(segment.isVariable()); // false for literal segments
  console.log(segment.isWildcard()); // true for "-"
}
```

## Segment and Literal Classes

`Segment` represents a single segment of a resource name or pattern. `Literal` represents the literal value within a segment, with support for revision IDs:

```ts
import { Segment, Literal, RevisionSeparator } from "@protoutil/aip/resourcename";

const seg = new Segment("{publisher}");
seg.isVariable(); // true
seg.literal().value; // "publisher"

const lit = new Literal("doc@v2");
lit.hasRevision(); // true
lit.resourceId(); // "doc"
lit.revisionId(); // "v2"
```

## API Reference

| Export | Description |
|--------|-------------|
| `ancestor(name, pattern)` | Extract an ancestor from a resource name |
| `hasParent(name, parent)` | Test whether a name has the specified parent |
| `join(...names)` | Join resource names with slashes |
| `matches(pattern, name)` | Test whether a name matches a pattern |
| `print(pattern, vars)` | Format a resource name from a pattern and variables |
| `scan(name, pattern)` | Extract segment values into a key-value object |
| `assertValid(name)` | Throws if the resource name is invalid |
| `isValid(name)` | Returns `true` if the resource name is valid |
| `assertValidPattern(pattern)` | Throws if the resource pattern is invalid |
| `isValidPattern(pattern)` | Returns `true` if the resource pattern is valid |
| `containsWildcard(name)` | Returns `true` if the name contains wildcard segments |
| `hasResourceDescriptor(desc)` | Check if a message has a `google.api.resource` annotation |
| `getResourceDescriptor(desc)` | Get the `google.api.resource` descriptor from a message |
| `getResourceNamePatterns(desc)` | Get the resource name patterns from a message descriptor |
| `Scanner` | Low-level scanner for iterating over resource name segments |
| `Segment` | Represents a segment of a resource name or pattern |
| `Literal` | Represents the literal value within a segment, with revision support |
| `RevisionSeparator` | The `@` character used to separate resource IDs from revision IDs |

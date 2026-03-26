# @protoutil/aip

TypeScript SDK for implementing [Google API Improvement Proposals](https://aip.dev/) (AIP). Most of the utilities in this library are TypeScript re-implementations of the [AIP Go](https://github.com/einride/aip-go) library.

## Install

This package has dependencies which require adding Buf as a registry in your package manager.

- For npm: `npm config set @buf:registry https://buf.build/gen/npm/v1/` or add `@buf:registry=https://buf.build/gen/npm/v1/` to your `.npmrc`
- For pnpm: `pnpm config set @buf:registry https://buf.build/gen/npm/v1/`
- For yarn: `yarn config set npmScopes.buf.npmRegistryServer https://buf.build/gen/npm/v1/`

See [here](https://buf.build/docs/bsr/generated-sdks/npm/) for more information.

After adding Buf as a registry, install the package:

```sh
npm install @protoutil/aip
```

## Sub-Modules

Each AIP is implemented as a separate sub-module with its own entry point:

| Sub-Module | Import Path | AIP |
|------------|-------------|-----|
| [Resource Names](src/resourcename/README.md) | `@protoutil/aip/resourcename` | [AIP-122](https://google.aip.dev/122) |
| [Order By](src/orderby/README.md) | `@protoutil/aip/orderby` | [AIP-132](https://google.aip.dev/132) |
| [Resource Freshness (ETag)](src/etag/README.md) | `@protoutil/aip/etag` | [AIP-154](https://google.aip.dev/154) |
| [Pagination](src/pagination/README.md) | `@protoutil/aip/pagination` | [AIP-158](https://google.aip.dev/158) |
| [Filtering](src/filtering/README.md) | `@protoutil/aip/filtering` | [AIP-160](https://google.aip.dev/160) |
| [Errors](src/errors/README.md) | `@protoutil/aip/errors` | [AIP-193](https://google.aip.dev/193) |
| [Field Behavior](src/fieldbehavior/README.md) | `@protoutil/aip/fieldbehavior` | [AIP-203](https://google.aip.dev/203) |

## Quick Examples

### Parsing a filter string

```typescript
import { parse, check, unparse } from "@protoutil/aip/filtering";

const parsed = parse('status = "active" AND rating > 3');
const { checkedExpr } = check(parsed);
const canonical = unparse(checkedExpr.expr!);
```

### Pagination

```typescript
import { parse } from "@protoutil/aip/pagination";

const pageToken = parse(RequestSchema, request);
const nextToken = pageToken.next(request.pageSize).toString();
```

### Resource names

```typescript
import { scan, matches } from "@protoutil/aip/resourcename";

const vars = scan("publishers/foo/books/bar", "publishers/{publisher}/books/{book}");
// { publisher: "foo", book: "bar" }

matches("shippers/{shipper}/sites/{site}", "shippers/1/sites/1"); // true
```

### Error handling

```typescript
import { NotFoundError } from "@protoutil/aip/errors";

throw new NotFoundError({
  message: "Book not found",
  errorInfo: { reason: "BOOK_NOT_FOUND", domain: "library.api" },
});
```

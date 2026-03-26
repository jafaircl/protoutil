---
title: Pagination
description: "AIP-158: Pagination implementation"
---

This package provides primitives for implementing AIP pagination as described in [AIP-158](https://google.aip.dev/158).

## Request Format

The utilities expect a request object formatted according to AIP guidelines with the following optional fields: `int32 page_size`, `string page_token`, and `int32 skip`.

```protobuf
syntax = "proto3";

message PaginatedRequest {
  string parent = 1;
  int32 page_size = 2;
  string page_token = 3;
  int32 skip = 4;
}
```

## Parsing Page Tokens

Parse a `PageToken` from a protobuf request message:

```ts
import { parse } from "@protoutil/aip/pagination";

const request = create(PaginatedRequestSchema, {
  parent: "shelves/1",
  pageSize: 10,
});
const pageToken = parse(PaginatedRequestSchema, request);
```

The `PageToken` provides:
- **`offset`**: The number of results to skip. This is derived from the request's `page_size` and `skip` fields combined with the offset parsed from the `page_token` field.
- **`requestChecksum`**: A checksum for verifying that two `PageToken` instances refer to the same request (pagination fields are stripped before checksum calculation).

An optional `pageTokenChecksumMask` parameter (default: `0x9acb0442`) can be passed to `parse` to force checksum failures when changing the page token implementation.

## Navigating Pages

Use `next()` and `previous()` to produce tokens for adjacent pages:

```ts
const pageToken = parse(PaginatedRequestSchema, request);

// Get the next page token
const nextPageToken = pageToken.next(request.pageSize).toString();

// Get the previous page token (offset is clamped to 0)
const prevPageToken = pageToken.previous(request.pageSize).toString();
```

## Response Example

Set the `next_page_token` on your response so clients can fetch the next page:

```ts
const pageToken = parse(PaginatedRequestSchema, request);
const response = create(PaginatedResponseSchema, {
  results: [...],
  nextPageToken: pageToken.next(request.pageSize).toString(),
});
```

The client then sends the token back in the next request:

```ts
const nextRequest = create(PaginatedRequestSchema, {
  parent: "shelves/1",
  pageToken: response.nextPageToken,
});
```

## Encoding and Decoding Tokens Directly

```ts
import { encode, decode, PageToken } from "@protoutil/aip/pagination";

// Encode a PageToken to a base64 string
const token = encode(new PageToken(30, 12345));

// Decode a base64 string back to a PageToken
const decoded = decode(token);
```

## API Reference

| Export | Description |
|--------|-------------|
| `parse(schema, request, mask?)` | Parse a `PageToken` from a paginated request message. Throws `InvalidArgumentError` on checksum mismatch. |
| `PageToken` | Class representing an offset-based page token with `offset` and `requestChecksum` fields. |
| `PageToken.next(pageSize)` | Returns a new `PageToken` for the next page. |
| `PageToken.previous(pageSize)` | Returns a new `PageToken` for the previous page (offset clamped to 0). |
| `PageToken.toString()` | Encodes the token as a base64 string. |
| `encode(token)` | Encode a `PageToken` to a base64 string. |
| `decode(str)` | Decode a base64 string to a `PageToken`. |

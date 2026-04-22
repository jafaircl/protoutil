# AIP-193: Errors

This package provides primitives for implementing AIP errors as described by [AIP-193](https://google.aip.dev/193).

The protobuf-level `google.rpc` messages and standard error detail validation
are shared with `@protoutil/core/google/rpc`. This module keeps the AIP-193
object-shaped detail API, `StatusError` classes, and gRPC-to-HTTP mappings.

## StatusError

`StatusError` is an `Error` subclass that wraps a `google.rpc.Status` message. It includes a gRPC `Code`, an HTTP status code, and structured error details.

```ts
import { StatusError, NotFoundError } from "@protoutil/aip/errors";

// Use a specific error subclass
throw new NotFoundError({
  message: "Book not found",
  errorInfo: { reason: "BOOK_NOT_FOUND", domain: "library.api" },
});
```

### Error Subclasses

Each subclass maps to a gRPC status code and HTTP code:

| Class | gRPC Code | HTTP Code |
|-------|-----------|-----------|
| `CancelledError` | `CANCELLED` | 499 |
| `UnknownError` | `UNKNOWN` | 500 |
| `InvalidArgumentError` | `INVALID_ARGUMENT` | 400 |
| `DeadlineExceededError` | `DEADLINE_EXCEEDED` | 504 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `AlreadyExistsError` | `ALREADY_EXISTS` | 409 |
| `PermissionDeniedError` | `PERMISSION_DENIED` | 403 |
| `UnauthenticatedError` | `UNAUTHENTICATED` | 401 |
| `ResourceExhaustedError` | `RESOURCE_EXHAUSTED` | 429 |
| `FailedPreconditionError` | `FAILED_PRECONDITION` | 400 |
| `AbortedError` | `ABORTED` | 409 |
| `OutOfRangeError` | `OUT_OF_RANGE` | 400 |
| `UnimplementedError` | `UNIMPLEMENTED` | 501 |
| `InternalError` | `INTERNAL` | 500 |
| `UnavailableError` | `UNAVAILABLE` | 503 |
| `DataLossError` | `DATA_LOSS` | 500 |

### Converting to/from Status

```ts
// Convert a StatusError to a google.rpc.Status message
const statusMsg = error.toStatus();

// Build a StatusError from a google.rpc.Status message
const error = StatusError.fromStatus(statusMsg);
```

## parseStatus

`parseStatus` parses a `google.rpc.Status` message and returns the appropriate `StatusError` subclass based on the status code:

```ts
import { parseStatus } from "@protoutil/aip/errors";

const error = parseStatus(statusMsg);
// Returns e.g. NotFoundError for Code.NOT_FOUND
```

## status

`status()` creates a `google.rpc.Status` protobuf message from a `StatusInit` object:

```ts
import { status } from "@protoutil/aip/errors";
import { Code } from "@protoutil/aip/errors";

const statusMsg = status({
  code: Code.NOT_FOUND,
  message: "Resource not found",
  errorInfo: { reason: "NOT_FOUND", domain: "example.com" },
});
```

## OK_STATUS

A pre-built `google.rpc.Status` message with `Code.OK`:

```ts
import { OK_STATUS } from "@protoutil/aip/errors";
```

## Error Details

Per AIP-193, each error detail field may only be set once. The `errorInfo` field is optional. Detail messages are materialized and validated with the shared `@protoutil/core/google/rpc` helpers. The following detail types are supported:

| Detail Type | Description |
|-------------|-------------|
| `errorInfo` | Describes the cause of the error with a reason and domain. |
| `retryInfo` | Describes when the client can retry a failed request. |
| `debugInfo` | Describes debugging info (stack traces, etc.). |
| `quotaFailure` | Describes how a quota check failed. |
| `preconditionFailure` | Describes what preconditions have failed. |
| `badRequest` | Describes violations in a client request. |
| `requestInfo` | Contains metadata about the request. |
| `resourceInfo` | Describes the resource being accessed. |
| `help` | Provides links to documentation or resources. |
| `localizedMessage` | Provides a localized error message. |

### Packing and Unpacking Details

```ts
import { packErrorDetails, unpackErrorDetails, errorDetails } from "@protoutil/aip/errors";

// Create structured error details
const details = errorDetails({
  errorInfo: { reason: "QUOTA_EXCEEDED", domain: "example.com" },
  retryInfo: { retryDelay: { seconds: 30n } },
});

// Pack details into google.protobuf.Any messages
const packed = packErrorDetails({
  errorInfo: { reason: "QUOTA_EXCEEDED", domain: "example.com" },
});

// Unpack details from google.protobuf.Any messages
const unpacked = unpackErrorDetails(anyMessages);
```

## API Reference

| Export | Description |
|--------|-------------|
| `StatusError` | Base error class wrapping `google.rpc.Status` |
| `CancelledError` ... `DataLossError` | Specific error subclasses (see table above) |
| `parseStatus(status)` | Parse a `Status` into the appropriate `StatusError` subclass |
| `status(init)` | Create a `google.rpc.Status` message |
| `OK_STATUS` | Pre-built OK status message |
| `errorDetails(init)` | Create an `ErrorDetails` object |
| `packErrorDetails(init)` | Pack error details into `google.protobuf.Any[]` |
| `unpackErrorDetails(details)` | Unpack error details from `google.protobuf.Any[]` |

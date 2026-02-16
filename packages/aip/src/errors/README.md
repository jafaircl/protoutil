# AIP-193: Errors

This package provides primitives for implementing AIP errors as described by [AIP-193](https://google.aip.dev/193).

You can parse a `Status` message and return a `StatusError` (or one of its subclasses):

```ts
import { parseStatusError, StatusError } from '@protoutil/aip';

parseStatusError(status);
```

The list of possible subclasses is:

- `CancelledError`
- `UnknownError`
- `InvalidArgumentError`
- `DeadlineExceededError`
- `NotFoundError`
- `AlreadyExistsError`
- `PermissionDeniedError`
- `UnauthenticatedError`
- `ResourceExhaustedError`
- `FailedPreconditionError`
- `AbortedError`
- `OutOfRangeError`
- `UnimplementedError`
- `InternalError`
- `UnavailableError`
- `DataLossError`

Each subclass provides both static and instance members which reveal the `google.rpc.Code` and the corresponding HTTP code. For example, the `PermissionDeniedError` code value is `Code.PERMISSION_DENIED` and the HTTP code is `403`.

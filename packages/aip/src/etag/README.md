# AIP-154: Resource Freshness Validation

This package provides primitives for implementing AIP resource freshness validation as described in [AIP-154](https://google.aip.dev/154).

The `calculateMessageEtag` function will calculate a Base64-encoded checksum from the passed message. Any two messages with identical values will calculate the same string:

```ts
import { calculateMessageEtag } from '@protoutil/aip';

const message1 = create(MySchema, { foo: 'bar' });
const etag1 = calculateMessageEtag(MySchema, message1);

const message2 = create(MySchema, { foo: 'bar' });
const etag2 = calculateMessageEtag(MySchema, message2);

const message3 = create(MySchema, { baz: 'qux' });
const etag3 = calculateMessageEtag(MySchema, message3);

etag1 === etag2; // true
etag1 === etag3; // false
etag2 === etag3; // false
```

Note that, if the message has an `etag` field, that field will not be used when calculating the ETag value.

You may also pass a `FieldMask` as an argument. This will ensure that the ETag is only calculated based on the fields in the `FieldMask`. [Per the AIP](https://google.aip.dev/154#strong-and-weak-etags), ETags with a `FieldMask` applied will be considered weakly validated. Therefore, they will be prefixed with **W/** as mandated by [RFC 7232](https://tools.ietf.org/html/rfc7232#section-2.3).

```ts
const fm = fieldMask(MySchema, ['baz']);
const etag = calculateMessageEtag(MySchema, message, fm);
// etag will be calculated based on the "baz" field and prefixed with "W/"
```

It is also possible to invert the `FieldMask`. This will ensure that the ETag is calculated on all fields _except_ the fields in the `FieldMask`:

```ts
const fm = fieldMask(MySchema, ['foo']);
const etag = calculateMessageEtag(MySchema, message, fm, true);
// etag will be calculated based on all fields EXCEPT the "foo" field and prefixed with "W/"
```

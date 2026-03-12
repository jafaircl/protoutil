# AIP-154: Resource Freshness Validation

This package provides primitives for implementing AIP resource freshness validation as described in [AIP-154](https://google.aip.dev/154).

## etag

Calculates a Base64-encoded checksum from a protobuf message. Any two messages with identical values will produce the same string. If the message has an `etag` field, it is excluded from the calculation.

```ts
import { etag } from "@protoutil/aip/etag";

const message1 = create(MySchema, { foo: "bar" });
const etag1 = etag(MySchema, message1);

const message2 = create(MySchema, { foo: "bar" });
const etag2 = etag(MySchema, message2);

const message3 = create(MySchema, { baz: "qux" });
const etag3 = etag(MySchema, message3);

etag1 === etag2; // true
etag1 === etag3; // false
```

### Weak ETags with FieldMask

Pass a `fieldMask` option to calculate the ETag based on specific fields only. [Per the AIP](https://google.aip.dev/154#strong-and-weak-etags), ETags with a `FieldMask` applied are weakly validated and will be prefixed with **W/** as mandated by [RFC 7232](https://tools.ietf.org/html/rfc7232#section-2.3).

```ts
import { fieldMask } from "@protoutil/core/wkt";

const fm = fieldMask(MySchema, ["baz"]);
const tag = etag(MySchema, message, { fieldMask: fm });
// Weak ETag calculated from the "baz" field only, prefixed with "W/"
```

### Inverse FieldMask

Invert the `FieldMask` to calculate the ETag on all fields _except_ the specified ones:

```ts
const fm = fieldMask(MySchema, ["foo"]);
const tag = etag(MySchema, message, { fieldMask: fm, inverse: true });
// Calculated from all fields EXCEPT "foo", prefixed with "W/"
```

## API Reference

| Export | Description |
|--------|-------------|
| `etag(schema, message, opts?)` | Calculate a Base64-encoded ETag for a message. Options: `{ fieldMask?, inverse? }`. Returns a strong ETag by default, or a weak ETag (prefixed with `W/`) when a non-wildcard `FieldMask` is provided. |

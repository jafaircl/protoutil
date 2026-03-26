# AIP-132: Ordering

This package provides primitives for implementing AIP ordering as described in [AIP-132](https://google.aip.dev/132#ordering).

An order-by value is a comma-separated list of fields (e.g. `foo, bar`). Each field may optionally have a direction suffix (`asc` or `desc`). Fields must be valid protobuf field names and may include subfields using dot notation (e.g. `foo.bar`).

## Usage

```ts
import { Field, OrderBy, parse, validate } from "@protoutil/aip/orderby";

// 1. Class API
const orderBy = new OrderBy([new Field("foo"), new Field("bar", true)]);
orderBy.toString(); // "foo, bar desc"

// 2. Parse from a string
const orderBy = parse("foo, bar desc");

// 3. Parse and validate against a message schema
const orderBy = parse("foo");
validate(orderBy, MyMessageSchema); // throws InvalidArgumentError if invalid
```

## API Reference

| Export | Description |
|--------|-------------|
| `Field` | Represents a single ordering field with `path` and `desc` properties. |
| `OrderBy` | Represents a complete ordering directive with a list of `Field` entries. |
| `parse(str)` | Parses an order-by string into an `OrderBy` object. Throws `InvalidArgumentError` on invalid syntax. |
| `validate(orderBy, desc)` | Validates that all field paths exist on the given message descriptor. Throws `InvalidArgumentError` if validation fails. |

### Field

| Member | Description |
|--------|-------------|
| `path` | The field path, including dot-separated subfields. |
| `desc` | Whether the ordering is descending (`true`) or ascending (`false`, default). |
| `subFields()` | Returns the individual parts of the field path (e.g. `["foo", "bar"]` for `"foo.bar"`). |

### OrderBy

| Member | Description |
|--------|-------------|
| `fields` | The array of `Field` entries. |
| `toString()` | Converts back to a canonical order-by string (e.g. `"foo, bar desc"`). |

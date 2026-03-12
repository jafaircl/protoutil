# AIP-203: Field Behavior

This package provides primitives for implementing AIP field behavior annotations as described by [AIP-203](https://google.aip.dev/203).

## Clearing Fields by Behavior

Clear fields with specific field behaviors from a message. For instance, clear all `OUTPUT_ONLY` fields before processing a request:

```ts
import { clearFields } from "@protoutil/aip/fieldbehavior";
import { FieldBehavior } from "@buf/googleapis_googleapis.bufbuild_es/google/api/field_behavior_pb.js";

const message = create(MyMessageSchema, { ... });
const updated = clearFields(MyMessageSchema, message, [FieldBehavior.OUTPUT_ONLY]);
```

By default, this function returns a copy of the original message with the fields cleared. Pass `{ mutate: true }` to mutate the original message instead.

## Querying Field Behaviors

```ts
import { getFieldBehavior, hasFieldBehavior, hasAnyFieldBehavior } from "@protoutil/aip/fieldbehavior";

// Get the field behaviors for a specific field
const behaviors = getFieldBehavior(fieldDescriptor);

// Check if a field has a specific behavior
hasFieldBehavior(fieldDescriptor, FieldBehavior.REQUIRED); // true/false

// Check if a field has any of the specified behaviors
hasAnyFieldBehavior(fieldDescriptor, [FieldBehavior.REQUIRED, FieldBehavior.IMMUTABLE]);
```

## Validating Immutable Fields

Validate that no immutable fields have been changed on a message:

```ts
import { validateImmutableFields } from "@protoutil/aip/fieldbehavior";

validateImmutableFields(MyMessageSchema, message); // throws if any immutable fields are set
```

With a field mask to only check specific fields:

```ts
import { fieldMask } from "@protoutil/core/wkt";

validateImmutableFields(MyMessageSchema, message, {
  fieldMask: fieldMask(MyMessageSchema, ["immutable_field"]),
});
```

## Validating Required Fields

Similarly, validate that all required fields have been set:

```ts
import { validateRequiredFields } from "@protoutil/aip/fieldbehavior";

validateRequiredFields(MyMessageSchema, message); // throws if any required fields are missing
validateRequiredFields(MyMessageSchema, message, { fieldMask: mask }); // checks only masked fields
```

## API Reference

| Export | Description |
|--------|-------------|
| `clearFields(schema, message, behaviors, opts?)` | Clear fields matching the given behaviors. Options: `{ mutate? }`. Returns a copy unless `mutate` is `true`. |
| `getFieldBehavior(field)` | Get the list of `FieldBehavior` annotations for a field descriptor. |
| `hasFieldBehavior(field, behavior)` | Check if a field has a specific `FieldBehavior`. |
| `hasAnyFieldBehavior(field, behaviors)` | Check if a field has any of the specified `FieldBehavior` values. |
| `validateImmutableFields(schema, message, opts?)` | Throws if any `IMMUTABLE` fields are set. Options: `{ fieldMask? }`. |
| `validateRequiredFields(schema, message, opts?)` | Throws if any `REQUIRED` fields are missing. Options: `{ fieldMask? }`. |

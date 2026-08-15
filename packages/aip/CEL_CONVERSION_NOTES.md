# AIP filter conversion to CEL

This note is not a comprehensive migration design. It records two required semantic conversions when an AIP-160 filter AST becomes a canonical `cel.expr` AST for checking and CELQL translation.

- Convert the AIP unary-negation call `@not(expression)` to CEL's `!_(expression)`.
- Reverse the operands of AIP's has operator. AIP parses `field: value` as `@in(field, value)`. CEL represents the equivalent membership test as `@in(value, field)`.

The `google.api.expr.v1alpha1` and `cel.expr` protobuf expression schemas are wire-compatible, but their TypeScript message types differ. Use the conversion helpers in `@protoutil/cel`; do not rely on a type assertion alone.

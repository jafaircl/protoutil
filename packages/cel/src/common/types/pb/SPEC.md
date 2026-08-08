# Protobuf adaptation requirements

## CEL-PB-001: Reflected protobuf inputs

WHEN a caller supplies a Protobuf-ES `ReflectMessage`, `ReflectList`, or `ReflectMap` to the native-value adapter,
the adapter MUST expose the same CEL value semantics as the equivalent generated protobuf value.

## CEL-PB-002: Protobuf field access

WHEN CEL selects or tests a protobuf field,
the adapter MUST use the public Protobuf-ES reflection API for protobuf presence and field retrieval.

## CEL-PB-003: CEL conversion boundary

WHEN Protobuf-ES reflection returns a protobuf field value,
the adapter MUST preserve descriptor information until it applies CEL scalar, wrapper, well-known-type, enum, and null semantics.

/* eslint-disable no-case-declarations */
import {
  type DescField,
  type DescMessage,
  isFieldSet,
  type Message,
  type MessageShape,
} from "@bufbuild/protobuf";
import type { FieldMask } from "@bufbuild/protobuf/wkt";
import { getField } from "@protoutil/core";
import { fieldMask, fieldMaskHasPath } from "@protoutil/core/wkt";
import { InvalidArgumentError } from "../errors/errors.js";
import { FieldBehavior } from "../gen/google/api/field_behavior_pb.js";
import { hasFieldBehavior } from "./fieldbehavior.js";

/**
 * Options for {@link validateImmutableFields}.
 */
export interface ValidateImmutableFieldsOptions {
  fieldMask?: FieldMask;
}

/**
 * Throws a validation error if the message contains a field that is immutable
 * and a change to an immutable field is requested. This can be used when
 * validating update requests and want to return INVALID_ARGUMENT to the user.
 *
 * If a fieldMask is provided, only fields in the mask are checked. Otherwise,
 * all fields are checked.
 *
 * See: https://google.aip.dev/203
 */
export function validateImmutableFields(
  schema: DescMessage,
  message: MessageShape<DescMessage>,
  opts?: ValidateImmutableFieldsOptions,
): void {
  const fm = opts?.fieldMask ?? fieldMask(schema, ["*"], false);
  _validateImmutableFields(schema, message, fm);
}

function _validateImmutableFields<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  fieldMask: FieldMask,
  path = "",
  parentField: DescField | null = null,
) {
  // If no paths are provided, the field mask should be treated to be equivalent
  // to all fields set on the wire. This means that no required fields can be
  // missing, since if they were missing they're not set on the wire.
  if (fieldMask.paths.length === 0) {
    return;
  }
  for (const field of schema.fields) {
    let currPath = path;
    if (currPath.length > 0) {
      currPath += ".";
    }
    currPath += field.name;
    // If the field is part of an array or map, we need to build a path with a
    // wildcard i.e. foo.0.bar -> foo.*.bar
    const parentIsListOrMap = parentField?.fieldKind === "list" || parentField?.fieldKind === "map";
    let listOrMapCurrPath = parentIsListOrMap ? path.split(".").slice(0, -1).join(".") : path;
    if (parentIsListOrMap) {
      listOrMapCurrPath += `.*.${field.name}`;
    }
    if (
      isFieldSet(message, field) &&
      hasFieldBehavior(field, FieldBehavior.IMMUTABLE) &&
      (fieldMaskHasPath(fieldMask, currPath, false) ||
        (parentIsListOrMap && fieldMaskHasPath(fieldMask, listOrMapCurrPath, false)))
    ) {
      throw new InvalidArgumentError({
        message: `field is immutable: ${currPath}`,
        errorInfo: {
          reason: "IMMUTABLE_FIELD",
          domain: "bearclaw.aip.fieldbehavior",
          metadata: {
            field: currPath,
          },
        },
      });
    } else if (field.message) {
      const value = getField(message, field);
      switch (field.fieldKind) {
        case "list": {
          const list = value as Message[];
          for (let i = 0; i < (value as Message[]).length; i++) {
            _validateImmutableFields(field.message, list[i], fieldMask, `${currPath}.${i}`, field);
          }
          break;
        }
        case "map":
          for (const [k, v] of Object.entries(value as Record<string, Message>)) {
            _validateImmutableFields(field.message, v, fieldMask, `${currPath}.${k}`, field);
          }
          break;
        case "message":
          if (value) {
            _validateImmutableFields(field.message, value as Message, fieldMask, currPath, field);
          }
          break;
        default:
          break;
      }
    }
  }
}

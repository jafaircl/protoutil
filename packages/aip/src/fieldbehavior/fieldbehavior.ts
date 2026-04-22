import {
  clearField,
  clone,
  type DescField,
  type DescMessage,
  getOption,
  isFieldSet,
  type Message,
  type MessageShape,
} from "@bufbuild/protobuf";
import { getField } from "@protoutil/core";
import { type FieldBehavior, field_behavior } from "../gen/google/api/field_behavior_pb.js";

/**
 * Get returns the field behavior of the provided field descriptor.
 *
 * @param field the field descriptor to get the field behavior for
 * @returns the field behavior of the field descriptor
 */
export function getFieldBehavior(field: DescField): FieldBehavior[] {
  return getOption(field, field_behavior);
}

/**
 * Has returns true if the provided field descriptor has the wanted field
 * behavior.
 *
 * @param field the field descriptor to check
 * @param behavior the field behavior to check for
 * @returns true if the field descriptor has the wanted field behavior
 */
export function hasFieldBehavior(field: DescField, behavior: FieldBehavior): boolean {
  const behaviors = getFieldBehavior(field);
  return behaviors.some((b) => b === behavior);
}

/**
 * HasAnyFieldBehavior returns true if the provided field descriptor has any
 * of the wanted field behaviors.
 *
 * @param field the field descriptor to check
 * @param behaviors the field behaviors to check for
 * @returns true if the field descriptor has any of the wanted field behaviors
 */
export function hasAnyFieldBehavior(field: DescField, behaviors: FieldBehavior[]) {
  for (const behavior of behaviors) {
    if (hasFieldBehavior(field, behavior)) {
      return true;
    }
  }
  return false;
}

/**
 * Options for {@link clearFields}.
 */
export interface ClearFieldsOptions {
  mutate?: boolean;
}

/**
 * Clears all fields annotated with any of the provided behaviors.
 * This can be used to ignore fields provided as input that have
 * field_behavior's such as OUTPUT_ONLY and IMMUTABLE.
 *
 * See: https://google.aip.dev/161#output-only-fields
 */
export function clearFields<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  behaviors: FieldBehavior[],
  opts?: ClearFieldsOptions,
) {
  const copy = opts?.mutate ? message : clone(schema, message);
  for (const field of schema.fields) {
    if (!isFieldSet(copy, field)) {
      continue;
    }
    if (hasAnyFieldBehavior(field, behaviors)) {
      clearField(copy, field);
      continue;
    }
    switch (field.fieldKind) {
      case "list":
        if (field.listKind === "message") {
          for (const item of getField(copy, field) as Message[]) {
            clearFields(field.message, item, behaviors, { mutate: true });
          }
        }
        break;
      case "map":
        if (field.mapKind === "message") {
          for (const value of Object.values(getField(copy, field) as Record<string, Message>)) {
            clearFields(field.message, value, behaviors, { mutate: true });
          }
        }
        break;
      case "message":
        clearFields(field.message, getField(copy, field) as Message, behaviors, { mutate: true });
        break;
      default:
        break;
    }
  }
  return copy;
}

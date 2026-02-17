import {
  type PathKind,
  type SchemaPath,
  type SchemaPathTree,
  type TreeValidationResult,
  type ValidationError,
  validateTree,
} from "@angular/forms/signals";
import { getOption, type Message } from "@bufbuild/protobuf";
import type { GenMessage } from "@bufbuild/protobuf/codegenv2";
import type { Path } from "@bufbuild/protobuf/reflect";
import type { Validator, Violation } from "@bufbuild/protovalidate";
import { type FieldRules, field } from "./gen/buf/validate/validate_pb";

/**
 * Converts a protobuf path to a schema path tree. This is used to map protobuf
 * validation violations to Angular form controls.
 */
export function protobufPathToSchemaPathTree<T>(
  path: Path,
  basePath: SchemaPathTree<T>,
): SchemaPathTree<T> {
  let current: SchemaPathTree<T> = basePath;
  for (const segment of path) {
    switch (segment.kind) {
      case "field":
        current = current[segment.jsonName as keyof SchemaPathTree<T>] as SchemaPathTree<T>;
        break;
      case "list_sub":
        current = current[segment.index.toString() as keyof SchemaPathTree<T>] as SchemaPathTree<T>;
        break;
      case "map_sub":
        current = current[segment.key.toString() as keyof SchemaPathTree<T>] as SchemaPathTree<T>;
        break;
      default:
        break;
    }
  }
  return current;
}

/**
 * Collects the field rules from a violation. This is a helper function to extract
 * the field rules from a violation, which can then be used to display error messages
 * in the Angular form controls.
 */
export function collectViolationFieldRules(violation: Violation): FieldRules[] {
  const rules: FieldRules[] = [];
  for (const f of violation.field) {
    switch (f.kind) {
      case "field":
        rules.push(getOption(f, field));
        break;
    }
  }
  return rules;
}

/**
 * The result of a message tree validation. This type extends the TreeValidationResult
 * from Angular forms to include the violation information from the protovalidate library.
 */
export type MessageTreeValidationResult<
  E extends ValidationError.WithOptionalField = ValidationError.WithOptionalField,
> = TreeValidationResult<E> & {
  violation: Violation;
};

/**
 * Validates a message tree using the provided validator and schema. This function
 * uses the protovalidate library to validate the message tree and maps the violations
 * to Angular form controls.
 */
export function validateMessageTree<T extends Message = Message>(
  path: SchemaPathTree<T, PathKind.Root>,
  validator: Validator,
  schema: GenMessage<T>,
): void {
  validateTree<T>(path as SchemaPath<T>, (ctx) => {
    const result = validator.validate(schema, ctx.value());
    switch (result.kind) {
      case "valid":
        return null;
      case "invalid":
        return result.violations.map((violation) => ({
          violation,
          kind: violation.ruleId,
          message: violation.message,
          fieldTree: ctx.fieldTreeOf(protobufPathToSchemaPathTree(violation.field, path)),
        }));
      case "error":
        throw result.error;
    }
  });
}

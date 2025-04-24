/* eslint-disable no-case-declarations */
import {
  clearField,
  clone,
  create,
  DescField,
  DescMessage,
  isFieldSet,
  Message,
  MessageShape,
} from '@bufbuild/protobuf';
import { FieldMask, FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { InvalidValueError } from '../errors.js';
import { getField, setField } from '../field.js';

/**
 * Create a google.protobuf.FieldMask message. In addition to being less verbose, this function will
 * validate the field mask to ensure it is valid for the given message descriptor. An error will be
 * thrown if the field mask is invalid for the message descriptor.
 *
 * Note that the FieldMask spec does not allow for wildcards and repeated or map fields must be the
 * last part of the path. This function will error in those cases. `aipFieldMask` will allow field
 * masks with wildcards, repeated, and map fields.
 */
export function fieldMask(schema: DescMessage, ...paths: string[]) {
  const value = create(FieldMaskSchema, { paths });
  assertValidFieldMask(schema, value);
  return value;
}

/**
 * A valid field name string must start with a lowercase letter, end with a lower case alphanumeric
 * character (and NOT an underscore) and can only contain lowercase letters, numbers, and
 * underscores. It cannot contain any other characters. It may be as few as one character long.
 */
export function isValidFieldName(str: string) {
  return /^[a-z_][a-z0-9_]*[a-z0-9]$|^[a-z]$/.test(str);
}

/**
 * Asserts that a field mask is valid for a given message descriptor.
 *
 * Note that the FieldMask spec does not allow for wildcards and repeated or map fields must be the
 * last part of the path. This function will error in those cases. `assertValidAipFieldMask` will
 * allow field masks with wildcards, repeated, and map fields.
 */
export function assertValidFieldMask(schema: DescMessage, fieldMask: FieldMask) {
  for (const path of fieldMask.paths) {
    let md: DescMessage | null = schema;
    let fd: DescField | null = null;
    const fields = path.split('.');
    for (const field of fields) {
      // Valid protobuf field names must be lower snake case.
      if (!isValidFieldName(field)) {
        throw new InvalidValueError(`invalid protobuf field name: ${field}`, path);
      }
      if (!md) {
        if (fd && fd.fieldKind === 'list') {
          throw new InvalidValueError(
            `repeated field is only allowed in the last position: ${path}`,
            path
          );
        }
        if (fd && fd.fieldKind === 'map') {
          throw new InvalidValueError(
            `map field is only allowed in the last position: ${path}`,
            path
          );
        }
        throw new InvalidValueError(`invalid field: ${field}`, path);
      }
      fd = md.fields.find((f) => f.name === field) ?? null;
      if (!fd) {
        throw new InvalidValueError(`field '${field}' not found in message ${md.typeName}`, path);
      }
      // Identify the next message descriptor.
      switch (fd.fieldKind) {
        case 'message':
          md = fd.message;
          break;
        default:
          md = null;
          break;
      }
    }
  }
}

/**
 * Check if a field mask is valid for a given message descriptor.
 *
 * Note that the FieldMask spec does not allow for wildcards and repeated or map fields must be the
 * last part of the path. This function will error in those cases. `isValidAipFieldMask` will allow
 * field masks with wildcards, repeated, and map fields.
 */
export function isValidFieldMask(schema: DescMessage, fieldMask: FieldMask) {
  try {
    assertValidFieldMask(schema, fieldMask);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a field mask has a path that matches the given path. A path matches if it is equal to
 * the passed path or if it starts with the passed path and a dot. For example, a field mask with
 * a "foo.bar" path will return true if the passed path is "foo.bar" or "foo.bar.baz".
 */
export function fieldMaskHasPath(fieldMask: FieldMask, path: string) {
  for (const p of fieldMask.paths) {
    if (p === path || path.startsWith(p + '.')) {
      return true;
    }
  }
  return false;
}

/**
 * Applies a field mask to a message, creating a new message with only the fields specified in the
 * field mask. If the inverse argument is true, the inverse of the field mask is applied, meaning
 * that only the fields NOT specified in the field mask are included in the new message. Note that
 * this operation does not mutate the original message. Instead, it creates a new message with the
 * field mask applied.
 */
export function applyFieldMask<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  fieldMask: FieldMask,
  inverse = false
) {
  assertValidFieldMask(schema, fieldMask);
  const copy = inverse ? clone(schema, message) : create(schema);
  for (const path of fieldMask.paths) {
    applyPath(schema, copy, message, path.split('.'), inverse);
  }
  return copy;
}

function applyPath<Desc extends DescMessage>(
  schema: Desc,
  target: MessageShape<Desc>,
  source: MessageShape<Desc>,
  segments: string[],
  inverse: boolean
) {
  if (segments.length === 0) {
    return;
  }
  const field = schema.fields.find((f) => f.name === segments[0]);
  if (!field) {
    // No known field by that name
    return;
  }
  // The segment is a single named field in this message
  if (segments.length === 1) {
    if (inverse) {
      clearField(target, field);
    } else {
      setField(target, field, getField(source, field));
    }
  }
  switch (field.fieldKind) {
    case 'message':
      const sourceValue = getField(source, field) as Message;
      if (!isFieldSet(target, field) && !inverse) {
        setField(target, field, create(field.message));
      }
      const targetValue = getField(target, field) as Message;
      applyPath(field.message, targetValue, sourceValue, segments.slice(1), inverse);
      break;
    default:
      break;
  }
}

/**
 * Returns the union of all the paths in the input field masks.
 */
export function mergeFieldMasks(...fieldMasks: FieldMask[]) {
  const paths: string[] = [];
  for (const fieldMask of fieldMasks) {
    for (const path of fieldMask.paths) {
      paths.push(path);
    }
  }
  return create(FieldMaskSchema, { paths: normalizePaths(paths) });
}

/**
 * Returns the intersection of all the paths in the input field masks.
 */
export function intersectFieldMasks(...fieldMasks: FieldMask[]) {
  if (fieldMasks.length === 0) {
    return create(FieldMaskSchema);
  }
  let outPaths: string[] = [...fieldMasks[0].paths];
  for (let i = 1; i < fieldMasks.length; i++) {
    outPaths = intersectPaths(outPaths, [...fieldMasks[i].paths]);
  }
  return create(FieldMaskSchema, { paths: normalizePaths(outPaths) });
}

function intersectPaths(out: string[], inPaths: string[]): string[] {
  const ss1 = normalizePaths([...inPaths]);
  const ss2 = normalizePaths([...out]);
  const result: string[] = [];
  let i1 = 0,
    i2 = 0;

  while (i1 < ss1.length && i2 < ss2.length) {
    const s1 = ss1[i1];
    const s2 = ss2[i2];

    if (hasPathPrefix(s1, s2)) {
      result.push(s1);
      i1++;
    } else if (hasPathPrefix(s2, s1)) {
      result.push(s2);
      i2++;
    } else if (lessPath(s1, s2)) {
      i1++;
    } else {
      i2++;
    }
  }

  return result;
}

function normalizePaths(paths: string[]): string[] {
  // Sort paths lexicographically with a custom comparison
  const _paths = paths.sort((a, b) => (lessPath(a, b) ? -1 : 1));

  // Elide any path that is a prefix match on the previous
  const out: string[] = [];
  for (const path of _paths) {
    if (out.length > 0 && hasPathPrefix(path, out[out.length - 1])) {
      continue;
    }
    out.push(path);
  }
  return out;
}

/**
 * hasPathPrefix is like string.startsWith, but further checks for either an exact matche or that
 * the prefix is delimited by a dot.
 */
function hasPathPrefix(path: string, prefix: string): boolean {
  // The path does not start with the prefix
  if (!path.startsWith(prefix)) {
    return false;
  }
  // The path is the same as the prefix
  if (path.length === prefix.length) {
    return true;
  }
  // The path is longer than the prefix and the next character is a dot
  if (path[prefix.length] === '.') {
    return true;
  }
  return false;
}

/**
 * lessPath is a lexicographical comparison where dot is specially treated as the smallest symbol.
 */
function lessPath(x: string, y: string): boolean {
  const dotCharCode = '.'.charCodeAt(0);
  for (let i = 0; i < x.length && i < y.length; i++) {
    if (x[i] !== y[i]) {
      return x.charCodeAt(i) - dotCharCode < y.charCodeAt(i) - dotCharCode;
    }
  }
  return x.length < y.length;
}

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
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function fieldMask(schema: DescMessage, paths: string[], strict = true) {
  const value = create(FieldMaskSchema, { paths });
  assertValidFieldMask(schema, value, strict);
  return value;
}

/**
 * A valid field name string must start with a lowercase letter, end with a lower case alphanumeric
 * character (and NOT an underscore) and can only contain lowercase letters, numbers, and
 * underscores. It cannot contain any other characters. It may be as few as one character long.
 *
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function isValidFieldName(str: string, strict = true) {
  if (strict) {
    return /^[a-z_][a-z0-9_]*[a-z0-9]$|^[a-z]$/.test(str);
  }
  return /^[a-z_][a-z0-9_]*[a-z0-9]$|^[a-z]$|^\*$|^[a-z_][a-z0-9_]*\.$|^\*[a-z0-9]$/.test(str);
}

/**
 * Asserts that a field mask is valid for a given message descriptor.
 *
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function assertValidFieldMask(schema: DescMessage, fieldMask: FieldMask, strict = true) {
  for (const path of fieldMask.paths) {
    // Special case for '*' wildcard. If a field is a wildcard, it must be
    // the only path in the field mask.
    if (!strict && path === '*') {
      if (fieldMask.paths.length > 1) {
        throw new InvalidValueError(
          `invalid field path: '*' must not be used with other paths`,
          path
        );
      }
      // This path is valid and the only one
      continue;
    }
    let md: DescMessage | null = schema;
    let fd: DescField | null = null;
    const fields = path.split('.');
    for (const field of fields) {
      // Valid protobuf field names must be lower snake case.
      if (!isValidFieldName(field, strict)) {
        throw new InvalidValueError(`invalid protobuf field name: ${field}`, path);
      }
      // The field can be a wildcard as long as the previous field was a list
      // or map. For example: `map_uint64_timestamp.*.seconds` might be valid
      // since `map_uint64_timestamp` is presumably a map with timestamp
      // message values. See: https://google.aip.dev/161#wildcards
      if (!strict && field === '*') {
        // If the field descriptor is nil, we cannot have a wildcard.
        if (!fd) {
          throw new InvalidValueError(`wildcards must be used with repeated or map fields`, path);
        }
        switch (fd.fieldKind) {
          case 'list':
          case 'map':
            md = fd.message ?? null;
            // This path is valid. Move on to the next field.
            continue;
          default:
            // If the field descriptor is not a list or map, we cannot have a wildcard.
            throw new InvalidValueError(`wildcards must be used with repeated or map fields`, path);
        }
      }
      if (!md) {
        if (strict && fd && fd.fieldKind === 'list') {
          throw new InvalidValueError(
            `repeated field is only allowed in the last position: ${path}`,
            path
          );
        }
        if (strict && fd && fd.fieldKind === 'map') {
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
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function isValidFieldMask(schema: DescMessage, fieldMask: FieldMask, strict = true) {
  try {
    assertValidFieldMask(schema, fieldMask, strict);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a field mask has a path that matches the given path. A path matches if it is equal to
 * the passed path or if it starts with the passed path and a dot. For example, a field mask with
 * a "foo.bar" path will return true if the passed path is "foo.bar" or "foo.bar.baz".
 *
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function fieldMaskHasPath(fieldMask: FieldMask, path: string, strict = true) {
  for (const p of fieldMask.paths) {
    // Wildcards, e.g. "*", match any path.
    if (!strict && p === '*') {
      return true;
    }
    // If the path is equal to the passed path, it matches.
    // If the path starts with the passed path and a dot, it matches.
    // i.e. "foo.bar" matches "foo.bar.baz"
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
 *
 * The `FieldMask` spec does not allow for wildcards and repeated or map fields must be the last part
 * of the path. The final argument for this function is `strict`, which defaults to `true`. If `strict`
 * is `true`, the function will only allow field masks that are valid according to the spec. However,
 * the [AIP Guidelines](https://google.aip.dev/161) allow for wildcards in field masks. So, if you want to
 * allow wildcards, you can set `strict` to `false`. This will allow for field masks with standalone
 * wildcards or wildcards in repeated or map fields (i.e. `'*'`, `'foo.*'`, `'foo.*.bar'`, etc.).
 */
export function applyFieldMask<Desc extends DescMessage>(
  schema: Desc,
  message: MessageShape<Desc>,
  fieldMask: FieldMask,
  inverse = false,
  strict = true
) {
  assertValidFieldMask(schema, fieldMask, strict);
  const copy = inverse ? clone(schema, message) : create(schema);
  for (const path of fieldMask.paths) {
    if (!strict && path === '*') {
      return inverse ? create(schema) : clone(schema, message);
    }
    applyPath(schema, copy, message, path.split('.'), inverse, strict);
  }
  return copy;
}

function applyPath<Desc extends DescMessage>(
  schema: Desc,
  target: MessageShape<Desc>,
  source: MessageShape<Desc>,
  segments: string[],
  inverse: boolean,
  strict: boolean
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
    case 'list':
      if (!strict && segments[1] === '*' && field.listKind === 'message') {
        const sourceList = getField(source, field) as Message[];
        const targetList = getField(target, field) as Message[];
        for (let i = 0; i < sourceList.length; i++) {
          targetList[i] = inverse ? clone(field.message, sourceList[i]) : create(field.message);
          applyPath(
            field.message,
            targetList[i],
            sourceList[i],
            segments.slice(2),
            inverse,
            strict
          );
        }
      }
      break;
    case 'map':
      if (!strict && segments[1] === '*' && field.mapKind === 'message') {
        const sourceMap = getField(source, field) as Record<string | number | symbol, Message>;
        const targetMap = getField(target, field) as Record<string | number | symbol, Message>;
        for (const [key, sourceValue] of Object.entries(sourceMap)) {
          targetMap[key] = inverse ? clone(field.message, sourceValue) : create(field.message);
          applyPath(field.message, targetMap[key], sourceValue, segments.slice(2), inverse, strict);
        }
      }
      break;
    case 'message':
      const sourceValue = getField(source, field) as Message;
      if (!isFieldSet(target, field) && !inverse) {
        setField(target, field, create(field.message));
      }
      const targetValue = getField(target, field) as Message;
      applyPath(field.message, targetValue, sourceValue, segments.slice(1), inverse, strict);
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

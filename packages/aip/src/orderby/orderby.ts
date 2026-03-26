/* eslint-disable no-case-declarations */

import type { DescMessage } from "@bufbuild/protobuf";
import { fieldMask, isValidFieldMask } from "@protoutil/core/wkt";
import { InvalidArgumentError } from "../errors/errors.js";

/**
 * Field represents a single ordering field.
 */
export class Field {
  /**
   * Path is the path of the field, including subfields
   */
  path: string;
  /**
   * Desc indicates if the ordering of the field is descending.
   */
  desc: boolean;

  constructor(path: string, desc = false) {
    this.path = path;
    this.desc = desc;
  }

  /**
   * SubFields returns the individual subfields of the field path, including
   * the top-level subfield.
   *
   * Subfields are specified with a . character, such as foo.bar or address
   * street.
   */
  subFields(): string[] {
    return this.path.split(".").map((subField) => subField.trim());
  }
}

/**
 * OrderBy represents an ordering directive.
 */
export class OrderBy {
  /**
   * Fields are the fields to order by.
   */
  fields: Field[];

  constructor(fields: Field[]) {
    this.fields = fields;
  }

  toString() {
    return this.fields
      .map((field) => {
        if (field.desc) {
          return `${field.path} desc`;
        }
        return field.path;
      })
      .join(", ");
  }
}

/**
 * Validates that the ordering paths are syntactically valid and refer to
 * known fields in the specified message type. Throws if any field path is
 * invalid for the message descriptor.
 */
export function validate(orderBy: OrderBy, desc: DescMessage) {
  const paths: string[] = [];
  for (const field of orderBy.fields) {
    paths.push(field.path);
  }
  const fm = fieldMask(desc, paths);
  return isValidFieldMask(desc, fm);
}

/**
 * Parse an order by string into an OrderBy object.
 *
 * @param str the order by string
 * @returns the parsed order by object
 */
export function parse(str: string) {
  if (str === "") {
    return new OrderBy([]);
  }
  for (const char of str) {
    // Check if the character is a valid character for a field name or a space
    if (!/^[a-zA-Z0-9_., ]+$/.test(char)) {
      throw new InvalidArgumentError({
        message: `parse order by '${str}': invalid character '${char}'`,
        errorInfo: {
          reason: "INVALID_CHARACTER",
          domain: "bearclaw.aip.orderby",
          metadata: {
            orderBy: str,
            char,
          },
        },
      });
    }
  }
  const fields: Field[] = [];
  const candidates = str.split(",").map((s) => s.trim());
  for (const field of candidates) {
    const parts = field.split(" ").map((s) => s.trim());
    if (parts[0] === "") {
      throw new InvalidArgumentError({
        message: `parse order by '${str}': invalid format`,
        errorInfo: {
          reason: "MISSING_FIELD_NAME",
          domain: "protoutil.aip.orderby",
          metadata: {
            orderBy: str,
          },
        },
      });
    }
    switch (parts.length) {
      case 1:
        // default ordering ascending
        fields.push(new Field(parts[0], false));
        break;
      case 2: {
        // specific ordering
        let desc = false;
        switch (parts[1].toLowerCase()) {
          case "asc":
            desc = false;
            break;
          case "desc":
            desc = true;
            break;
          default:
            throw new InvalidArgumentError({
              message: `parse order by '${str}': invalid format`,
              errorInfo: {
                reason: "INVALID_SORT_ORDER",
                domain: "protoutil.aip.orderby",
                metadata: {
                  orderBy: str,
                },
              },
            });
        }
        fields.push(new Field(parts[0], desc));
        break;
      }
      default:
        throw new InvalidArgumentError({
          message: `parse order by '${str}': invalid format`,
          errorInfo: {
            reason: "INVALID_FORMAT",
            domain: "protoutil.aip.orderby",
            metadata: {
              orderBy: str,
            },
          },
        });
    }
  }
  return new OrderBy(fields);
}

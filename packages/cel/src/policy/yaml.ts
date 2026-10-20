/**
 * ListVisitor receives decoded YAML list elements.
 */
export interface ListVisitor {
  /** visit processes one list element and returns false to stop iteration. */
  visit(index: number, value: unknown): boolean;
}

/**
 * MapVisitor receives decoded YAML mapping entries.
 */
export interface MapVisitor {
  /** visit processes one mapping entry and returns false to stop iteration. */
  visit(key: string, value: unknown): boolean;
}

/**
 * YAMLHelper provides helper methods for working with decoded YAML values.
 */
export class YAMLHelper {
  /** isList returns true if the YAML value is a list. */
  public isList(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  /**
   * rangeList iterates over a list until the visitor returns false.
   */
  public rangeList(value: unknown, visitor: ListVisitor): void {
    if (!this.isList(value)) {
      return;
    }
    for (const [index, element] of value.entries()) {
      if (!visitor.visit(index, element)) {
        break;
      }
    }
  }

  /** isMap returns true if the YAML value is a mapping. */
  public isMap(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }

  /**
   * rangeMap iterates over a mapping until the visitor returns false.
   */
  public rangeMap(value: unknown, visitor: MapVisitor): void {
    if (!this.isMap(value)) {
      return;
    }
    for (const [key, element] of Object.entries(value)) {
      if (!visitor.visit(key, element)) {
        break;
      }
    }
  }

  /** isString returns true if the YAML value is a string. */
  public isString(value: unknown): value is string {
    return typeof value === "string";
  }

  /** isBool returns true if the YAML value is a boolean. */
  public isBool(value: unknown): value is boolean {
    return typeof value === "boolean";
  }

  /** isNull returns true if the YAML value is null. */
  public isNull(value: unknown): value is null {
    return value === null;
  }

  /** isNumber returns true if the YAML value is a finite number. */
  public isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  /** isInteger returns true if the YAML value is an integer. */
  public isInteger(value: unknown): value is number {
    return this.isNumber(value) && Number.isInteger(value);
  }

  /** isDouble returns true if the YAML value is a non-integer number. */
  public isDouble(value: unknown): value is number {
    return this.isNumber(value) && !Number.isInteger(value);
  }

  /** isTimestamp returns true if the YAML value is a timestamp. */
  public isTimestamp(value: unknown): value is Date {
    return value instanceof Date;
  }
}

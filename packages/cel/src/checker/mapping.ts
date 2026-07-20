import type { Type } from "../common/types/types.js";
import { formatCELType } from "./format.js";

/**
 * mapping tracks type-parameter substitutions during checker unification.
 */
export class mapping {
  private readonly values = new Map<string, Type>();

  /**
   * add records a substitution from one type to another.
   */
  public add(from: Type, to: Type): void {
    this.values.set(formatCELType(from), to);
  }

  /**
   * find returns a substitution when one is present.
   */
  public find(from: Type): [Type | undefined, boolean] {
    const resolved = this.values.get(formatCELType(from));
    return [resolved, resolved !== undefined];
  }

  /**
   * copy clones the current mapping.
   */
  public copy(): mapping {
    const next = mappingValue();
    for (const [key, value] of this.values) {
      next.values.set(key, value);
    }
    return next;
  }
}

/**
 * mappingValue creates an empty type substitution mapping.
 */
export function mappingValue(): mapping {
  return new mapping();
}

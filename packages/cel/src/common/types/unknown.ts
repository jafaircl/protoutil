import type { Type as RefType, Val } from "./ref/index.js";
import { UnknownType } from "./types.js";

/**
 * AttributeTrail creates a new simple attribute from a variable name.
 */
export function attributeTrail(variable: string): AttributeTrail {
  if (variable === "") {
    return unspecifiedAttribute;
  }
  return new AttributeTrail(variable, []);
}

/**
 * AttributeQualifier constrains the possible types which may be used to qualify an attribute.
 */
export type AttributeQualifier = boolean | number | bigint | string;

/**
 * QualifyAttribute qualifies an attribute using a valid AttributeQualifier type.
 */
export function qualifyAttribute<T extends AttributeQualifier>(
  attr: AttributeTrail,
  qualifier: T,
): AttributeTrail {
  attr.qualifierPath().push(qualifier);
  return attr;
}

/**
 * AttributeTrail specifies a variable with an optional qualifier path.
 */
export class AttributeTrail {
  constructor(
    private readonly variableValue: string,
    private readonly qualifierPathValue: AttributeQualifier[],
  ) {}

  /** Equal returns whether two attribute values have the same variable name and qualifier paths. */
  public equal(other: AttributeTrail): boolean {
    if (
      this.variable() !== other.variable() ||
      this.qualifierPath().length !== other.qualifierPath().length
    ) {
      return false;
    }
    return this.qualifierPath().every((qualifier, index) =>
      qualifiersEqual(qualifier, other.qualifierPath()[index]!),
    );
  }

  /** Variable returns the variable name associated with the attribute. */
  public variable(): string {
    return this.variableValue;
  }

  /** QualifierPath returns the optional set of qualifying fields or indices applied to the variable. */
  public qualifierPath(): AttributeQualifier[] {
    return this.qualifierPathValue;
  }

  /** String returns the string representation of the Attribute. */
  public toString(): string {
    if (this.variableValue === "") {
      return "<unspecified>";
    }
    let out = this.variableValue;
    for (const qualifier of this.qualifierPathValue) {
      if (typeof qualifier === "boolean" || typeof qualifier === "number") {
        out += `[${qualifier}]`;
        continue;
      }
      if (typeof qualifier === "bigint") {
        out += `[${qualifier}u]`;
        continue;
      }
      out += /^[A-Za-z0-9_]+$/.test(qualifier) ? `.${qualifier}` : `[${JSON.stringify(qualifier)}]`;
    }
    return out.replace(/\[([0-9]+)n\]/g, "[$1]").replace(/\[([0-9]+)u\]/g, "[$1u]");
  }
}

const unspecifiedAttribute = new AttributeTrail("", []);

/**
 * Unknown collects expression ids which caused the current value to become unknown.
 */
export class Unknown implements Val {
  constructor(private readonly attributeTrailsValue = new Map<number, AttributeTrail[]>()) {}

  /** IDs returns the set of unknown expression ids contained by this value. */
  public ids(): number[] {
    return [...this.attributeTrailsValue.keys()].sort((left, right) => left - right);
  }

  /** GetAttributeTrails returns the attribute trails for a given expression id. */
  public getAttributeTrails(id: number): [AttributeTrail[] | undefined, boolean] {
    const trails = this.attributeTrailsValue.get(id);
    return [trails, trails !== undefined];
  }

  /** HasUnknownFunction returns whether any attribute trail is unspecified. */
  public hasUnknownFunction(): boolean {
    return [...this.attributeTrailsValue.values()].some((trails) =>
      trails.some((trail) => trail.variable() === ""),
    );
  }

  /** Contains returns true if the input unknown is a subset of the current unknown. */
  public contains(other: Unknown): boolean {
    for (const [id, otherTrails] of other.attributeTrailsValue) {
      const trails = this.attributeTrailsValue.get(id);
      if (!trails || trails.length !== otherTrails.length) {
        return false;
      }
      for (const otherTrail of otherTrails) {
        if (!trails.some((trail) => trail.equal(otherTrail))) {
          return false;
        }
      }
    }
    return true;
  }
  public convertToNative(): unknown {
    return this.value();
  }

  /** ConvertToType is an identity function since unknown values cannot be modified. */
  public convertToType(_: RefType): Val {
    return this;
  }

  /** Equal is an identity function since unknown values cannot be modified. */
  public equal(_: Val): Val {
    return this;
  }
  public toString(): string {
    return this.ids()
      .map((id) => {
        const trails = this.attributeTrailsValue.get(id)!;
        return `${trails.length === 1 ? trails[0] : `[${trails.join(" ")}]`} (${id})`;
      })
      .join(", ");
  }
  public type(): RefType {
    return UnknownType;
  }
  public value(): unknown {
    return this;
  }

  /** attributeTrails returns the underlying attribute trail map for internal merge helpers. */
  public attributeTrails(): Map<number, AttributeTrail[]> {
    return this.attributeTrailsValue;
  }
}

/**
 * Unknown creates a new unknown at a given expression id for an attribute.
 */
export function unknown(id: number, attr?: AttributeTrail): Unknown {
  return new Unknown(new Map([[id, [attr ?? unspecifiedAttribute]]]));
}

/**
 * IsUnknown returns whether the element ref.Val is an instance of Unknown.
 */
export function isUnknown(val: Val): boolean {
  return val instanceof Unknown;
}

/**
 * MaybeMergeUnknowns determines whether an input value and another, possibly nil, unknown will produce an unknown result.
 */
export function maybeMergeUnknowns(val: Val, unk?: Unknown): Unknown | undefined {
  if (!(val instanceof Unknown)) {
    return unk;
  }
  return mergeUnknowns(val, unk);
}

/**
 * MergeUnknowns combines two unknown values into a new unknown value.
 */
export function mergeUnknowns(unk1?: Unknown, unk2?: Unknown): Unknown | undefined {
  if (!unk1) {
    return unk2;
  }
  if (!unk2) {
    return unk1;
  }
  const out = new Map<number, AttributeTrail[]>();
  for (const [id, trails] of unk1.attributeTrails()) {
    out.set(id, [...trails]);
  }
  for (const [id, trails] of unk2.attributeTrails()) {
    const existing = out.get(id);
    if (!existing) {
      out.set(id, [...trails]);
      continue;
    }
    for (const trail of trails) {
      if (!existing.some((entry) => entry.equal(trail))) {
        existing.push(trail);
      }
    }
  }
  return new Unknown(out);
}

function qualifiersEqual(left: AttributeQualifier, right: AttributeQualifier): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left === "bigint" && typeof right === "bigint") {
    return left === right;
  }
  if (typeof left === "number" && typeof right === "bigint") {
    return Number.isInteger(left) && left >= 0 && BigInt(left) === right;
  }
  if (typeof left === "bigint" && typeof right === "number") {
    return Number.isInteger(right) && right >= 0 && left === BigInt(right);
  }
  return false;
}

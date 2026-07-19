import type { DescEnumValue } from "@bufbuild/protobuf";

/**
 * EnumValueDescription maps a fully-qualified enum value name to its numeric value.
 */
export class EnumValueDescription {
  constructor(
    private readonly enumValueName: string,
    private readonly desc: DescEnumValue,
  ) {}

  /** Name returns the fully-qualified identifier name for the enum value. */
  public name(): string {
    return this.enumValueName;
  }

  /** Value returns the (numeric) value of the enum. */
  public value(): number {
    return this.desc.number;
  }
}

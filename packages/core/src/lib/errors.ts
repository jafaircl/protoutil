/**
 * An error that indicates a value is out of range.
 */
export class OutOfRangeError extends Error {
  constructor(
    message: string,
    public readonly value: unknown,
    public readonly min: unknown,
    public readonly max: unknown
  ) {
    super(message);
    this.name = 'OutOfRangeError';
  }
}

/**
 * An error that indicates a value is not a valid value.
 */
export class InvalidValueError extends Error {
  constructor(message: string, public readonly value: unknown) {
    super(message);
    this.name = 'InvalidValueError';
  }
}

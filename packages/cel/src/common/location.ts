/**
 * Location interface to represent a location within Source.
 */
export interface Location {
  /** 1-based line number within source. */
  line(): number;
  /** 0-based column number within source. */
  column(): number;
}

/**
 * SourceLocation helper type to manually construct a location.
 */
export class SourceLocation implements Location {
  constructor(
    private readonly lineValue: number,
    private readonly columnValue: number,
  ) {}

  /**
   * Line returns the 1-based line of the location.
   */
  public line(): number {
    return this.lineValue;
  }

  /**
   * Column returns the 0-based column number of the location.
   */
  public column(): number {
    return this.columnValue;
  }
}

/**
 * NoLocation is a particular illegal location.
 */
export const NO_LOCATION: Location = new SourceLocation(-1, -1);

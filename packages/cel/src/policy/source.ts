import { type Location, NO_LOCATION, SourceLocation } from "../common/location.js";
import { type Source as CommonSource, stringSource } from "../common/source.js";

/**
 * byteSource converts a byte sequence and location description to a policy source.
 */
export function byteSource(contents: Uint8Array, location: string): Source {
  return source(new TextDecoder().decode(contents), location);
}

/**
 * source converts a string and location description to a policy source.
 */
export function source(contents: string, location: string): Source {
  return new Source(stringSource(contents, location));
}

/**
 * Source represents the contents of a single policy file.
 */
export class Source implements CommonSource {
  /** constructor wraps the common CEL source used by a policy. */
  public constructor(private readonly sourceValue: CommonSource) {}

  /** content returns the source contents. */
  public content(): string {
    return this.sourceValue.content();
  }

  /** description returns the source location description. */
  public description(): string {
    return this.sourceValue.description();
  }

  /** lineOffsets returns the source line offsets. */
  public lineOffsets(): number[] {
    return this.sourceValue.lineOffsets();
  }

  /** locationOffset translates a location to its source offset. */
  public locationOffset(location: Location): [number, boolean] {
    return this.sourceValue.locationOffset(location);
  }

  /** offsetLocation translates a source offset to its location. */
  public offsetLocation(offset: number): [Location, boolean] {
    return this.sourceValue.offsetLocation(offset);
  }

  /** location constructs a source location. */
  public location(line: number, column: number): Location {
    return this.sourceValue.location(line, column);
  }

  /** snippet returns the requested source line when present. */
  public snippet(line: number): [string, boolean] {
    return this.sourceValue.snippet(line);
  }

  /**
   * relative produces a RelativeSource object for content at an absolute
   * location within the parent source.
   */
  public relative(content: string, line: number, column: number): RelativeSource {
    return new RelativeSource({
      source: this,
      localSource: stringSource(content, this.description()),
      absoluteLocation: new SourceLocation(line, column),
    });
  }
}

/**
 * RelativeSourceOptions identifies an embedded source and its absolute origin.
 */
interface RelativeSourceOptions {
  /** source is the containing policy source. */
  source: CommonSource;
  /** localSource contains only the embedded CEL expression. */
  localSource: CommonSource;
  /** absoluteLocation is the embedded expression's origin. */
  absoluteLocation: Location;
}

/**
 * RelativeSource represents an embedded source element within a larger source.
 */
export class RelativeSource implements CommonSource {
  /** constructor configures an embedded policy source. */
  public constructor(private readonly options: RelativeSourceOptions) {}

  /** containingSource returns the complete policy source containing this expression. */
  public containingSource(): CommonSource {
    return this.options.source;
  }

  /** content returns the embedded source snippet. */
  public content(): string {
    return this.options.localSource.content();
  }

  /** description returns the containing source description. */
  public description(): string {
    return this.options.source.description();
  }

  /** lineOffsets returns line offsets for the containing source. */
  public lineOffsets(): number[] {
    return this.options.source.lineOffsets();
  }

  /** locationOffset translates an absolute location to a containing-source offset. */
  public locationOffset(location: Location): [number, boolean] {
    return this.options.source.locationOffset(location);
  }

  /**
   * offsetLocation returns the absolute location for a relative offset, if found.
   */
  public offsetLocation(offset: number): [Location, boolean] {
    const [absoluteOffset, found] = this.options.source.locationOffset(
      this.options.absoluteLocation,
    );
    if (!found) {
      return [NO_LOCATION, false];
    }
    return this.options.source.offsetLocation(absoluteOffset + offset);
  }

  /** location translates an embedded line and column to an absolute location. */
  public location(line: number, column: number): Location {
    const localOffset = this.options.localSource.locationOffset(new SourceLocation(line, column));
    if (!localOffset[1]) {
      return NO_LOCATION;
    }
    return this.offsetLocation(localOffset[0])[0];
  }

  /** snippet returns a line from the containing policy source. */
  public snippet(line: number): [string, boolean] {
    return this.options.source.snippet(line);
  }
}

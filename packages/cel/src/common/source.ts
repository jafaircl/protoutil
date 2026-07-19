import type { SourceInfo as ProtoSourceInfo } from "../gen/cel/expr/syntax_pb.js";
import { type Location, SourceLocation } from "./location.js";

/**
 * Source interface for filter source contents.
 */
export interface Source {
  /**
   * Content returns the source content represented as a string.
   * Example contents are the single file contents, textbox field,
   * or url parameter.
   */
  content(): string;

  /**
   * Description gives a brief description of the source.
   * Example descriptions are a file name or ui element.
   */
  description(): string;

  /**
   * LineOffsets gives the character offsets at which lines occur.
   * The zero-th entry should refer to the break between the first
   * and second line, or EOF if there is only one line of source.
   */
  lineOffsets(): number[];

  /**
   * LocationOffset translates a Location to an offset.
   * Given the line and column of the Location returns the
   * Location's character offset in the Source, and a bool
   * indicating whether the Location was found.
   */
  locationOffset(location: Location): [number, boolean];

  /**
   * OffsetLocation translates a character offset to a Location, or
   * false if the conversion was not feasible.
   */
  offsetLocation(offset: number): [Location, boolean];

  /**
   * Location takes an input line and column and produces a Location.
   * The default behavior is to treat the line and column as absolute,
   * but concrete derivations may use this method to convert a relative
   * line and column position into an absolute location.
   */
  location(line: number, column: number): Location;

  /**
   * Snippet returns a line of content and whether the line was found.
   */
  snippet(line: number): [string, boolean];
}

/**
 * The TextSource type implementation of the Source interface.
 */
class TextSource implements Source {
  constructor(
    private readonly text: string,
    private readonly label: string,
    private readonly offsets: number[],
  ) {}

  public content(): string {
    return this.text;
  }

  public description(): string {
    return this.label;
  }

  public lineOffsets(): number[] {
    return [...this.offsets];
  }

  public locationOffset(location: Location): [number, boolean] {
    const line = location.line();
    if (line < 1 || line > this.offsets.length) {
      return [-1, false];
    }
    const start = line === 1 ? 0 : (this.offsets[line - 2] ?? -1);
    if (start < 0) {
      return [-1, false];
    }
    return [start + location.column(), true];
  }

  public offsetLocation(offset: number): [Location, boolean] {
    if (offset < 0) {
      return [new SourceLocation(-1, -1), false];
    }
    let line = 1;
    let start = 0;
    for (const next of this.offsets) {
      if (next > offset) {
        break;
      }
      line += 1;
      start = next;
    }
    return [new SourceLocation(line, offset - start), true];
  }

  public location(line: number, column: number): Location {
    return new SourceLocation(line, column);
  }

  public snippet(line: number): [string, boolean] {
    if (line < 1 || line > this.offsets.length) {
      return ["", false];
    }
    const start = line === 1 ? 0 : (this.offsets[line - 2] ?? -1);
    if (start < 0) {
      return ["", false];
    }
    const end = this.offsets[line - 1] ?? this.text.length;
    const raw = this.text.slice(start, end);
    return [raw.endsWith("\n") ? raw.slice(0, -1) : raw, true];
  }
}

function countCodePoints(text: string): number {
  return Array.from(text).length;
}

/**
 * Computes CEL-style line offsets. The final entry is always EOF.
 */
export function computeLineOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  offsets.push(text.length + 1);
  return offsets;
}

/**
 * Creates a source from the default `<input>` description.
 */
export function textSource(text: string): Source {
  return stringSource(text, "<input>");
}

/**
 * Creates a source while enforcing a maximum code point count.
 */
export function textSourceWithLimit(text: string, limit: number): Source {
  return stringSourceWithLimit(text, "<input>", limit);
}

/**
 * Creates a source from content and a human-readable description.
 */
export function stringSource(contents: string, description: string): Source {
  // Compute line offsets up front as they are referred to frequently.
  return new TextSource(contents, description, computeLineOffsets(contents));
}

/**
 * Creates a source from content while enforcing a maximum code point count.
 */
export function stringSourceWithLimit(
  contents: string,
  description: string,
  limit: number,
): Source {
  if (limit >= 0 && countCodePoints(contents) > limit) {
    throw new Error(`size exceeds limit: ${countCodePoints(contents)} > ${limit}`);
  }
  return stringSource(contents, description);
}

/**
 * Creates a source backed only by source-info metadata.
 */
export function infoSource(info?: ProtoSourceInfo): Source {
  return new TextSource("", info?.location ?? "", [...(info?.lineOffsets ?? [])]);
}

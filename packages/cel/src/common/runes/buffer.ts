/**
 * Buffer is an interface for accessing a contiguous array of code points.
 */
export interface Buffer {
  get(i: number): number;
  slice(i: number, j: number): string;
  len(): number;
}

function panicBounds(): never {
  throw new Error("slice index out of bounds");
}

function validateIndex(length: number, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    panicBounds();
  }
}

function validateSlice(length: number, i: number, j: number): void {
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || i > j || j > length) {
    panicBounds();
  }
}

export class EmptyBuffer implements Buffer {
  public get(i: number): number {
    validateIndex(0, i);
    return panicBounds();
  }

  public slice(i: number, j: number): string {
    if (i !== 0 || i !== j) {
      panicBounds();
    }
    return "";
  }

  public len(): number {
    return 0;
  }
}

export class AsciiBuffer implements Buffer {
  public constructor(private readonly arr: Uint8Array) {}

  public get(i: number): number {
    validateIndex(this.arr.length, i);
    return this.arr[i]!;
  }

  public slice(i: number, j: number): string {
    validateSlice(this.arr.length, i, j);
    return String.fromCharCode(...this.arr.slice(i, j));
  }

  public len(): number {
    return this.arr.length;
  }
}

export class BasicBuffer implements Buffer {
  public constructor(private readonly arr: Uint16Array) {}

  public get(i: number): number {
    validateIndex(this.arr.length, i);
    return this.arr[i]!;
  }

  public slice(i: number, j: number): string {
    validateSlice(this.arr.length, i, j);
    let str = "";
    for (; i < j; i += 1) {
      str += String.fromCharCode(this.arr[i]!);
    }
    return str;
  }

  public len(): number {
    return this.arr.length;
  }
}

export class SupplementalBuffer implements Buffer {
  public constructor(private readonly arr: number[]) {}

  public get(i: number): number {
    validateIndex(this.arr.length, i);
    return this.arr[i]!;
  }

  public slice(i: number, j: number): string {
    validateSlice(this.arr.length, i, j);
    return String.fromCodePoint(...this.arr.slice(i, j));
  }

  public len(): number {
    return this.arr.length;
  }
}

const nilBuffer = new EmptyBuffer();

// SizeLimitError indicates that the input exceeded the configured code point limit.
export class SizeLimitError extends Error {
  public constructor(
    public readonly size: number,
    public readonly limit: number,
  ) {
    super(`expression code point size exceeds limit: size: ${size}, limit ${limit}`);
  }
}

// Buffer returns an efficient implementation of Buffer for the given text based on the ranges of
// the encoded code points contained within.
export function bufferFromString(data: string): Buffer {
  const [buf] = bufferWithLimit(data, false, -1);
  return buf;
}

// BufferAndLineOffsets returns an efficient implementation of Buffer for the given text based on
// the ranges of the encoded code points contained within, as well as returning the line offsets.
export function bufferAndLineOffsets(data: string): [Buffer, number[]] {
  const [buf, offs] = bufferWithLimit(data, true, -1);
  return [buf, offs];
}

// BufferAndLineOffsetsWithLimit returns an efficient implementation of Buffer for the given text
// and enforces a code point limit while constructing the buffer.
export function bufferAndLineOffsetsWithLimit(
  data: string,
  limit: number,
): [Buffer, number[], Error | undefined] {
  if (limit < 0 || data.length <= limit) {
    return bufferWithLimit(data, true, -1);
  }
  return bufferWithLimit(data, true, limit);
}

function countRemainingCodePoints(data: string, idx: number, count: number): number {
  while (idx < data.length) {
    const r = data.codePointAt(idx)!;
    idx += r > 0xffff ? 2 : 1;
    count += 1;
  }
  return count;
}

function bufferWithLimit(
  data: string,
  lines: boolean,
  limit: number,
): [Buffer, number[], Error | undefined] {
  if (data.length === 0) {
    return [nilBuffer, [0], undefined];
  }
  if (limit >= 0 && data.length > limit) {
    const size = countRemainingCodePoints(data, 0, 0);
    if (size > limit) {
      return [nilBuffer, [], new SizeLimitError(size, limit)];
    }
  }

  // The resulting buffers store one element per code point, so the worst case
  // element count never exceeds len(data).
  let idx = 0;
  let off = 0;
  let buf8: number[] = [];
  let buf16: number[] | undefined;
  let buf32: number[] | undefined;
  const offs: number[] = [];

  while (idx < data.length) {
    const r = data.codePointAt(idx)!;
    idx += r > 0xffff ? 2 : 1;
    if (lines && r === 0x0a) {
      offs.push(off + 1);
    }
    if (r < 0x80) {
      buf8.push(r);
      off += 1;
      continue;
    }
    if (r <= 0xffff) {
      buf16 = new Array<number>(buf8.length);
      for (let i = 0; i < buf8.length; i += 1) {
        buf16[i] = buf8[i]!;
      }
      buf8 = [];
      buf16.push(r);
      off += 1;
      break;
    }
    buf32 = new Array<number>(buf8.length);
    for (let i = 0; i < buf8.length; i += 1) {
      buf32[i] = buf8[i]!;
    }
    buf8 = [];
    buf32.push(r);
    off += 1;
    break;
  }
  if (idx >= data.length && buf16 === undefined && buf32 === undefined) {
    if (lines) {
      offs.push(off + 1);
    }
    return [new AsciiBuffer(Uint8Array.from(buf8)), offs, undefined];
  }

  while (buf16 !== undefined && idx < data.length) {
    const r = data.codePointAt(idx)!;
    idx += r > 0xffff ? 2 : 1;
    if (lines && r === 0x0a) {
      offs.push(off + 1);
    }
    if (r <= 0xffff) {
      buf16.push(r);
      off += 1;
      continue;
    }
    buf32 = new Array<number>(buf16.length);
    for (let i = 0; i < buf16.length; i += 1) {
      buf32[i] = buf16[i]!;
    }
    buf16 = undefined;
    buf32.push(r);
    off += 1;
    break;
  }
  if (buf16 !== undefined) {
    if (lines) {
      offs.push(off + 1);
    }
    return [new BasicBuffer(Uint16Array.from(buf16)), offs, undefined];
  }

  if (buf32 === undefined) {
    buf32 = [];
  }
  while (idx < data.length) {
    const r = data.codePointAt(idx)!;
    idx += r > 0xffff ? 2 : 1;
    if (lines && r === 0x0a) {
      offs.push(off + 1);
    }
    buf32.push(r);
    off += 1;
  }
  if (lines) {
    offs.push(off + 1);
  }
  return [new SupplementalBuffer(buf32), offs, undefined];
}

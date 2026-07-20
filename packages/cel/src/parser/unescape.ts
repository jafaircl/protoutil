/**
 * newlineNormalizer canonicalizes raw carriage-return variants before unescaping.
 */
const newlineNormalizer = new Map([
  ["\r\n", "\n"],
  ["\r", "\n"],
]);

/**
 * Unescapes a CEL string or bytes literal body.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: cel-go parity
export function unescape(value: string, isBytes: boolean): string {
  for (const [from, to] of newlineNormalizer) {
    value = value.split(from).join(to);
  }
  let n = value.length;
  if (n < 2) {
    throw new Error("unable to unescape string");
  }

  let isRawLiteral = false;
  if (value[0] === "r" || value[0] === "R") {
    value = value.slice(1);
    n = value.length;
    isRawLiteral = true;
  }

  if (value[0] !== value[n - 1] || (value[0] !== `"` && value[0] !== `'`)) {
    throw new Error("unable to unescape string");
  }

  if (n >= 6) {
    // Triple-quoted CEL strings are normalized into a single-quoted form before escape decoding.
    if (value.startsWith(`'''`)) {
      if (!value.endsWith(`'''`)) {
        throw new Error("unable to unescape string");
      }
      value = `"${value.slice(3, n - 3)}"`;
    } else if (value.startsWith(`"""`)) {
      if (!value.endsWith(`"""`)) {
        throw new Error("unable to unescape string");
      }
      value = `"${value.slice(3, n - 3)}"`;
    }
    n = value.length;
  }

  value = value.slice(1, n - 1);
  if (isRawLiteral || !value.includes("\\")) {
    return value;
  }

  let out = "";
  const bytes: number[] = [];
  let cursor = value;
  while (cursor.length > 0) {
    const [rune, encode, tail] = unescapeChar(cursor, isBytes);
    cursor = tail;
    if (isBytes) {
      // Bytes literals keep the low 8 bits of each decoded escape like cel-go does.
      bytes.push(rune & 0xff);
      continue;
    }
    if (!encode) {
      out += String.fromCharCode(rune);
    } else {
      out += String.fromCodePoint(rune);
    }
  }
  return isBytes ? new TextDecoder().decode(new Uint8Array(bytes)) : out;
}

/**
 * unescapeChar decodes a single escaped or literal rune from the remaining input
 * and returns the following tuple: the decoded rune, whether the rune should be
 * encoded as UTF-8, and the remaining input.
 */
function unescapeChar(source: string, isBytes: boolean): [number, boolean, string] {
  const first = source[0]!;
  if (first !== "\\") {
    const point = source.codePointAt(0)!;
    const width = point > 0xffff ? 2 : 1;
    return [point, point > 0x7f, source.slice(width)];
  }
  if (source.length <= 1) {
    throw new Error(String.raw`unable to unescape string, found '\' as last character`);
  }
  const kind = source[1]!;
  let tail = source.slice(2);
  switch (kind) {
    case "a":
      return [0x07, false, tail];
    case "b":
      return [0x08, false, tail];
    case "f":
      return [0x0c, false, tail];
    case "n":
      return [0x0a, false, tail];
    case "r":
      return [0x0d, false, tail];
    case "t":
      return [0x09, false, tail];
    case "v":
      return [0x0b, false, tail];
    case "\\":
    case "'":
    case `"`:
    case "`":
    case "?":
      return [kind.codePointAt(0)!, false, tail];
    case "x":
    case "X":
    case "u":
    case "U": {
      let width = 0;
      let encode = true;
      // Hex escapes are bytes-sized in bytes literals, while unicode escapes are string-only.
      if (kind === "x" || kind === "X") {
        width = 2;
        encode = !isBytes;
      } else if (kind === "u") {
        width = 4;
        if (isBytes) {
          throw new Error("unable to unescape string");
        }
      } else {
        width = 8;
        if (isBytes) {
          throw new Error("unable to unescape string");
        }
      }
      if (tail.length < width) {
        throw new Error("unable to unescape string");
      }
      let value = 0;
      for (let i = 0; i < width; i += 1) {
        const digit = hexValue(tail[i]!);
        if (digit < 0) {
          throw new Error("unable to unescape string");
        }
        value = (value << 4) | digit;
      }
      tail = tail.slice(width);
      if (!isBytes && !Number.isInteger(value)) {
        throw new Error("invalid unicode code point");
      }
      if (!isBytes && (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff))) {
        throw new Error("invalid unicode code point");
      }
      return [value, encode, tail];
    }
    case "0":
    case "1":
    case "2":
    case "3": {
      if (tail.length < 2) {
        throw new Error("unable to unescape octal sequence in string");
      }
      let value = Number(kind);
      for (let i = 0; i < 2; i += 1) {
        const digit = tail.charCodeAt(i) - 48;
        if (digit < 0 || digit > 7) {
          throw new Error("unable to unescape octal sequence in string");
        }
        value = value * 8 + digit;
      }
      if (!isBytes && (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff))) {
        throw new Error("invalid unicode code point");
      }
      return [value, !isBytes, tail.slice(2)];
    }
    default:
      throw new Error("unable to unescape string");
  }
}

/**
 * hexValue converts a hexadecimal digit into its numeric value.
 */
function hexValue(char: string): number {
  if (char >= "0" && char <= "9") {
    return char.charCodeAt(0) - 48;
  }
  if (char >= "a" && char <= "f") {
    return char.charCodeAt(0) - 87;
  }
  if (char >= "A" && char <= "F") {
    return char.charCodeAt(0) - 55;
  }
  return -1;
}

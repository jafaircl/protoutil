/**
 * Token kinds produced by the AIP-160 lexer.
 */
export enum TokenType {
  TEXT,
  STRING,
  LPAREN,
  RPAREN,
  DOT,
  COMMA,
  MINUS,
  LESS_EQUALS,
  LESS_THAN,
  GREATER_EQUALS,
  GREATER_THAN,
  NOT_EQUALS,
  EQUALS,
  HAS,
  AND,
  OR,
  NOT,
  LBRACE,
  RBRACE,
  WS,
  EOF,
  UNTERMINATED_STRING,
}

/**
 * A single lexer token with its original source offset.
 */
export interface Token {
  type: TokenType;
  value: string;
  offset: number;
}

const KEYWORDS: Record<string, TokenType> = {
  AND: TokenType.AND,
  OR: TokenType.OR,
  NOT: TokenType.NOT,
};

/**
 * Tokenizes an AIP-160 filter string.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const start = i;
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      while (i < input.length && /\s/.test(input[i])) i++;
      tokens.push({ type: TokenType.WS, value: input.slice(start, i), offset: start });
      continue;
    }

    // Two-char operators
    if (ch === "<" && input[i + 1] === "=") {
      tokens.push({ type: TokenType.LESS_EQUALS, value: "<=", offset: i });
      i += 2;
      continue;
    }
    if (ch === ">" && input[i + 1] === "=") {
      tokens.push({ type: TokenType.GREATER_EQUALS, value: ">=", offset: i });
      i += 2;
      continue;
    }
    if (ch === "!" && input[i + 1] === "=") {
      tokens.push({ type: TokenType.NOT_EQUALS, value: "!=", offset: i });
      i += 2;
      continue;
    }

    // Single-char operators
    if (ch === "(") {
      tokens.push({ type: TokenType.LPAREN, value: "(", offset: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: TokenType.RPAREN, value: ")", offset: i });
      i++;
      continue;
    }
    if (ch === ".") {
      tokens.push({ type: TokenType.DOT, value: ".", offset: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: TokenType.COMMA, value: ",", offset: i });
      i++;
      continue;
    }
    if (ch === "-") {
      tokens.push({ type: TokenType.MINUS, value: "-", offset: i });
      i++;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: TokenType.LESS_THAN, value: "<", offset: i });
      i++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ type: TokenType.GREATER_THAN, value: ">", offset: i });
      i++;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: TokenType.EQUALS, value: "=", offset: i });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: TokenType.HAS, value: ":", offset: i });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: TokenType.LBRACE, value: "{", offset: i });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: TokenType.RBRACE, value: "}", offset: i });
      i++;
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          const esc = input[i + 1];
          switch (esc) {
            case "n":
              str += "\n";
              break;
            case "t":
              str += "\t";
              break;
            case "r":
              str += "\r";
              break;
            case "\\":
              str += "\\";
              break;
            case '"':
              str += '"';
              break;
            case "'":
              str += "'";
              break;
            default:
              str += `\\${esc}`;
          }
          i += 2;
        } else {
          str += input[i++];
        }
      }
      if (i >= input.length) {
        tokens.push({ type: TokenType.UNTERMINATED_STRING, value: str, offset: start });
        continue;
      }
      i++;
      tokens.push({ type: TokenType.STRING, value: str, offset: start });
      continue;
    }

    // Backtick raw identifier
    if (ch === "`") {
      i++;
      let str = "";
      while (i < input.length && input[i] !== "`") str += input[i++];
      if (i < input.length) i++;
      tokens.push({ type: TokenType.TEXT, value: str, offset: start });
      continue;
    }

    // TEXT token (identifiers, numbers)
    if (isTextChar(ch)) {
      while (i < input.length && isTextChar(input[i])) i++;
      let word = input.slice(start, i);

      // Float lookahead: "123" followed by "." then digits/e
      if (/^\d+$/.test(word) && i < input.length && input[i] === ".") {
        const afterDot = i + 1;
        if (afterDot < input.length && /[\deE]/.test(input[afterDot])) {
          i++; // consume the DOT
          while (i < input.length && /[0-9eE+-]/.test(input[i])) i++;
          word = input.slice(start, i);
        }
      }

      // Duration suffix: consume trailing duration unit(s) after a numeric token.
      // Handles simple (20s, 1.5h) and compound (1h30m, 1h30m15s) durations.
      if (/^\d/.test(word) && i < input.length && isDurationPrefix(input[i])) {
        i = scanDurationSuffix(input, i);
        word = input.slice(start, i);
      }

      // Timestamp lookahead: 4-digit year followed by "-" suggests RFC-3339.
      // Consume the full timestamp including non-text chars (-, :, +).
      if (/^\d{4}$/.test(word) && i < input.length && input[i] === "-") {
        const tsMatch = input
          .slice(start)
          .match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})/);
        if (tsMatch) {
          i = start + tsMatch[0].length;
          word = tsMatch[0];
        }
      }

      const kwType = KEYWORDS[word];
      tokens.push({
        type: kwType !== undefined ? kwType : TokenType.TEXT,
        value: word,
        offset: start,
      });
      continue;
    }

    // Skip unknown chars
    i++;
  }

  tokens.push({ type: TokenType.EOF, value: "", offset: input.length });
  return tokens;
}

function isTextChar(ch: string): boolean {
  return !/[\s.,()\-<>=!:"'`{}]/.test(ch);
}

function isDurationPrefix(ch: string): boolean {
  return ch === "h" || ch === "m" || ch === "s" || ch === "n" || ch === "u";
}

/**
 * Starting from position `i` (which points at a duration prefix char),
 * consume duration suffix characters. Handles compound durations like
 * `1h30m15s` and multi-char units like `ms`, `us`, `ns`.
 */
function scanDurationSuffix(input: string, i: number): number {
  // Consume the first unit suffix
  i = consumeDurationUnit(input, i);
  // Compound durations: after a unit, digits may follow for the next component
  while (i < input.length && /\d/.test(input[i])) {
    // Consume the digits
    while (i < input.length && /[\d.]/.test(input[i])) i++;
    // Must be followed by a duration prefix
    if (i < input.length && isDurationPrefix(input[i])) {
      i = consumeDurationUnit(input, i);
    } else {
      break;
    }
  }
  return i;
}

/** Consume a single duration unit: h, m, s, ms, us, ns */
function consumeDurationUnit(input: string, i: number): number {
  const ch = input[i];
  if (ch === "h" || ch === "s") {
    return i + 1;
  }
  if (ch === "m" || ch === "n" || ch === "u") {
    // Check for two-char unit: ms, ns, us
    if (i + 1 < input.length && input[i + 1] === "s") {
      return i + 2;
    }
    // Standalone m (minutes)
    if (ch === "m") return i + 1;
    // Standalone n or u is not valid but let the parser reject it
    return i + 1;
  }
  return i;
}

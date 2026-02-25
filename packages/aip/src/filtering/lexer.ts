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
  WS,
  EOF,
  UNTERMINATED_STRING,
}

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
  return !/[\s.,()\-<>=!:"'`]/.test(ch);
}

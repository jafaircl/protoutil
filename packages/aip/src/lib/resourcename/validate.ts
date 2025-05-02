import { Scanner } from './scanner.js';

/**
 * Assert that a resource name conforms to the restrictions outlined in AIP-122.
 * See: https://google.aip.dev/122
 */
export function assertValidResourceName(name: string) {
  if (name === '') {
    throw new Error('empty');
  }
  let i = 0;
  const scanner = new Scanner(name);
  while (scanner.scan()) {
    i++;
    const segment = scanner.segment();
    if (segment.value === '') {
      throw new Error(`segment ${i} is empty`);
    } else if (segment.isWildcard()) {
      continue;
    } else if (segment.isVariable()) {
      throw new Error(
        `segment '${segment.value}': valid resource names must not contain variables`
      );
    } else if (!isDomainName(segment.value)) {
      throw new Error(`segment '${segment.value}': not a valid DNS name`);
    }
  }
  if (scanner.full() && !isDomainName(scanner.serviceName())) {
    throw new Error(`service '${scanner.segment().value}': not a valid DNS name`);
  }
}

/**
 * Validate that a resource name conforms to the restrictions outlined in AIP-122.
 * See: https://google.aip.dev/122
 */
export function isValidResourceName(name: string): boolean {
  try {
    assertValidResourceName(name);
  } catch {
    return false;
  }
  return true;
}

/**
 * Assert that a resource name pattern conforms to the restrictions outlined in AIP-122.
 * See: https://google.aip.dev/122
 */
export function assertValidResourcePattern(pattern: string) {
  if (pattern === '') {
    throw new Error('empty');
  }
  let i = 0;
  const scanner = new Scanner(pattern);
  while (scanner.scan()) {
    i++;
    const segment = scanner.segment();
    if (segment.value === '') {
      throw new Error(`segment ${i} is empty`);
    } else if (segment.isWildcard()) {
      throw new Error(`segment '${i}': wildcards not allowed in patterns`);
    } else if (segment.isVariable()) {
      if (segment.literal().value === '') {
        throw new Error(`segment '${i}': missing variable name`);
      }
      if (!isSnakeCase(segment.literal().value)) {
        throw new Error(`segment '${i}': must be valid snake case`);
      }
    } else if (!isDomainName(segment.value)) {
      throw new Error(`segment '${segment.value}': not a valid DNS name`);
    }
  }
  if (scanner.full()) {
    if (scanner.serviceName() !== '') {
      throw new Error(`patterns can not be full resource names`);
    }
  }
}

/**
 * Validate that a resource name pattern conforms to the restrictions outlined in AIP-122.
 * See: https://google.aip.dev/122
 */
export function isValidResourcePattern(pattern: string): boolean {
  try {
    assertValidResourcePattern(pattern);
  } catch {
    return false;
  }
  return true;
}

function isDomainName(s: string): boolean {
  // See RFC 1035, RFC 3696.
  // Presentation format has dots before every label except the first, and the
  // terminal empty label is optional here because we assume fully-qualified
  // (absolute) input. We must therefore reserve space for the first and last
  // labels' length octets in wire format, where they are necessary and the
  // maximum total length is 255.
  // So our _effective_ maximum is 253, but 254 is not rejected if the last
  // character is a dot.
  const l = s.length;
  if (l === 0 || l > 254 || (l === 254 && s[l - 1] !== '.')) {
    return false;
  }
  let last = '.';
  let partlen = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    switch (true) {
      default:
        return false;
      case ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') || c === '_' || ('0' <= c && c <= '9'):
        partlen++;
        break;
      case c === '-':
        // Byte before dash cannot be dot.
        if (last === '.') {
          return false;
        }
        partlen++;
        break;
      case c === '.':
        // Byte before dot cannot be dot, dash.
        if (last === '.' || last === '-') {
          return false;
        }
        if (partlen > 63 || partlen === 0) {
          return false;
        }
        partlen = 0;
        break;
    }
    last = c;
  }
  if (last === '-' || partlen > 63) {
    return false;
  }
  return true;
}

function isSnakeCase(str: string) {
  return /^[a-z_][a-z0-9_]*[a-z0-9]$|^[a-z]$/.test(str);
}

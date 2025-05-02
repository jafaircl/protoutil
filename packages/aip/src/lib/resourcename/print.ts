import { Scanner } from './scanner.js';

/**
 * printResourceName formats resource name variables according to a pattern and returns the resulting string.
 */
export function printResourceName(pattern: string, variables: Record<string, string>) {
  let result = '';
  const patternScanner = new Scanner(pattern);
  while (patternScanner.scan()) {
    const segment = patternScanner.segment();
    if (segment.isVariable()) {
      result += variables[segment.literal().value] ?? '';
    } else {
      result += segment.literal().value;
    }
    result += '/';
  }
  if (result[result.length - 1] === '/') {
    result = result.slice(0, -1);
  }
  return result;
}

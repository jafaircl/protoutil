import { Scanner } from './scanner.js';

/**
 * scanResourceName scans a resource name, storing segments into an object with keys
 * determined by the provided pattern.
 */
export function scanResourceName(name: string, pattern: string) {
  const nameScanner = new Scanner(name);
  const patternScanner = new Scanner(pattern);
  const variables: Record<string, string> = {};
  while (patternScanner.scan()) {
    if (patternScanner.full()) {
      throw new Error('invalid pattern');
    }
    if (!nameScanner.scan()) {
      throw new Error(`segment ${patternScanner.segment().value}: EOF`);
    }
    const nameSegment = nameScanner.segment();
    const patternSegment = patternScanner.segment();
    if (!patternSegment.isVariable()) {
      if (patternSegment.literal().value !== nameSegment.literal().value) {
        throw new Error(`segment ${patternSegment.value}: got ${nameSegment.value}`);
      }
      continue;
    }
    variables[patternSegment.literal().value] = nameSegment.literal().value;
  }
  if (nameScanner.scan()) {
    throw new Error('got trailing segments in name');
  }
  return variables;
}

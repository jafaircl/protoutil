import { Scanner } from './scanner.js';

/**
 * matchesResourcePattern reports whether the specified resource name matches the specified resource name pattern.
 */
export function matchesResourcePattern(pattern: string, name: string) {
  const nameScanner = new Scanner(name);
  const patternScanner = new Scanner(pattern);
  while (patternScanner.scan()) {
    if (!nameScanner.scan()) {
      return false;
    }
    const nameSegment = nameScanner.segment();
    if (nameSegment.isVariable()) {
      return false;
    }
    const patternSegment = patternScanner.segment();
    if (patternSegment.isWildcard()) {
      return false; // edge case - wildcard not allowed in patterns
    }
    if (patternSegment.isVariable()) {
      if (nameSegment.value === '') {
        return false;
      }
    } else if (nameSegment.value !== patternSegment.value) {
      return false;
    }
  }
  if (
    nameScanner.scan() || // name has more segments than pattern, no match
    patternScanner.segment().value === '' || // edge case - empty pattern never matches
    patternScanner.full() // edge case - full resource name not allowed in patterns)
  ) {
    return false;
  }
  return true;
}

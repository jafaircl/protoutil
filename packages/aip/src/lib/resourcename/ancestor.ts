import { Scanner } from './scanner.js';

/**
 * resourceNameAncestor extracts an ancestor from the provided name, using a pattern for the ancestor.
 */
export function resourceNameAncestor(name: string, pattern: string) {
  if (name === '' || pattern === '') {
    return '';
  }
  const nameScanner = new Scanner(name);
  const patternScanner = new Scanner(pattern);
  while (patternScanner.scan()) {
    if (!nameScanner.scan()) {
      return '';
    }
    const segment = patternScanner.segment();
    if (segment.isWildcard()) {
      return ''; // wildcards not supported in patterns
    }
    if (!segment.isVariable() && segment.value !== nameScanner.segment().value) {
      return ''; // not a match
    }
  }
  return name.substring(0, nameScanner.end());
}

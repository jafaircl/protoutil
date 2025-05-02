import { Scanner } from './scanner.js';

// Wildcard is the resource name wildcard character "-".
export const Wildcard = '-';

/**
 * ContainsWildcard reports whether the specified resource name contains any wildcard segments.
 */
export function containsWildcard(name: string) {
  const scanner = new Scanner(name);
  while (scanner.scan()) {
    if (scanner.segment().isWildcard()) {
      return true;
    }
  }
  return false;
}

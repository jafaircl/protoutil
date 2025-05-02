import { Scanner } from './scanner.js';

/**
 * resourceNameHasParent tests whether name has the specified parent. Wildcard segments (-) are considered.
 * Resource names without revisions are considered parents of the same resource name with a revision.
 */
export function resourceNameHasParent(name: string, parent: string) {
  if (name === '' || parent === '' || name === parent) {
    return false;
  }
  const parentScanner = new Scanner(parent);
  const nameScanner = new Scanner(name);
  while (parentScanner.scan()) {
    if (!nameScanner.scan()) {
      return false;
    }
    if (parentScanner.segment().isWildcard()) {
      continue;
    }
    // Special-case: Identical resource IDs without revision are parents of revisioned resource IDs.
    if (
      nameScanner.segment().literal().hasRevision() &&
      !parentScanner.segment().literal().hasRevision() &&
      nameScanner.segment().literal().resourceId() == parentScanner.segment().literal().resourceId()
    ) {
      continue;
    }
    if (parentScanner.segment().value != nameScanner.segment().value) {
      return false;
    }
  }
  if (parentScanner.full() && nameScanner.full()) {
    return parentScanner.serviceName() == nameScanner.serviceName();
  }
  return true;
}

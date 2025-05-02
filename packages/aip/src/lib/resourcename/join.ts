import { Scanner } from './scanner.js';

/**
 * joinResourceNames combines resource names, separating them by slashes.
 */
export function joinResourceNames(...elems: string[]) {
  const segments: string[] = [];
  for (let i = 0; i < elems.length; i++) {
    const scanner = new Scanner(elems[i]);

    while (scanner.scan()) {
      if (i === 0 && segments.length === 0 && scanner.full()) {
        segments.push(`//${scanner.serviceName()}`);
      }

      const segment = scanner.segment();
      if (segment.value === '') {
        continue;
      }
      segments.push(segment.value);
    }
  }

  if (segments.length === 0) {
    return '/';
  }

  return segments.join('/');
}

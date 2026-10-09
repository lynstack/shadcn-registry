const leftFirst = -1;
const rightFirst = 1;
const same = 0;

/**
 * Orders two strings by their UTF-16 code units, as `toSorted()` does by
 * default. Unlike `localeCompare`, whose order follows the locale of the
 * process, it orders the same on every machine.
 */
function compareText(left: string, right: string): number {
  if (left === right) {
    return same;
  }
  return left < right ? leftFirst : rightFirst;
}

/** Each value once, sorted. */
function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].toSorted();
}

export { compareText, sorted };

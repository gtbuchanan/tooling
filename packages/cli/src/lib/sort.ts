/**
 * Locale-aware string comparator for `Array#toSorted`/`Array#sort`.
 *
 * Centralizes the `localeCompare` callback so sort sites don't each
 * inline (and re-bikeshed) the same comparator.
 */
export const localeComparer = (left: string, right: string): number =>
  left.localeCompare(right);

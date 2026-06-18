/**
 * Locale-aware string comparator for `Array#toSorted`/`Array#sort`.
 *
 * Centralizes the `localeCompare` callback so sort sites don't each
 * inline (and re-bikeshed) the same comparator. The locale is pinned to
 * `en` so generated, drift-checked output sorts identically regardless of
 * the host's default locale (CI, contributors, etc.).
 */
export const localeComparer = (left: string, right: string): number =>
  left.localeCompare(right, 'en');

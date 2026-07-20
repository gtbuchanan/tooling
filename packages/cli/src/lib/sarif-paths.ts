import path from 'node:path';

/**
 * SARIF artifact layout under each lint cwd. Reporters (any tool) drop
 * `<tool>.sarif` files into `dist/sarif/`; the compare pairs each with
 * `dist/sarif/base/<tool>.sarif` by filename and writes match results
 * to `dist/sarif/matched/<tool>.sarif`. The stamp lives only at the
 * workspace root and records the merge-base SHA the on-disk baselines
 * were produced from, letting `--base` skip production when current —
 * locally across repeat runs, and in CI via a cache keyed on that SHA.
 *
 * Kept dependency-free: the ESLint formatter imports this from inside
 * the ESLint process.
 */
export const sarifPaths = {
  base: path.join('dist', 'sarif', 'base'),
  dir: path.join('dist', 'sarif'),
  matched: path.join('dist', 'sarif', 'matched'),
  stamp: path.join('dist', 'sarif', 'base.ref'),
} as const;

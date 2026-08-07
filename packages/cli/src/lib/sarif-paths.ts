/**
 * SARIF artifact layout under each lint cwd. Reporters (any tool) drop
 * `<tool>.sarif` files into `dist/sarif/`; the compare pairs each with
 * `dist/sarif/base/<tool>.sarif` by filename and writes match results
 * to `dist/sarif/matched/<tool>.sarif`. The stamp lives only at the
 * workspace root and records the merge-base SHA the on-disk baselines
 * were produced from, letting `--base` skip production when current —
 * locally across repeat runs, and in CI via a cache keyed on that SHA.
 *
 * POSIX-form segments: usable verbatim as turbo.json globs, and
 * `node:fs` accepts forward slashes on every platform.
 */
const dir = 'dist/sarif';

/** SARIF artifact paths relative to the lint cwd. */
export const sarifPaths = {
  base: `${dir}/base`,
  dir,
  matched: `${dir}/matched`,
  stamp: `${dir}/base.ref`,
} as const;

/** SARIF log path a tool's reporter writes, relative to the lint cwd. */
export const sarifLogPath = (tool: string): string => `${dir}/${tool}.sarif`;

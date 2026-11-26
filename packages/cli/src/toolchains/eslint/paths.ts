import { fileURLToPath } from 'node:url';
import type { Report } from '#src/tasks/leaf.js';

/**
 * The absolute path of gtb's ESLint formatter, which `lint:eslint` passes to
 * `--format`. Resolved rather than imported: the formatter imports `eslint`,
 * an optional peer, so only the ESLint process loading it may import it.
 */
export const formatterPath = fileURLToPath(
  import.meta.resolve('#src/toolchains/eslint/formatter.js'),
);

/*
 * Where the ESLint leaf writes, relative to the directory it lints. Each path
 * is read by the command writing it, the turbo task caching it and the report
 * declaring it, and a copy drifting from the others fails quietly: turbo
 * caches nothing, or a reader finds no file.
 */

/**
 * ESLint's cache.
 */
export const eslintCache = 'dist/.eslintcache';

/**
 * The SARIF log of ESLint's findings.
 */
export const findingsLog = 'dist/findings/eslint.sarif';

/**
 * The findings log as a report another toolchain can read.
 */
export const findingsReport: Report = { format: 'sarif', kind: 'findings', path: findingsLog };

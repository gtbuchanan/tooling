import type { Report } from '#src/tasks/leaf.js';

/*
 * Where the Vitest leaves write. Each path is read by the command writing it,
 * the turbo task caching it and the report declaring it, and a copy drifting
 * from the others fails quietly: turbo caches nothing, or the upload finds no
 * file and skips.
 */

const coverageRoot = 'dist/coverage/vitest';
const resultsRoot = 'dist/test-results/vitest';

/**
 * The directory holding the fast and slow runs' blobs, which the merge reads.
 */
export const mergeBlobDir = `${resultsRoot}/merge`;

/**
 * Each run's blob report.
 */
export const blobFile = {
  e2e: `${resultsRoot}/blob-e2e.json`,
  fast: `${mergeBlobDir}/blob-fast.json`,
  slow: `${mergeBlobDir}/blob-slow.json`,
} as const;

/**
 * Each run's coverage directory.
 */
export const coverageDir = {
  fast: `${coverageRoot}/fast`,
  merged: `${coverageRoot}/merged`,
  slow: `${coverageRoot}/slow`,
} as const;

/**
 * The lcov report Vitest writes into a coverage directory.
 */
export const lcovReport = (dir: string): Report =>
  ({ format: 'lcov', kind: 'coverage', path: `${dir}/lcov.info` });

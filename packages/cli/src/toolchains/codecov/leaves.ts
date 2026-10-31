import type { Leaf } from '#src/tasks/leaf.js';

/**
 * Uploads a package's coverage report to Codecov.
 *
 * No dependsOn — CI downloads coverage artifacts before running.
 *
 * Uncached on purpose. Caching on lcov content skipped the upload for every
 * package whose coverage hadn't moved, which left Codecov with no report for
 * that commit and therefore no commit status — and a required status check
 * that never reports blocks a pull request permanently. Uploading every time
 * is what makes the Codecov statuses dependable enough to gate on; the cost
 * is one CLI invocation per package per run.
 */
export const coverageCodecovUploadLeaf: Leaf = {
  appliesTo: pkg => pkg.hasVitestTests,
  name: 'coverage:codecov:upload',
  task: () => ({
    cache: false,
    env: ['CI', 'CODECOV_TOKEN'],
  }),
};

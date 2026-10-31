import type { Toolchain } from '#src/tasks/toolchain.js';
import { coverageVitestMerge } from '#src/toolchains/vitest/commands/coverage-vitest-merge.js';
import { testVitestE2e } from '#src/toolchains/vitest/commands/test-vitest-e2e.js';
import { testVitestFast } from '#src/toolchains/vitest/commands/test-vitest-fast.js';
import { testVitestSlow } from '#src/toolchains/vitest/commands/test-vitest-slow.js';
import { testVitest, testVitestName } from '#src/toolchains/vitest/commands/test-vitest.js';
import {
  coverageVitestMergeLeaf,
  testVitestE2eLeaf,
  testVitestFastLeaf,
  testVitestSlowLeaf,
} from '#src/toolchains/vitest/leaves.js';

/**
 * The vitest toolchain's `gtb task` subcommands. `test:vitest` runs both
 * buckets for a consumer to invoke by hand, so no leaf generates it.
 */
export const vitestToolchain: Toolchain = {
  registrations: [
    { command: coverageVitestMerge, leaf: coverageVitestMergeLeaf },
    { command: testVitest, name: testVitestName },
    { command: testVitestE2e, leaf: testVitestE2eLeaf },
    { command: testVitestFast, leaf: testVitestFastLeaf },
    { command: testVitestSlow, leaf: testVitestSlowLeaf },
  ],
};

import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { testVitestE2eLeaf } from '#src/toolchains/vitest/leaves.js';

/**
 * Runs end-to-end tests via Vitest with the e2e config.
 */
export const testVitestE2e = defineCommand({
  meta: {
    description: 'Run end-to-end tests via Vitest (vitest.config.e2e.ts)',
    name: testVitestE2eLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('vitest', {
      args: [
        'run', '--config', 'vitest.config.e2e.ts',
        '--outputFile.blob=dist/test-results/vitest/blob-e2e.json',
        ...rawArgs,
      ],
    });
  },
});

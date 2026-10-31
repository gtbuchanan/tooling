import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';

/**
 * Runs ESLint with caching and zero-warning threshold.
 */
export const lintEslint = defineCommand({
  meta: {
    description: 'Run ESLint with caching and --max-warnings=0',
    name: lintEslintLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('eslint', {
      args: [
        '--cache', '--cache-location', 'dist/.eslintcache',
        '--max-warnings=0',
        ...rawArgs,
      ],
    });
  },
});

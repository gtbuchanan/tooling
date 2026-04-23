import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Runs ESLint with caching and zero-warning threshold. */
export const lintEslint = defineCommand({
  meta: {
    description: 'Run ESLint with caching and --max-warnings=0',
    name: 'lint:eslint',
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

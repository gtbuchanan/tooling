import { fileURLToPath } from 'node:url';
import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/**
 * The SARIF-writing formatter, resolved through the package's own export
 * map so the same specifier works from TS source (self-host) and the
 * compiled publish layout.
 */
const formatterPath = fileURLToPath(
  import.meta.resolve('@gtbuchanan/cli/eslint-sarif-formatter'),
);

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
        '--format', formatterPath,
        ...rawArgs,
      ],
    });
  },
});

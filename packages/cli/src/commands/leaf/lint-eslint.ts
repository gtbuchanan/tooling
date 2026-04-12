import type { RunCommandDef } from '../types.ts';

/** Runs ESLint with caching and zero-warning threshold. */
export const def = {
  args: ['--cache', '--cache-location', 'dist/.eslintcache', '--max-warnings=0'],
  bin: 'eslint',
  name: 'lint:eslint',
} as const satisfies RunCommandDef;

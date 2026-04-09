import type { RunCommandDef } from '../types.ts';

/** Runs ESLint with zero-warning threshold. */
export const def = {
  args: ['--max-warnings=0'],
  bin: 'eslint',
  name: 'lint:eslint',
} as const satisfies RunCommandDef;

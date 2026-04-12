import type { RunCommandDef } from '../types.ts';

/** Installs pre-commit hooks via prek. */
export const def = {
  args: ['install'],
  bin: 'prek',
  name: 'prepare',
} as const satisfies RunCommandDef;

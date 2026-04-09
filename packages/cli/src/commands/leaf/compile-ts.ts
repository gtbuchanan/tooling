import type { RunCommandDef } from '../types.ts';

/** Runs `tsc -b` with optional pass-through args. */
export const def = {
  args: ['-b'],
  bin: 'tsc',
  name: 'compile:ts',
} as const satisfies RunCommandDef;

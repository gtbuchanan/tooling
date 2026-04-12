import type { RunCommandDef } from '../types.ts';

/** Runs `tsc --noEmit` for type-checking with optional pass-through args. */
export const def = {
  args: ['--noEmit'],
  bin: 'tsc',
  name: 'typecheck:ts',
} as const satisfies RunCommandDef;

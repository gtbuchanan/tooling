import type { RunCommandDef } from '../types.ts';

/** Runs `tsc -p tsconfig.build.json` to emit compiled output. */
export const def = {
  args: ['-p', 'tsconfig.build.json'],
  bin: 'tsc',
  name: 'compile:ts',
} as const satisfies RunCommandDef;

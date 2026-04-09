import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs `tsc -b` with optional pass-through args. */
export const def = {
  handler: async (args) => {
    await run('tsc', { args: ['-b', ...args] });
  },
  name: 'compile:ts',
} as const satisfies LeafCommandDef;

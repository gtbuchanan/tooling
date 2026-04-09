import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs all source tests via Vitest. */
export const def = {
  handler: async (args) => {
    await run('vitest', { args: ['run', ...args] });
  },
  name: 'test:vitest',
} as const satisfies LeafCommandDef;

import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs slow source tests via Vitest (only tests tagged slow). */
export const def = {
  handler: async (args) => {
    await run('vitest', { args: ['run', '--tags-filter=slow', '--pass-with-no-tests', ...args] });
  },
  name: 'test:vitest:slow',
} as const satisfies LeafCommandDef;

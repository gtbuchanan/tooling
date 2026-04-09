import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs fast source tests via Vitest (excludes tests tagged slow). */
export const def = {
  handler: async (args) => {
    await run('vitest', { args: ['run', '--tags-filter=!slow', ...args] });
  },
  name: 'test:vitest:fast',
} as const satisfies LeafCommandDef;

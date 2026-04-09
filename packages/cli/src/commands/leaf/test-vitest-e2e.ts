import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs end-to-end tests via Vitest with the e2e config. */
export const def = {
  handler: async (args) => {
    await run('vitest', { args: ['run', '--config', 'vitest.config.e2e.ts', ...args] });
  },
  name: 'test:vitest:e2e',
} as const satisfies LeafCommandDef;

import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs oxlint. */
export const def = {
  handler: async (args) => {
    await run('oxlint', { args });
  },
  name: 'lint:oxlint',
} as const satisfies LeafCommandDef;

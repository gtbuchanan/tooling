import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Installs pre-commit hooks via prek. */
export const def = {
  handler: async (args) => {
    await run('prek', { args: ['install', ...args] });
  },
  name: 'prepare',
} as const satisfies LeafCommandDef;

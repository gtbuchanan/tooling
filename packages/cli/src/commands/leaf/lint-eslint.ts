import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs ESLint with zero-warning threshold. */
export const def = {
  handler: async (args) => {
    await run('eslint', { args: ['--max-warnings=0', ...args] });
  },
  name: 'lint:eslint',
} as const satisfies LeafCommandDef;

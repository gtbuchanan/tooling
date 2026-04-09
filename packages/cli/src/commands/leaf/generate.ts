import { run } from '../../lib/process.ts';
import type { LeafCommandDef } from '../types.ts';

/** Runs per-package generate scripts (code generation, i18n compilation, etc.). */
export const def = {
  handler: async (args) => {
    await run('pnpm', { args: ['-r', '--if-present', 'run', 'generate', ...args] });
  },
  name: 'generate',
} as const satisfies LeafCommandDef;

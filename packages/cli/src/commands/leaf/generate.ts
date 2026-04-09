import type { RunCommandDef } from '../types.ts';

/** Runs per-package generate scripts (code generation, i18n compilation, etc.). */
export const def = {
  args: ['-r', '--if-present', 'run', 'generate'],
  bin: 'pnpm',
  name: 'generate',
} as const satisfies RunCommandDef;

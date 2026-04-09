import { run } from '../../lib/process.ts';
import type { Invoke } from '../types.ts';

/** Compiles TypeScript and runs per-package compile scripts. */
export const def = {
  name: 'compile',
  resolve: (invoke: Invoke) => async () => {
    await invoke('compile:ts');
    await run('pnpm', { args: ['-r', '--if-present', 'run', 'compile'] });
  },
} as const;

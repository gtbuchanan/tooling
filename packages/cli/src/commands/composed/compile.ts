import { run } from '../../lib/process.ts';
import { compileTs } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';

/** Compiles TypeScript and runs per-package compile scripts. */
export const def = {
  name: 'compile',
  resolve: (invoke: Invoke) => async () => {
    await invoke(compileTs);
    await run('pnpm', { args: ['-r', '--if-present', 'run', 'compile'] });
  },
} as const;

import type { Scripts } from '../../lib/hook.ts';
import { runParallel } from '../../lib/process.ts';
import type { Invoke } from '../types.ts';
import { lintParallelCmds } from './parallel.ts';

/** Runs oxlint and ESLint in parallel. */
export const def = {
  name: 'lint',
  resolve: (_invoke: Invoke, scripts: Scripts) => async () => {
    await runParallel(lintParallelCmds(scripts));
  },
} as const;

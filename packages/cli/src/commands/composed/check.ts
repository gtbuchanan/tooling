import { type Scripts, resolveParallelCommand } from '../../lib/hook.ts';
import { runParallel } from '../../lib/process.ts';
import type { Invoke } from '../types.ts';
import { def as compileDef } from './compile.ts';
import { lintParallelCmds } from './parallel.ts';
import { def as testFastDef } from './test-fast.ts';

/** Compiles, then lints and runs fast tests in parallel. */
export const def = {
  name: 'check',
  resolve: (invoke: Invoke, scripts: Scripts) => async () => {
    await invoke(compileDef);
    await runParallel([
      ...lintParallelCmds(scripts),
      resolveParallelCommand(scripts, testFastDef, 'vitest run --tags-filter=!slow'),
    ]);
  },
} as const;

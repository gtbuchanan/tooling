import { type Scripts, resolveParallelCommand, toCommandString } from '../../lib/hook.ts';
import { runParallel } from '../../lib/process.ts';
import { testVitestFast } from '../leaf/index.ts';
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
      resolveParallelCommand(scripts, testFastDef, toCommandString(testVitestFast)),
    ]);
  },
} as const;

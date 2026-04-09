import { type Scripts, resolveParallelCommand } from '../../lib/hook.ts';
import { runParallel } from '../../lib/process.ts';
import { pack } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';
import { def as checkDef } from './check.ts';
import { def as testE2eDef } from './test-e2e.ts';
import { def as testSlowDef } from './test-slow.ts';

/** Full build: check, then slow tests + pack in parallel, then e2e. */
export const def = {
  name: 'build',
  resolve: (invoke: Invoke, scripts: Scripts) => async () => {
    await invoke(checkDef);
    await runParallel([
      resolveParallelCommand(
        scripts, testSlowDef, 'vitest run --tags-filter=slow --pass-with-no-tests',
      ),
      resolveParallelCommand(scripts, pack, 'gtb pack'),
    ]);
    await invoke(testE2eDef);
  },
} as const;

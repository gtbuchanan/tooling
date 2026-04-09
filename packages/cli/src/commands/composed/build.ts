import { type Scripts, resolveParallelCommand } from '../../lib/hook.ts';
import { runParallel } from '../../lib/process.ts';
import type { Invoke } from '../types.ts';

/** Full build: check, then slow tests + pack in parallel, then e2e. */
export const def = {
  name: 'build',
  resolve: (invoke: Invoke, scripts: Scripts) => async () => {
    await invoke('check');
    await runParallel([
      resolveParallelCommand(
        scripts, 'test:slow', 'vitest run --tags-filter=slow --pass-with-no-tests',
      ),
      resolveParallelCommand(scripts, 'pack', 'gtb pack'),
    ]);
    await invoke('test:e2e');
  },
} as const;

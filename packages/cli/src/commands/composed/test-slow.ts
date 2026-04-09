import { testVitestSlow } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';

/** Alias for `test:vitest:slow`. Runs slow source tests. */
export const def = {
  name: 'test:slow',
  resolve: (invoke: Invoke) => async () => {
    await invoke(testVitestSlow);
  },
} as const;

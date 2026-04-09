import { testVitestFast } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';

/** Alias for `test:vitest:fast`. Runs fast source tests. */
export const def = {
  name: 'test:fast',
  resolve: (invoke: Invoke) => async () => {
    await invoke(testVitestFast);
  },
} as const;

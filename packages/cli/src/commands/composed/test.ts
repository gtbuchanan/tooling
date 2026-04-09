import { testVitest } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';

/** Alias for `test:vitest`. Runs all source tests. */
export const def = {
  name: 'test',
  resolve: (invoke: Invoke) => async () => {
    await invoke(testVitest);
  },
} as const;

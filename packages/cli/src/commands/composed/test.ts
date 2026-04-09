import type { Invoke } from '../types.ts';

/** Alias for `test:vitest`. Runs all source tests. */
export const def = {
  name: 'test',
  resolve: (invoke: Invoke) => async () => {
    await invoke('test:vitest');
  },
} as const;

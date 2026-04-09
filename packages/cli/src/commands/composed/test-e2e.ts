import type { Invoke } from '../types.ts';

/** Alias for `test:vitest:e2e`. Runs end-to-end tests. */
export const def = {
  name: 'test:e2e',
  resolve: (invoke: Invoke) => async () => {
    await invoke('test:vitest:e2e');
  },
} as const;

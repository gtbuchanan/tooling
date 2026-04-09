import type { Invoke } from '../types.ts';

/** Alias for `test:vitest:slow`. Runs slow source tests. */
export const def = {
  name: 'test:slow',
  resolve: (invoke: Invoke) => async () => {
    await invoke('test:vitest:slow');
  },
} as const;

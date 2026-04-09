import type { Invoke } from '../types.ts';

/** Alias for `test:vitest:fast`. Runs fast source tests. */
export const def = {
  name: 'test:fast',
  resolve: (invoke: Invoke) => async () => {
    await invoke('test:vitest:fast');
  },
} as const;

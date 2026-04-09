import type { Invoke } from '../types.ts';

/** CI pipeline: check then pack (slow and e2e are separate CI jobs). */
export const def = {
  name: 'build:ci',
  resolve: (invoke: Invoke) => async () => {
    await invoke('check');
    await invoke('pack');
  },
} as const;

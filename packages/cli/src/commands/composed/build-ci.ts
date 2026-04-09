import { pack } from '../leaf/index.ts';
import type { Invoke } from '../types.ts';
import { def as checkDef } from './check.ts';

/** CI pipeline: check then pack (slow and e2e are separate CI jobs). */
export const def = {
  name: 'build:ci',
  resolve: (invoke: Invoke) => async () => {
    await invoke(checkDef);
    await invoke(pack);
  },
} as const;

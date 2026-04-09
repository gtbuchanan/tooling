import type { RunCommandDef } from '../types.ts';

/** Runs all source tests via Vitest. */
export const def = {
  args: ['run'],
  bin: 'vitest',
  name: 'test:vitest',
} as const satisfies RunCommandDef;

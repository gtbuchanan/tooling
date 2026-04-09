import type { RunCommandDef } from '../types.ts';

/** Runs slow source tests via Vitest (only tests tagged `slow`). */
export const def = {
  args: ['run', '--tags-filter=slow', '--pass-with-no-tests'],
  bin: 'vitest',
  name: 'test:vitest:slow',
} as const satisfies RunCommandDef;

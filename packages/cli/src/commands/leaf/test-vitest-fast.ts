import type { RunCommandDef } from '../types.ts';

/** Runs fast source tests via Vitest (excludes tests tagged `slow`). */
export const def = {
  args: ['run', '--tags-filter=!slow'],
  bin: 'vitest',
  name: 'test:vitest:fast',
} as const satisfies RunCommandDef;

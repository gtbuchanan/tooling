import type { RunCommandDef } from '../types.ts';

/** Runs oxlint. */
export const def = {
  args: [],
  bin: 'oxlint',
  name: 'lint:oxlint',
} as const satisfies RunCommandDef;

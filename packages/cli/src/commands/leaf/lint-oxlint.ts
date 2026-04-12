import type { RunCommandDef } from '../types.ts';

/** Runs oxlint with nested config disabled (per-package config is authoritative). */
export const def = {
  args: ['--disable-nested-config'],
  bin: 'oxlint',
  name: 'lint:oxlint',
} as const satisfies RunCommandDef;

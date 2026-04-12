import { turboCheck } from '../turbo-check.ts';
import type { CustomCommandDef } from '../types.ts';

/** Validates project config against expected baseline from discovery. */
export const def = {
  handler: turboCheck,
  name: 'turbo:check',
} as const satisfies CustomCommandDef;

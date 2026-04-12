import { turboInit } from '../turbo-init.ts';
import type { CustomCommandDef } from '../types.ts';

/** Generates turbo.json and per-package scripts from project discovery. */
export const def = {
  handler: turboInit,
  name: 'turbo:init',
} as const satisfies CustomCommandDef;

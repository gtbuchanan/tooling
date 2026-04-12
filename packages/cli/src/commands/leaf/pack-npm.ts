import { packNpm } from '../pack.ts';
import type { CustomCommandDef } from '../types.ts';

/** Generates manifests and packs publishable packages into tarballs. */
export const def = {
  handler: packNpm,
  name: 'pack:npm',
} as const satisfies CustomCommandDef;

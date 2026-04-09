import { pack } from '../../lib/pack.ts';
import type { LeafCommandDef } from '../types.ts';

/** Generates manifests and packs all publishable packages into tarballs. */
export const def = {
  handler: () => {
    pack();
  },
  name: 'pack',
} as const satisfies LeafCommandDef;

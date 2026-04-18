import { pipeline } from '../pipeline.ts';
import type { CustomCommandDef } from '../types.ts';

/** Runs a turbo-style task pipeline without the turbo binary. */
export const def = {
  handler: pipeline,
  name: 'pipeline',
} as const satisfies CustomCommandDef;

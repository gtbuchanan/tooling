import { run } from '../lib/process.ts';
import * as leaf from './leaf/index.ts';
import type { CommandHandler, LeafCommandDef } from './types.ts';

/** Derives a handler from a leaf def (run-based or custom). */
const toHandler = (def: LeafCommandDef): CommandHandler =>
  'handler' in def
    ? def.handler
    : async (args) => { await run(def.bin, { args: [...def.args, ...args] }); };

/**
 * Command registry mapping CLI names to handler functions.
 *
 * Built from barrel re-exports — adding a command file and its barrel
 * entry automatically extends the registry.
 */
export const commands: Record<string, CommandHandler> = Object.fromEntries(
  Object.values(leaf).map(def => [def.name, toHandler(def)]),
);

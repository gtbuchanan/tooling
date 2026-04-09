import { type CommandHandler, type Scripts, resolveStep } from '../lib/hook.ts';
import { run } from '../lib/process.ts';
import * as composed from './composed/index.ts';
import * as leaf from './leaf/index.ts';
import type { LeafCommandDef } from './types.ts';

/** Command registry mapping CLI names to handler functions. */
export type CommandRegistry = Record<string, CommandHandler>;

/** Derives a handler from a leaf def (run-based or custom). */
const toHandler = (def: LeafCommandDef): CommandHandler =>
  'handler' in def
    ? def.handler
    : async (args) => { await run(def.bin, { args: [...def.args, ...args] }); };

/**
 * Builds the command registry with hook resolution applied.
 * Consumer `gtb:<step>` scripts in root package.json replace default steps.
 *
 * Types are derived from the barrel re-exports — adding a command file
 * and its barrel entry automatically extends the registry.
 */
export const createCommands = (scripts: Scripts): CommandRegistry => {
  const registry: CommandRegistry = {};

  const invoke = async (command: { readonly name: string }): Promise<void> => {
    const handler = registry[command.name];
    if (handler === undefined) {
      throw new Error(`Command '${command.name}' is not registered`);
    }
    await handler([]);
  };

  for (const def of Object.values(leaf)) {
    registry[def.name] = resolveStep(scripts, def.name, toHandler(def));
  }

  for (const def of Object.values(composed)) {
    registry[def.name] = resolveStep(
      scripts, def.name, def.resolve(invoke, scripts),
    );
  }

  return registry;
};

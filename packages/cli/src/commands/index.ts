import { type CommandHandler, type Scripts, resolveStep } from '../lib/hook.ts';
import * as composed from './composed/index.ts';
import * as leaf from './leaf/index.ts';

/** Command registry mapping CLI names to handler functions. */
export type CommandRegistry = Record<string, CommandHandler>;

/**
 * Builds the command registry with hook resolution applied.
 * Consumer `gtb:<step>` scripts in root package.json replace default steps.
 *
 * Types are derived from the barrel re-exports — adding a command file
 * and its barrel entry automatically extends the registry.
 */
export const createCommands = (scripts: Scripts): CommandRegistry => {
  const registry: CommandRegistry = {};

  const invoke = async (name: string): Promise<void> => {
    const handler = registry[name];
    if (handler === undefined) {
      throw new Error(`Command '${name}' is not registered`);
    }
    await handler([]);
  };

  for (const def of Object.values(leaf)) {
    registry[def.name] = resolveStep(scripts, def.name, def.handler);
  }

  for (const def of Object.values(composed)) {
    registry[def.name] = resolveStep(
      scripts, def.name, def.resolve(invoke, scripts),
    );
  }

  return registry;
};

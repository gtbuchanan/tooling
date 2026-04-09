import * as v from 'valibot';
import { type ParallelCommand, run } from './process.ts';
import { readManifest, resolveRootDir } from './workspace.ts';

/** Mapping of script names to their command strings. */
export type Scripts = Readonly<Record<string, string>>;

/** Options for {@link readRootScripts}. */
export interface ReadRootScriptsOptions {
  /** Directory to search from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

const ManifestSchema = v.object({
  scripts: v.optional(v.nullable(v.record(v.string(), v.string()))),
});

/**
 * Reads scripts from the workspace root package.json.
 * Locates the root via pnpm-workspace.yaml; falls back to cwd.
 */
export const readRootScripts = (options?: ReadRootScriptsOptions): Scripts => {
  try {
    const { scripts } = v.parse(ManifestSchema, readManifest(resolveRootDir(options)));
    return scripts ?? {};
  } catch {
    return {};
  }
};

const hookScriptName = (step: string): string => `gtb:${step}`;

/** Returns true if a `gtb:<step>` script is defined. */
export const hasHook = (scripts: Scripts, step: string): boolean =>
  hookScriptName(step) in scripts;

/** Runs a hook script via `pnpm run`. */
export const runHook = async (step: string): Promise<void> => {
  await run('pnpm', { args: ['run', hookScriptName(step)] });
};

/** Command handler that accepts optional CLI args. */
export type CommandHandler = (
  args: readonly string[],
) => Promise<void> | void;

/**
 * Wraps a command handler with hook resolution. If `gtb:<step>` is defined
 * in scripts, returns a handler that runs the hook instead of the default.
 */
export const resolveStep = (
  scripts: Scripts,
  step: string,
  defaultFn: CommandHandler,
): CommandHandler =>
  hasHook(scripts, step) ? () => runHook(step) : defaultFn;

/**
 * Resolves a parallel command through hook resolution. If `gtb:<step>` is
 * defined, substitutes the command string with `pnpm run gtb:<step>`.
 */
export const resolveParallelCommand = (
  scripts: Scripts,
  step: string,
  defaultCommand: string,
): ParallelCommand =>
  hasHook(scripts, step)
    ? { command: `pnpm run ${hookScriptName(step)}`, name: step }
    : { command: defaultCommand, name: step };

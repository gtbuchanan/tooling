import { defineCommand } from 'citty';
import { syncPlans } from '#src/codegen/plans.js';
import { rejectPositionals } from '#src/codegen/positionals.js';
import { workspacePlans } from '#src/codegen/workspace-plans.js';
import { rootNames } from '#src/core/command-names.js';
import { type WorkspaceDiscovery, discoverWorkspace } from '#src/core/discovery.js';
import { type Logger, createLogger } from '#src/core/logger.js';
import { capabilities } from '#src/toolchains/index.js';

/**
 * Options for {@link runSync}.
 */
export interface RunSyncOptions {
  readonly cwd?: string;
  readonly force?: boolean;
  readonly logger?: Logger;
}

/**
 * Reconciles generated config with the current workspace state.
 *
 * Applies every plan's writes: `turbo.json`, per-package tsconfigs,
 * `package.json` scripts, `mise.tasks.toml` (when the repo configures mise),
 * and whatever else the toolchains plan. With `force: false` (default),
 * existing script values are preserved; with `force: true`, they're
 * overwritten. Returns the problems no sync can fix, empty when there are
 * none.
 */
export const runSync = (options: RunSyncOptions = {}): readonly string[] => {
  const cwd = options.cwd ?? process.cwd();
  const discover = (): WorkspaceDiscovery => discoverWorkspace({ capabilities, cwd });

  return syncPlans(workspacePlans, {
    discover,
    discovery: discover(),
    force: options.force ?? false,
    logger: options.logger ?? createLogger(),
  });
};

/**
 * Parsed citty args for {@link sync}.
 */
export interface SyncCommandArgs {
  readonly cwd?: string | undefined;
  readonly force?: boolean | undefined;
  /**
   * Positional arguments (citty `args._`), which the command rejects.
   */
  readonly positionals?: readonly string[] | undefined;
}

/**
 * Translates citty args into {@link RunSyncOptions} and invokes
 * {@link runSync}. Lives between the citty wrapper and the pure
 * function so the args translation is testable without going through
 * citty's `runCommand`. Returns the exit code: 1 on a positional argument, or
 * when the sync leaves a problem only a hand edit fixes.
 */
export const syncCommand = (args: SyncCommandArgs, logger: Logger): number => {
  const rejection = rejectPositionals(rootNames.sync, args.positionals ?? []);
  if (rejection !== undefined) {
    logger.error(rejection);
    return 1;
  }

  const problems = runSync({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    force: args.force ?? false,
    logger,
  });
  for (const message of problems) {
    logger.error(message);
  }

  return problems.length === 0 ? 0 : 1;
};

/**
 * Citty command wrapper for {@link syncCommand}.
 */
export const sync = defineCommand({
  args: {
    cwd: {
      alias: 'C',
      description: 'Workspace root directory (defaults to current working directory)',
      type: 'string',
    },
    force: {
      description: 'Overwrite existing package.json scripts',
      type: 'boolean',
    },
  },
  meta: {
    description: 'Reconcile generated config with the current workspace',
    name: rootNames.sync,
  },
  run: ({ args }) => {
    const exitCode = syncCommand(
      { cwd: args.cwd, force: args.force, positionals: args._ },
      createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});

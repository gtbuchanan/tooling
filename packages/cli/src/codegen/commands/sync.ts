import { defineCommand } from 'citty';
import { syncPlans } from '#src/codegen/plans.js';
import {
  type SyncScope, parseSyncScopes, syncScopes,
} from '#src/codegen/sync-scopes.js';
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
  /**
   * Artifacts to generate. Defaults to all {@link syncScopes}.
   */
  readonly scopes?: ReadonlySet<SyncScope>;
}

/**
 * Reconciles generated config with the current workspace state.
 *
 * Applies every plan's writes: `turbo.json`, per-package tsconfigs,
 * `package.json` scripts, `mise.tasks.toml` (when the root has a `mise.toml`),
 * and whatever else the toolchains plan. With `force: false` (default),
 * existing script values are preserved; with `force: true`, they're
 * overwritten. Returns the problems no sync can fix, empty when there are
 * none.
 */
export const runSync = (options: RunSyncOptions = {}): readonly string[] => {
  const scopes = options.scopes ?? new Set(syncScopes);
  if (!scopes.has('toolchains')) {
    return [];
  }
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
   * Positional scope tokens (citty `args._`). Empty means all scopes.
   */
  readonly scopes?: readonly string[] | undefined;
}

/**
 * Translates citty args into {@link RunSyncOptions} and invokes
 * {@link runSync}. Lives between the citty wrapper and the pure
 * function so the args translation is testable without going through
 * citty's `runCommand`. Returns the exit code: 1 on an unknown scope, or
 * when the sync leaves a problem only a hand edit fixes.
 */
export const syncCommand = (args: SyncCommandArgs, logger: Logger): number => {
  const parsed = parseSyncScopes(args.scopes ?? []);
  if ('errors' in parsed) {
    for (const message of parsed.errors) {
      logger.error(message);
    }

    return 1;
  }

  const problems = runSync({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    force: args.force ?? false,
    logger,
    scopes: parsed.scopes,
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
    description:
      'Reconcile generated config with the current workspace ' +
      `(optionally scope to: ${syncScopes.join(', ')})`,
    name: rootNames.sync,
  },
  run: ({ args }) => {
    const exitCode = syncCommand(
      { cwd: args.cwd, force: args.force, scopes: args._ },
      createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});

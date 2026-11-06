import { defineCommand } from 'citty';
import type { SyncContext } from '#src/codegen/generator.js';
import { generators } from '#src/codegen/generators/index.js';
import {
  type SyncScope, parseSyncScopes, syncScopes,
} from '#src/codegen/sync-scopes.js';
import { rootNames } from '#src/core/command-names.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { type Logger, createLogger } from '#src/core/logger.js';
import { capabilities } from '#src/toolchains/index.js';

/*
 * Scripts and turbo tasks are built from what every other step leaves
 * behind, so they run last and see those steps' writes.
 */
const builtFromTheRest: ReadonlySet<SyncScope> = new Set(['scripts', 'turbo']);

const syncOrder: readonly SyncScope[] = [
  ...syncScopes.filter(scope => !builtFromTheRest.has(scope)),
  ...builtFromTheRest,
];

/**
 * Options for {@link runSync}.
 */
export interface RunSyncOptions {
  readonly cwd?: string;
  readonly force?: boolean;
  readonly logger?: Logger;
  /**
   * Artifacts to generate. Defaults to all {@link SYNC_SCOPES}.
   */
  readonly scopes?: ReadonlySet<SyncScope>;
}

/**
 * Reconciles generated config with the current workspace state.
 *
 * Writes the artifacts selected by `scopes` (default all): `turbo.json`,
 * per-package tsconfigs, `package.json` scripts, `mise.tasks.toml` (when the
 * root has a `mise.toml`), and whatever the toolchains plan. With `force: false`
 * (default), existing script values are preserved; with `force: true`,
 * they're overwritten.
 */
export const runSync = (options: RunSyncOptions = {}): void => {
  const scopes = options.scopes ?? new Set(syncScopes);
  const cwd = options.cwd ?? process.cwd();
  const isForce = options.force ?? false;
  const logger = options.logger ?? createLogger();

  /*
   * Each step discovers afresh, because an earlier step's write can change
   * what discovery finds: the root tsconfig gives a single-package root the
   * typescript capability its scripts and turbo tasks follow from.
   */
  for (const scope of syncOrder) {
    if (!scopes.has(scope)) {
      continue;
    }

    const context: SyncContext = {
      discovery: discoverWorkspace({ capabilities, cwd }), force: isForce, logger,
    };
    generators[scope].sync?.(context);
  }
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
 * citty's `runCommand`. Returns the exit code (1 on an unknown scope).
 */
export const syncCommand = (args: SyncCommandArgs, logger: Logger): number => {
  const parsed = parseSyncScopes(args.scopes ?? []);
  if ('errors' in parsed) {
    for (const message of parsed.errors) {
      logger.error(message);
    }

    return 1;
  }

  runSync({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    force: args.force ?? false,
    logger,
    scopes: parsed.scopes,
  });

  return 0;
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
